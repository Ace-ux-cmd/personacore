'use strict';

const defaults = require('../config/defaults');

/**
 * Determines whether a Gemini API error should trigger key rotation
 * (429/401/403/5xx) as opposed to being a validation/bad-request error
 * (400/404) that should propagate immediately without rotating keys.
 *
 * @param {unknown} err - Error thrown by the @google/genai SDK.
 * @returns {boolean}
 */
function isRotatableFailure(err) {
  const status = err && typeof err.status === 'number' ? err.status : null;
  if (status === null) {
    // Network-level errors (no HTTP status) are treated as rotatable,
    // since they indicate the current key/connection could not complete
    // the request rather than a problem with the request itself.
    return true;
  }
  return defaults.GEMINI_KEY_FAILURE.ROTATE_ON_STATUS.includes(status);
}

module.exports = { isRotatableFailure };
