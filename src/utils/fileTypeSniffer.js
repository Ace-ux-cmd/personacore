"use strict";

/**
 * Lightweight magic-byte sniffing for the image/audio formats PersonaFlow
 * accepts. No dependency needed -- these are simple, well-known fixed-byte
 * signatures. Used so handleMessage() can label uploaded buffers with their
 * real MIME type when talking to Gemini, instead of assuming a fixed
 * format regardless of what was actually sent.
 *
 * Falls back to a sensible default (image/jpeg, audio/ogg) when the buffer
 * doesn't match a known signature, preserving the SDK's previous behavior
 * for callers that already relied on the default.
 */

const IMAGE_SIGNATURES = [
  {
    mimeType: "image/png",
    match: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47,
  },
  {
    mimeType: "image/jpeg",
    match: (b) =>
      b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: "image/webp",
    match: (b) =>
      b.length >= 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
  {
    mimeType: "image/gif",
    match: (b) =>
      b.length >= 6 &&
      (b.toString("ascii", 0, 6) === "GIF87a" ||
        b.toString("ascii", 0, 6) === "GIF89a"),
  },
];

const AUDIO_SIGNATURES = [
  {
    mimeType: "audio/ogg",
    match: (b) => b.length >= 4 && b.toString("ascii", 0, 4) === "OggS",
  },
  {
    mimeType: "audio/wav",
    match: (b) =>
      b.length >= 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WAVE",
  },
  // MP3: either an ID3 tag header, or a raw frame sync (0xFFEx / 0xFFFx).
  {
    mimeType: "audio/mpeg",
    match: (b) => b.length >= 3 && b.toString("ascii", 0, 3) === "ID3",
  },
  {
    mimeType: "audio/mpeg",
    match: (b) => b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0,
  },
  // M4A/MP4 container: 'ftyp' box at offset 4.
  {
    mimeType: "audio/mp4",
    match: (b) => b.length >= 8 && b.toString("ascii", 4, 8) === "ftyp",
  },
  // FLAC
  {
    mimeType: "audio/flac",
    match: (b) => b.length >= 4 && b.toString("ascii", 0, 4) === "fLaC",
  },
];

/**
 * @param {Buffer} buffer
 * @returns {string} Detected MIME type, or 'image/jpeg' if unrecognized.
 */
function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer)) return "image/jpeg";
  const hit = IMAGE_SIGNATURES.find((sig) => sig.match(buffer));
  return hit ? hit.mimeType : "image/jpeg";
}

/**
 * @param {Buffer} buffer
 * @returns {string} Detected MIME type, or 'audio/ogg' if unrecognized.
 */
function detectAudioMimeType(buffer) {
  if (!Buffer.isBuffer(buffer)) return "audio/ogg";
  const hit = AUDIO_SIGNATURES.find((sig) => sig.match(buffer));
  return hit ? hit.mimeType : "audio/ogg";
}

module.exports = { detectImageMimeType, detectAudioMimeType };
