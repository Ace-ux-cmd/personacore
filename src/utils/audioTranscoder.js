'use strict';

const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

/**
 * Transcodes raw PCM audio (as returned by Gemini TTS: 16-bit signed LE,
 * mono, 24000 Hz) into an OGG/Opus buffer, using the ffmpeg-static binary
 * directly rather than a wrapper library (avoids the deprecated
 * fluent-ffmpeg dependency).
 *
 * @param {Buffer} pcmBuffer - Raw PCM audio bytes.
 * @param {number} sampleRateHz - Sample rate of the input PCM (e.g. 24000).
 * @returns {Promise<Buffer>} OGG/Opus encoded audio buffer.
 */
function pcmToOggOpus(pcmBuffer, sampleRateHz) {
  return new Promise((resolve, reject) => {
    const args = [
      '-f', 's16le',
      '-ar', String(sampleRateHz),
      '-ac', '1',
      '-i', 'pipe:0',
      '-c:a', 'libopus',
      '-f', 'ogg',
      'pipe:1',
    ];

    const ffmpeg = spawn(ffmpegPath, args);

    const stdoutChunks = [];
    const stderrChunks = [];

    ffmpeg.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    ffmpeg.on('error', (err) => {
      reject(new Error(`PersonaCore: failed to start ffmpeg for audio transcoding. ${err.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        reject(new Error(`PersonaCore: ffmpeg transcoding to ogg_opus failed (exit code ${code}). ${stderr}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks));
    });

    ffmpeg.stdin.on('error', () => {
      // Prevent unhandled EPIPE crashes if ffmpeg exits before stdin is fully written;
      // the 'close' handler above still reports the failure via a non-zero exit code.
    });

    ffmpeg.stdin.write(pcmBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Parses the sample rate out of a Gemini PCM mimeType string, e.g.
 * "audio/L16;codec=pcm;rate=24000" -> 24000.
 * @param {string} mimeType
 * @returns {number}
 */
function parseSampleRate(mimeType) {
  const match = /rate=(\d+)/.exec(mimeType || '');
  if (!match) {
    throw new Error(`PersonaCore: could not determine sample rate from mimeType "${mimeType}".`);
  }
  return parseInt(match[1], 10);
}

module.exports = { pcmToOggOpus, parseSampleRate };
