"use strict";

/**
 * Minimal usage example. Requires a real GEMINI_API_KEY env var to run
 * against the live API, this file is not executed as part of the build.
 *
 * Uncomment ONE scenario at a time in main() below. Each scenario is
 * self-contained (builds its own request object for handleMessage).
 */
const path = require("path");
const fs = require("fs");
const AI = require("../index");
const { text } = require("stream/consumers");
require("dotenv").config();

const ai = new AI({
  apiKeys: [process.env.GEMINI_API_KEY],
  persona: "You are personacore customer service agent You are friendly, sarcastic and intelligent."
});

// Optional features:

ai.useMemory(process.env.MONGO_URI);
// ai.useVision();
// ai.useSpeechRecognition();
// ai.useVoiceOutput({ includeText: true, probability: 0.5 });

// ---------------------------------------------------------------------
// Media helpers — read sample files from the same directory as this
// script. Edit the filenames below if your test files are named
// differently.
// ---------------------------------------------------------------------

/**
 * Loads a sample image for useVision() testing.
 * Expects a file named "picture" (any image format) next to this script.
 * @returns {Buffer}
 */
function loadTestImage() {
  const imagePath = path.join(__dirname, "picture.png");
  if (!fs.existsSync(imagePath)) {
    throw new Error(
      `Test image not found at ${imagePath}. Add a file named "picture" next to this script.`
    );
  }
  return fs.readFileSync(imagePath);
}

/**
 * Loads a sample audio clip for useSpeechRecognition() testing.
 * Expects a file named "voice" (any audio format Gemini accepts) next
 * to this script.
 * @returns {Buffer}
 */
function loadTestVoice() {
  const voicePath = path.join(__dirname, "voice.aac");
  if (!fs.existsSync(voicePath)) {
    throw new Error(
      `Test audio not found at ${voicePath}. Add a file named "voice" next to this script.`
    );
  }
  return fs.readFileSync(voicePath);
}

// ---------------------------------------------------------------------
// Scenarios — uncomment exactly one request block inside main().
// ---------------------------------------------------------------------

async function main() {
  const userId = "user-123";

  // --- Scenario 1: plain text message -----------------------------
  // const request = { userId, text: "Hello" };

  // --- Scenario 2: text + image (requires ai.useVision() above) ----
  // const request = {
  //   userId,
  //   text: "What's in this picture?",
  //   image: loadTestImage(),
  // };

  // --- Scenario 3: voice input (requires ai.useSpeechRecognition()) -
  // const request = {
  //   userId,
  //   voice: loadTestVoice(),
  //   text: "What does this say?"
  // };

  // --- Scenario 4: image + voice combined ---------------------------
  // const request = {
  //   userId,
  //   image: loadTestImage(),
  //   voice: loadTestVoice(),
  //   text: "Do they align?"
  // };

  const response = await ai.handleMessage(request);

  console.log(response);
  console.log(response.text);
  console.log(response.metadata);

  // If voice output is enabled, dump the audio to disk to listen to it.
  if (response.audio) {
    const outPath = path.join(__dirname, "output-audio.ogg");
    fs.writeFileSync(outPath, response.audio);
    console.log("Audio written to:", outPath);
  }

  const history = await ai.getHistory(userId);
  // console.log("Before:", history);
  console.log("length:", history.length);

  // const newHistory = await ai.getHistory(userId);
  // console.log("After:", newHistory);
}

main().catch((err) => {
  console.error("PersonaCore example failed:", err.message);
  process.exit(1);
});