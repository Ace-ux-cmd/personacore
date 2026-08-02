"use strict";

const GeminiService = require("../services/gemini");
const MemoryService = require("../services/memory");
const VisionService = require("../services/vision");
const SpeechRecognitionService = require("../services/speechRecognition");
const VoiceOutputService = require("../services/voiceOutput");
const defaults = require("../config/defaults");

/**
 * PersonaCore's main entry point.
 *
 * Coordinates the feature services (memory, vision, speech recognition,
 * voice output) and the Gemini service, but contains no Gemini-specific
 * or storage-specific logic itself: it only orchestrates.
 */
class AI {
  /**
   * @param {{apiKeys: string[], persona: string, historyLimit?: number}} config
   */
  constructor(config) {
    if (!config || typeof config !== "object") {
      throw new Error("PersonaCore: a configuration object is required.");
    }

    const { apiKeys, persona, historyLimit } = config;

    if (
      !Array.isArray(apiKeys) ||
      apiKeys.length === 0 ||
      apiKeys.some((k) => typeof k !== "string" || !k)
    ) {
      throw new Error(
        'PersonaCore: "apiKeys" must be a non-empty array of Gemini API key strings.',
      );
    }

    if (!persona || typeof persona !== "string") {
      throw new Error(
        'PersonaCore: "persona" is required and must be a string.',
      );
    }

    if (
      historyLimit !== undefined &&
      (typeof historyLimit !== "number" || historyLimit <= 0)
    ) {
      throw new Error('PersonaCore: "historyLimit" must be a positive number.');
    }

    this._gemini = new GeminiService(apiKeys, persona);
    this._memory = new MemoryService(historyLimit);
    this._historyLimit =
      typeof historyLimit === "number" ? historyLimit : defaults.HISTORY_LIMIT;

    // Optional feature services; null until explicitly enabled.
    this._vision = null;
    this._speechRecognition = null;
    this._voiceOutput = null;
  }

  /**
   * Enables persistent conversation history via MongoDB.
   * @param {string} mongoUri
   */
  useMemory(mongoUri) {
    if (!mongoUri || typeof mongoUri !== "string") {
      throw new Error(
        "PersonaCore: useMemory() requires a valid MongoDB connection string.",
      );
    }
    const collectionName = `personacore_history`;
    this._memory.useMongo(mongoUri, collectionName);
  }

  /**
   * Enables image understanding.
   */
  useVision() {
    this._vision = new VisionService();
  }

  /**
   * Enables voice input transcription.
   */
  useSpeechRecognition() {
    this._speechRecognition = new SpeechRecognitionService(this._gemini);
  }

  /**
   * Enables voice output generation.
   * @param {{includeText?: boolean, probability?: number}} [options]
   */
  useVoiceOutput(options = {}) {
    if (options.probability !== undefined) {
      if (
        typeof options.probability !== "number" ||
        options.probability < 0 ||
        options.probability > 1
      ) {
        throw new Error(
          'PersonaCore: "probability" must be a number between 0 and 1.',
        );
      }
    }
    if (
      options.includeText !== undefined &&
      typeof options.includeText !== "boolean"
    ) {
      throw new Error('PersonaCore: "includeText" must be a boolean.');
    }

    // Resolve the default probability based on includeText
    // only when the caller didn't explicitly provide one.
    const includeText = options.includeText === true;
    const probability =
      options.probability !== undefined
        ? options.probability
        : includeText
          ? defaults.VOICE_OUTPUT.PROBABILITY_VOICE_AND_TEXT
          : defaults.VOICE_OUTPUT.PROBABILITY_VOICE_ONLY;

    this._voiceOutput = new VoiceOutputService(this._gemini, {
      probability,
      includeText,
    });
  }

  /**
   * Processes a conversation request.
   *
   * @param {{userId: string, text?: string, image?: Buffer, voice?: Buffer}} request
   * @returns {Promise<object>} Response object; shape depends on enabled features.
   */
  async handleMessage(request) {
    const startTime = Date.now();

    this._validateHandleMessageRequest(request);
    const { userId, text, image, voice } = request;

    // - Resolve the effective text input, transcribing voice first if present.
    let effectiveText = text;
    let sttMetadata = null;

    if (voice) {
      if (!this._speechRecognition) {
        throw new Error(
          "PersonaCore: voice input requires useSpeechRecognition() to be enabled.",
        );
      }
      const transcription = await this._speechRecognition.transcribe(voice);
      effectiveText = transcription.text;
      sttMetadata = transcription;
    }

    if (image && !this._vision) {
      throw new Error(
        "PersonaCore: image input requires useVision() to be enabled.",
      );
    }

    // - Retrieve recent history for this user.
    let history;
    try {
      history = await this._memory.getRecentHistoryForModel(userId);
    } catch (err) {
      return this._storageFailureResponse(err, startTime);
    }
    const contents = this._buildContents(history, effectiveText, image);

    //- Generate the conversational reply.
    const reply = await this._gemini.generateReply(contents);

    if (!reply.success) {
      // Nothing is persisted to history on failure, there's no model
      // turn to save, and re-saving the user's turn alone would desync
      // user/model pairs in history.
      return {
        success: false,
        error: reply.error,
        metadata: { ...reply.metadata, responseTime: Date.now() - startTime },
      };
    }

    // - Persist both turns, The stored user turn is always text,
    //    the transcription if voice was used, or the raw text otherwise.
    try {
      await this._memory.saveMessage(userId, {
        role: "user",
        text: effectiveText || "",
      });
      await this._memory.saveMessage(userId, { role: "model", text: reply.text });
    } catch (err) {
      // The model reply itself succeeded (we have reply.apiKeyIndex/rotated),
      // so that rotation info is still reported even though persistence failed.
      return this._storageFailureResponse(err, startTime, reply);
    }

    // 5. Optionally generate voice output.
    let voiceOutputResult = null;
    if (this._voiceOutput && this._voiceOutput.shouldGenerateAudio()) {
      voiceOutputResult = await this._voiceOutput.generate(reply.text);

      if (!voiceOutputResult.success) {
        return {
          success: false,
          error: voiceOutputResult.error,
          metadata: {
            ...voiceOutputResult.metadata,
            responseTime: Date.now() - startTime,
          },
        };
      }
    }

    return this._buildResponse({
      reply,
      sttMetadata,
      voiceOutputResult,
      startTime,
    });
  }

