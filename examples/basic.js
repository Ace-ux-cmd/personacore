'use strict';

/**
 * Minimal usage example. Requires a real GEMINI_API_KEY env var to run
 * against the live API — this file is not executed as part of the build.
 */
const AI = require('../index');

const ai = new AI({
  apiKeys: [process.env.GEMINI_API_KEY],
  persona: 'You are Anna. You are friendly, sarcastic and intelligent.',
});

// Optional features:
// ai.useMemory('mongodb://localhost:27017/personacore');
// ai.useVision();
// ai.useSpeechRecognition();
// ai.useVoiceOutput({ includeText: true, probability: 0.5 });

async function main() {
  const response = await ai.handleMessage({
    userId: 'user-123',
    text: 'Hello!',
  });

  console.log(response)
  console.log(response.text);
  console.log(response.metadata);
}

main().catch((err) => {
  console.error('PersonaCore example failed:', err.message);
  process.exit(1);
});
