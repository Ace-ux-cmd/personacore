'use strict';

const ArrayStore = require('../models/arrayStore');
const MongoStore = require('../models/mongoStore');
const defaults = require('../config/defaults');

/**
 * Coordinates conversation history storage, delegating to whichever backend
 * (ArrayStore or MongoStore) is currently active. Both backends share the
 * same interface, so this service is unaware of the underlying storage
 * mechanism (architecture.md: Storage Layer).
 */
class MemoryService {
  /**
   * @param {number} [historyLimit] - Defaults to defaults.HISTORY_LIMIT.
   */
  constructor(historyLimit) {
    this._historyLimit =
      typeof historyLimit === 'number' && historyLimit > 0 ? historyLimit : defaults.HISTORY_LIMIT;
    this._store = new ArrayStore();
  }

  /**
   * Switches the active backend to MongoDB. Connects lazily.
   * @param {string} mongoUri
   * @param {string} collectionName
   */
  useMongo(mongoUri, collectionName) {
    this._store = new MongoStore(mongoUri, collectionName);
  }

  /**
   * Retrieves conversation history for a user, respecting the configured
   * historyLimit unless an explicit limit is provided.
   * @param {string} userId
   * @param {number} [limit]
   */
  async getHistory(userId, limit) {
    const effectiveLimit = typeof limit === 'number' ? limit : undefined;
    return this._store.getHistory(userId, effectiveLimit);
  }

  /**
   * Retrieves only the most recent `historyLimit` messages, for use when
   * building the context sent to Gemini.
   * @param {string} userId
   */
  async getRecentHistoryForModel(userId) {
    return this._store.getHistory(userId, this._historyLimit);
  }

  /**
   * Saves a single message (user or model turn) to history.
   * @param {string} userId
   * @param {{role: string, text: string}} message
   */
  async saveMessage(userId, message) {
    return this._store.saveMessage(userId, message);
  }

  /**
   * Deletes conversation history for a user.
   * @param {string} userId
   * @param {number} [limit]
   */
  async deleteHistory(userId, limit) {
    return this._store.deleteHistory(userId, limit);
  }
}

module.exports = MemoryService;
