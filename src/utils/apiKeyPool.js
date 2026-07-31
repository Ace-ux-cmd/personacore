'use strict';

const defaults = require('../config/defaults');

/**
 * Manages a pool of Gemini API keys with time-limited blacklisting on failure.
 *
 * - A key stays active until a request using it fails with an eligible
 *   status code (429, 401, 403, 5xx), at which point it is blacklisted for
 *   BLACKLIST_DURATION_MS (FR-38, FR-39).
 * - Blacklisted keys automatically become eligible again after the
 *   blacklist window expires, without requiring a process restart.
 * - If every key is currently blacklisted, callers should treat the pool
 *   as exhausted (FR-40).
 */
class ApiKeyPool {
  /**
   * @param {string[]} apiKeys
   */
  constructor(apiKeys) {
    if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
      throw new Error('ApiKeyPool: at least one Gemini API key is required.');
    }

    this._keys = apiKeys.map((key, index) => ({
      key,
      index,
      blacklistedUntil: null,
    }));
  }

  /**
   * Returns the list of currently eligible (non-blacklisted) key entries,
   * in original order, clearing any expired blacklist entries as it goes.
   * @private
   */
  _eligibleKeys() {
    const now = Date.now();
    return this._keys.filter((entry) => {
      if (entry.blacklistedUntil !== null && entry.blacklistedUntil <= now) {
        entry.blacklistedUntil = null;
      }
      return entry.blacklistedUntil === null;
    });
  }

  /**
   * Marks a key as failed, blacklisting it for BLACKLIST_DURATION_MS.
   * @param {number} index - Original index of the key in the configured array.
   */
  blacklist(index) {
    const entry = this._keys.find((k) => k.index === index);
    if (entry) {
      entry.blacklistedUntil = Date.now() + defaults.GEMINI_KEY_FAILURE.BLACKLIST_DURATION_MS;
    }
  }

  /**
   * @returns {Array<{key: string, index: number}>} eligible keys for this request.
   */
  getEligibleKeys() {
    return this._eligibleKeys().map(({ key, index }) => ({ key, index }));
  }

  /**
   * @returns {number} total number of configured keys.
   */
  size() {
    return this._keys.length;
  }
}

module.exports = ApiKeyPool;
