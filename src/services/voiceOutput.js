'use strict';

const defaults = require('../config/defaults');
const { pcmToOggOpus, parseSampleRate } = require('../utils/audioTranscoder');

/**
 * Voice output feature service. Enabled via ai.useVoiceOutput().
 *
 * `probability` gates whether audio is generated at all for a given
 * response: a random roll against the configured probability decides
 * per-message whether TTS runs (confirmed requirement). When it does run,
 * Gemini's raw PCM output is transcoded to OGG/Opus before being returned.
 */
class VoiceOutputService {
  /**
   * @param {import('./gemini')} geminiService
   * @param {{probability?: number, includeText?: boolean}} [options]
   */
  constructor(geminiService, options = {}) {
    this._gemini = geminiService;
    this._probability =
      typeof options.probability === 'number'
        ? options.probability
        : defaults.VOICE_OUTPUT.PROBABILITY_VOICE_ONLY;
    this._includeText =
      typeof options.includeText === 'boolean' ? options.includeText : defaults.VOICE_OUTPUT.INCLUDE_TEXT;
  }

  /**
   * Rolls against the configured probability to decide whether this
   * response should include generated audio.
   * @returns {boolean}
   */
  shouldGenerateAudio() {
    return Math.random() < this._probability;
  }

  /**
   * @returns {boolean} whether text should be included alongside audio.
   */
  shouldIncludeText() {
    return this._includeText;
  }

/**
   * Generates OGG/Opus audio for the given text via Gemini TTS.
   * @param {string} text
   * @returns {Promise<object>} On success: {success: true, audioBuffer,
   *   mimeType, apiKeyIndex, keysTriedThisRequest, rotated}. On failure:
   *   {success: false, error, metadata} (passed through from synthesizeSpeech).
   */
  async generate(text) {
    const result = await this._gemini.synthesizeSpeech(text);

    if (!result.success) {
      return result;
    }

    const { audioBuffer, mimeType, apiKeyIndex, keysTriedThisRequest, rotated } = result;

    const sampleRate = parseSampleRate(mimeType);
    const oggOpusBuffer = await pcmToOggOpus(audioBuffer, sampleRate);

    return {
      success: true,
      audioBuffer: oggOpusBuffer,
      mimeType: defaults.VOICE_OUTPUT.OUTPUT_MIME_TYPE,
      apiKeyIndex,
      keysTriedThisRequest,
      rotated,
    };
  }
}

module.exports = VoiceOutputService;
