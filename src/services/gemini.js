'use strict';

const { GoogleGenAI } = require('@google/genai');
const defaults = require('../config/defaults');
const ApiKeyPool = require('../utils/apiKeyPool');
const { isRotatableFailure } = require('../utils/errorClassification');
const { buildSystemInstruction } = require('../config/behavior');

/**
 * Handles all communication with the Gemini API: building requests,
 * injecting the persona and internal behavior layer, and managing
 * automatic API key failover.
 */
class GeminiService {
  /**
   * @param {string[]} apiKeys
   * @param {string} persona
   */
  constructor(apiKeys, persona) {
    if (!persona || typeof persona !== 'string') {
      throw new Error('GeminiService: a persona string is required.');
    }

    this._keyPool = new ApiKeyPool(apiKeys);
    this._systemInstruction = buildSystemInstruction(persona);

    // One GoogleGenAI client per key, created once and reused across requests.
    this._clients = new Map(); // index -> GoogleGenAI instance
    apiKeys.forEach((key, index) => {
      this._clients.set(index, new GoogleGenAI({ apiKey: key }));
    });
  }

  /**
   * Runs a Gemini generateContent call with automatic key failover.
   * Tries each currently-eligible key in order; a key that fails with a
   * rotatable status is blacklisted (temporarily) and the next eligible
   * key is tried. Non-rotatable errors (400/404) propagate immediately.
   *
   * @param {object} params - Params forwarded to models.generateContent,
   *   minus the model's config.apiKey (handled internally).
   * @returns {Promise<{response: object, apiKeyIndex: number, keysTriedThisRequest: number, rotated: boolean}>}
   * @private
   */
  async _generateWithFailover(params) {
    const eligibleKeys = this._keyPool.getEligibleKeys();

    if (eligibleKeys.length === 0) {
      throw new Error(
        'PersonaCore: all configured Gemini API keys are currently unavailable (rate limited or blacklisted). Try again later.'
      );
    }

    let lastError = null;
    let keysTried = 0;

    for (const { index } of eligibleKeys) {
      keysTried += 1;
      const client = this._clients.get(index);

      try {
        const response = await client.models.generateContent(params);
        return {
          response,
          apiKeyIndex: index,
          keysTriedThisRequest: keysTried,
          rotated: keysTried > 1,
        };
      } catch (err) {
        if (!isRotatableFailure(err)) {
          throw new Error(`PersonaCore: Gemini request failed. ${err.message}`);
        }

        this._keyPool.blacklist(index);
        lastError = err;
        // Continue to the next eligible key.
      }
    }

    throw new Error(
      `PersonaCore: all available Gemini API keys failed for this request. Last error: ${lastError ? lastError.message : 'unknown'}`
    );
  }

  /**
   * Generates a conversational text/vision response.
   *
   * @param {Array<{role: string, parts: Array<object>}>} contents - Full
   *   conversation contents in Gemini's Content[] format, including the
   *   latest user turn.
   * @returns {Promise<{text: string, usageMetadata: object, finishReason: string, apiKeyIndex: number, keysTriedThisRequest: number, rotated: boolean}>}
   */
  async generateReply(contents) {
    const { response, apiKeyIndex, keysTriedThisRequest, rotated } = await this._generateWithFailover({
      model: defaults.MODELS.TEXT_AND_VISION,
      contents,
      config: {
        systemInstruction: this._systemInstruction,
      },
    });

    const candidate = response.candidates && response.candidates[0];

    return {
      text: response.text || '',
      usageMetadata: response.usageMetadata || null,
      finishReason: candidate ? candidate.finishReason : null,
      apiKeyIndex,
      keysTriedThisRequest,
      rotated,
    };
  }

  /**
   * Transcribes an audio buffer to text (used by speech recognition).
   *
   * @param {Buffer} audioBuffer
   * @param {string} mimeType
   * @returns {Promise<{text: string, apiKeyIndex: number, keysTriedThisRequest: number, rotated: boolean}>}
   */
  async transcribeAudio(audioBuffer, mimeType) {
    const { response, apiKeyIndex, keysTriedThisRequest, rotated } = await this._generateWithFailover({
      model: defaults.MODELS.SPEECH_RECOGNITION,
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Transcribe this audio clip. Return only the spoken words, with no commentary.' },
            { inlineData: { mimeType, data: audioBuffer.toString('base64') } },
          ],
        },
      ],
    });

    return {
      text: (response.text || '').trim(),
      apiKeyIndex,
      keysTriedThisRequest,
      rotated,
    };
  }

  /**
   * Generates spoken audio for a piece of text (raw PCM from Gemini TTS).
   * Transcoding to the SDK's public output format happens in voiceOutput.js.
   *
   * @param {string} text
   * @returns {Promise<{audioBuffer: Buffer, mimeType: string, apiKeyIndex: number, keysTriedThisRequest: number, rotated: boolean}>}
   */
  async synthesizeSpeech(text) {
    const { response, apiKeyIndex, keysTriedThisRequest, rotated } = await this._generateWithFailover({
      model: defaults.MODELS.VOICE_OUTPUT,
      contents: [{ role: 'user', parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: defaults.VOICE_OUTPUT.TTS_VOICE_NAME },
          },
        },
      },
    });

    const parts = response.candidates && response.candidates[0] && response.candidates[0].content
      ? response.candidates[0].content.parts
      : [];
    const audioPart = (parts || []).find((part) => part.inlineData && part.inlineData.mimeType);

    if (!audioPart) {
      throw new Error('PersonaCore: Gemini TTS did not return audio data.');
    }

    return {
      audioBuffer: Buffer.from(audioPart.inlineData.data, 'base64'),
      mimeType: audioPart.inlineData.mimeType,
      apiKeyIndex,
      keysTriedThisRequest,
      rotated,
    };
  }
}

module.exports = GeminiService;