  /**
   * Retrieves a user's conversation history.
   * @param {string} userId
   * @param {{limit?: number}} [options]
   * @returns {Promise<Array|object>} The history array on success, or a
   *   {success: false, error, metadata} object if the storage backend fails
   *   (e.g. MongoStore could not connect).
   */
  async getHistory(userId, options = {}) {
    if (!userId || typeof userId !== "string") {
      throw new Error("PersonaCore: getHistory() requires a valid userId.");
    }
    try {
      return await this._memory.getHistory(userId, options.limit);
    } catch (err) {
      return this._storageFailureResponse(err, Date.now());
    }
  }

  /**
   * Deletes a user's conversation history.
   * @param {string} userId
   * @param {{limit?: number}} [options]
   * @returns {Promise<void|object>} undefined on success, or a
   *   {success: false, error, metadata} object if the storage backend fails.
   */
  async deleteHistory(userId, options = {}) {
    if (!userId || typeof userId !== "string") {
      throw new Error("PersonaCore: deleteHistory() requires a valid userId.");
    }
    try {
      return await this._memory.deleteHistory(userId, options.limit);
    } catch (err) {
      return this._storageFailureResponse(err, Date.now());
    }
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  /** @private */
  _validateHandleMessageRequest(request) {
    if (!request || typeof request !== "object") {
      throw new Error(
        "PersonaCore: handleMessage() requires a request object.",
      );
    }
    if (!request.userId || typeof request.userId !== "string") {
      throw new Error(
        'PersonaCore: handleMessage() requires a "userId" string.',
      );
    }
    if (!request.text && !request.image && !request.voice) {
      throw new Error(
        'PersonaCore: handleMessage() requires at least one of "text", "image", or "voice".',
      );
    }
    if (request.image !== undefined && !Buffer.isBuffer(request.image)) {
      throw new Error('PersonaCore: "image" must be a Buffer.');
    }
    if (request.voice !== undefined && !Buffer.isBuffer(request.voice)) {
      throw new Error('PersonaCore: "voice" must be a Buffer.');
    }
    if (request.text !== undefined && typeof request.text !== "string") {
      throw new Error('PersonaCore: "text" must be a string.');
    }
  }

  /**
   * Converts a thrown storage-backend error (e.g. MongoStore's lazy
   * connection failure) into the standard {success, error, metadata}
   * response shape used everywhere else in the SDK, instead of letting it
   * reject the caller's promise as a raw Error.
   * @param {Error} err
   * @param {number} startTime
   * @param {object} [reply] - The successful Gemini reply, if this failure
   *   happened after generation (e.g. while persisting history). Its
   *   apiKeyIndex/rotated/keysTriedThisRequest are carried through so
   *   callers still see which key served the turn that couldn't be saved.
   * @private
   */
  _storageFailureResponse(err, startTime, reply) {
    return {
      success: false,
      error: {
        code: "STORAGE_ERROR",
        message: err.message,
      },
      metadata: {
        apiKeyIndex: reply ? reply.apiKeyIndex : null,
        rotated: reply ? reply.rotated : null,
        keysTriedThisRequest: reply ? reply.keysTriedThisRequest : null,
        responseTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Builds the Gemini `contents` array from prior history plus the current turn.
   * @private
   */
  _buildContents(history, text, image) {
    const contents = history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    }));

    const currentParts = [];
    if (text) {
      currentParts.push({ text });
    }
    if (image) {
      currentParts.push(this._vision.buildImagePart(image));
    }

    contents.push({ role: "user", parts: currentParts });
    return contents;
  }

  /**
   * Assembles the final response object returned from handleMessage().
   * @private
   */
  _buildResponse({ reply, sttMetadata, voiceOutputResult, startTime }) {
    const responseTime = Date.now() - startTime;

    // Prefer the voice output call's key-rotation info if audio was generated
    // this turn (it's the last Gemini call made), otherwise the reply's.
    const rotationSource = voiceOutputResult || reply;

    const metadata = {
      tokenUsage: reply.usageMetadata || {},
      apiKeyIndex: rotationSource.apiKeyIndex,
      rotated: rotationSource.rotated,
      keysTriedThisRequest: rotationSource.keysTriedThisRequest,
      responseTime,
      finishReason: reply.finishReason,
      historyLimit: this._historyLimit,
      model: {
        text: defaults.MODELS.TEXT_AND_VISION,
        speechRecognition: this._speechRecognition
          ? defaults.MODELS.SPEECH_RECOGNITION
          : null,
        voiceOutput: this._voiceOutput ? defaults.MODELS.VOICE_OUTPUT : null,
      },
    };

    const response = { success: true, metadata };

    if (voiceOutputResult) {
      response.audio = voiceOutputResult.audioBuffer;
      if (this._voiceOutput.shouldIncludeText()) {
        response.text = reply.text;
      }
    } else {
      response.text = reply.text;
    }

    return response;
  }
}

module.exports = AI;
