'use strict';

/**
 * In-memory conversation history store.
 *
 * Default storage backend (ADR-005). History is kept in a Map keyed by
 * userId, scoped to this store instance (and therefore to the AI instance
 * that owns it), satisfying FR-11 (independent per-user history).
 *
 * Message format (must match MongoStore, per NFR-15):
 * { role: 'user' | 'model', text: string, createdAt: Date }
 */
class ArrayStore {
  constructor() {
    /** @type {Map<string, Array<{role: string, text: string, createdAt: Date}>>} */
    this._histories = new Map();
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

    const history = this._histories.get(userId) || [];
    history.push({
      role: message.role,
      text: message.text,
      createdAt: new Date(),
    });
    this._histories.set(userId, history);
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
   * Without a limit, deletes the entire history (FR-24).
   * @param {string} userId
   * @param {number} [limit] - Number of most recent messages to delete.
   */
  async deleteHistory(userId, limit) {
    if (!userId) {
      throw new Error('ArrayStore.deleteHistory: userId is required.');
    }

    if (typeof limit !== 'number') {
      this._histories.delete(userId);
      return;
    }

    const history = this._histories.get(userId) || [];
    const keepCount = Math.max(history.length - limit, 0);
    this._histories.set(userId, history.slice(0, keepCount));
  }
}

module.exports = ArrayStore;
