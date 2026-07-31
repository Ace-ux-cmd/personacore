'use strict';

module.exports = {
  HISTORY_LIMIT: 10,

  MODELS: {
    TEXT_AND_VISION: 'gemini-3.1-flash-lite',
    SPEECH_RECOGNITION: 'gemini-3.1-flash-lite',
    VOICE_OUTPUT: 'gemini-3.1-flash-tts-preview',
  },

  VOICE_OUTPUT: {
    INCLUDE_TEXT: false,
    PROBABILITY_VOICE_ONLY: 1.0,
    PROBABILITY_VOICE_AND_TEXT: 0.5,
    TTS_VOICE_NAME: 'Kore',
    OUTPUT_MIME_TYPE: 'audio/ogg',
  },

  GEMINI_KEY_FAILURE: {
    // HTTP status codes that should trigger key rotation / blacklisting.
    ROTATE_ON_STATUS: [429, 401, 403, 500, 502, 503, 504],
    // Duration a failed key stays blacklisted before becoming eligible again.
    BLACKLIST_DURATION_MS: 2 * 60 * 60 * 1000, // 2 hours
  },
};
