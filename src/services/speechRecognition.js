'use strict';

const { detectAudioMimeType } = require('../utils/fileTypeSniffer');

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
   * Transcribes a voice input buffer to text. Accepts any audio format
   * Gemini supports (ogg, wav, mp3, m4a/mp4, flac) -- the real format is
   * detected from the buffer's magic bytes and forwarded accurately,
   * rather than always being labeled as OGG/Opus.
   * @param {Buffer} voiceBuffer
   * @returns {Promise<{text: string, apiKeyIndex: number, keysTriedThisRequest: number, rotated: boolean}>}
   */
  async transcribe(voiceBuffer) {
    if (!Buffer.isBuffer(voiceBuffer)) {
      throw new Error('PersonaCore: voice input must be a Buffer.');
    }

    return this._gemini.transcribeAudio(voiceBuffer, detectAudioMimeType(voiceBuffer));
  }
}

module.exports = SpeechRecognitionService;
