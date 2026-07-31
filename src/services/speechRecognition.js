'use strict';

/**
 * Speech recognition feature service. Enabled via ai.useSpeechRecognition()
 * Voice input is transcribed before conversation processing
 * only the transcription is stored in history.
 */
class SpeechRecognitionService {
  /**
   * @param {import('./gemini')} geminiService
   */
  constructor(geminiService) {
    this._gemini = geminiService;
  }

  /**
   * Transcribes a voice input buffer to text.
   * @param {Buffer} voiceBuffer - Expected to be OGG/Opus encoded audio.
   * @returns {Promise<{text: string, apiKeyIndex: number, keysTriedThisRequest: number, rotated: boolean}>}
   */
  async transcribe(voiceBuffer) {
    if (!Buffer.isBuffer(voiceBuffer)) {
      throw new Error('PersonaCore: voice input must be a Buffer.');
    }

    return this._gemini.transcribeAudio(voiceBuffer, 'audio/ogg');
  }
}

module.exports = SpeechRecognitionService;
