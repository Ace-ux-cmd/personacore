'use strict';

/**
 * Vision feature service. Enabled via ai.useVision().
 *
 * Responsible only for building the Gemini-compatible content part for an
 * image buffer. Image bytes are passed through as-is; any error while
 * processing is thrown rather than swallowed (per confirmed requirement).
 */
class VisionService {
  /**
   * Builds a Gemini `inlineData` part for an image buffer.
   * @param {Buffer} imageBuffer
   * @param {string} [mimeType] - Defaults to 'image/jpeg' if not provided.
   * @returns {{inlineData: {mimeType: string, data: string}}}
   */
  buildImagePart(imageBuffer, mimeType) {
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('PersonaCore: image input must be a Buffer.');
    }

    return {
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: imageBuffer.toString('base64'),
      },
    };
  }
}

module.exports = VisionService;
