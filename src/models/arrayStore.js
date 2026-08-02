'use strict';

const KeyedQueue = require('../utils/keyedQueue');

/**
 * In-memory conversation history store.
 *
 * Default storage backend. History is kept in a Map keyed by
 * userId, scoped to this store instance (and therefore to the AI instance
 * that owns it), satisfying (independent per-user history).
 *
 * Message format (must match MongoStore):
 * { role: 'user' | 'model', text: string, createdAt: Date }
 *
 * All read-modify-write access to a given userId's history (save, delete)
 * is serialized through a KeyedQueue, so two concurrent calls for the same
 * userId can't interleave their get -> mutate -> set steps and silently
 * lose an update.
 */
class ArrayStore {
  constructor(historyLimit) {
    /** @type {Map<string, Array<{role: string, text: string, createdAt: Date}>>} */
    this._histories = new Map();
    this._historyLimit = historyLimit;
    this._queue = new KeyedQueue();
  }

  /**
   * Append a message to a user's history.
   * @param {string} userId
   * @param {{role: string, text: string}} message
   */
  async saveMessage(userId, message) {
    if (!userId) {
      throw new Error('ArrayStore.saveMessage: userId is required.');
    }
    if (!message || typeof message.text !== 'string' || !message.role) {
      throw new Error('ArrayStore.saveMessage: message must have a role and text.');
    }

    return this._queue.run(userId, async () => {
      const history = this._histories.get(userId) || [];
      history.push({
        role: message.role,
        text: message.text,
        createdAt: new Date(),
      });
      const trimmed = history.length > this._historyLimit ? history.slice(history.length - this._historyLimit) : history;
      this._histories.set(userId, trimmed);
    });
  }

  /**
   * Retrieve a user's history, optionally limited to the most recent N messages.
   * @param {string} userId
   * @param {number} [limit] - If omitted, returns full history.
   * @returns {Promise<Array<{role: string, text: string, createdAt: Date}>>}
   */
  async getHistory(userId, limit) {
    if (!userId) {
      throw new Error('ArrayStore.getHistory: userId is required.');
    }

    const history = this._histories.get(userId) || [];

    if (typeof limit === 'number') {
      return history.slice(Math.max(history.length - limit, 0));
    }

    return history.slice();
  }

  /**
   * Delete a user's history, optionally limited to the most recent N messages.
   * Without a limit, deletes the entire history.
   * @param {string} userId
   * @param {number} [limit] - Number of most recent messages to delete.
   */
  async deleteHistory(userId, limit) {
    if (!userId) {
      throw new Error('ArrayStore.deleteHistory: userId is required.');
    }

    return this._queue.run(userId, async () => {
      if (typeof limit !== 'number') {
        this._histories.delete(userId);
        return;
      }

      const history = this._histories.get(userId) || [];
      const keepCount = Math.max(history.length - limit, 0);
      this._histories.set(userId, history.slice(0, keepCount));
    });
  }
}

module.exports = ArrayStore;
