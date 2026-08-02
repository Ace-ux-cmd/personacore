'use strict';

const mongoose = require('mongoose');
const KeyedQueue = require('../utils/keyedQueue');

/**
 * MongoDB conversation history store.
 *
 * Enabled via ai.useMemory(uri). Each AI instance that calls useMemory()
 * gets its own dedicated Mongoose connection and its own dynamically-named
 * collection (auto-generated per instance), so multiple AI instances never
 * share history even if pointed at the same MongoDB URI.
 *
 * The connection is established lazily: the connection promise is created
 * immediately when useMemory() is called, but actually awaited only on the
 * first read/write, keeping the SDK synchronous and immediately usable
 *  while still surfacing connection errors clearly when memory is
 * first used.
 *
 * Message format (must match ArrayStore)
 * { role: 'user' | 'model', text: string, createdAt: Date }
 *
 * saveMessage's insert-then-trim pair and deleteHistory are each
 * read-modify-write against a userId's documents. Two concurrent calls for
 * the same userId could otherwise interleave (e.g. both trims racing,
 * over- or under-shooting historyLimit), so both are serialized per userId
 * through a KeyedQueue, the same way ArrayStore serializes its Map access.
 */
class MongoStore {
  /**
   * @param {string} uri - MongoDB connection string.
   * @param {string} collectionName - Unique collection name for this instance.
   */
  constructor(uri, collectionName, historyLimit) {
    if (!uri || typeof uri !== 'string') {
      throw new Error('MongoStore: a valid MongoDB connection string is required.');
    }
    this._historyLimit = historyLimit;
    this._collectionName = collectionName;
    this._connection = mongoose.createConnection(uri);
    this._model = null;
    this._connectPromise = null;
    this._queue = new KeyedQueue();
  }

  /**
   * Lazily waits for the connection to be ready and returns the Mongoose
   * model bound to this instance's dedicated collection.
   * @private
   */
  async _getModel() {
    if (this._model) {
      return this._model;
    }

    if (!this._connectPromise) {
      this._connectPromise = this._connection.asPromise();
    }

    try {
      await this._connectPromise;
    } catch (err) {
      throw new Error(`MongoStore: failed to connect to MongoDB. ${err.message}`);
    }

    const historySchema = new mongoose.Schema(
      {
        userId: { type: String, required: true, index: true },
        role: { type: String, required: true, enum: ['user', 'model'] },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
      { versionKey: false }
    );

    this._model = this._connection.model(this._collectionName, historySchema, this._collectionName);
    return this._model;
  }

  /**
   * Append a message to a user's history.
   * @param {string} userId
   * @param {{role: string, text: string}} message
   */
  async saveMessage(userId, message) {
    if (!userId) {
      throw new Error('MongoStore.saveMessage: userId is required.');
    }
    if (!message || typeof message.text !== 'string' || !message.role) {
      throw new Error('MongoStore.saveMessage: message must have a role and text.');
    }

    return this._queue.run(userId, async () => {
      const Model = await this._getModel();
      await Model.create({
        userId,
        role: message.role,
        text: message.text,
      });

      const excessDocs = await Model.find({userId})
      .sort({createdAt: -1})
      .skip(this._historyLimit)
      .select('id')
      .lean();

      if(excessDocs.length > 0){
        const idsToDelete = excessDocs.map(doc => doc._id);
        await Model.deleteMany({_id: {$in: idsToDelete}});
      }
    });
  }

  /**
   * Retrieve a user's history, optionally limited to the most recent N messages.
   * Returned in chronological order (oldest first), matching ArrayStore.
   * @param {string} userId
   * @param {number} [limit]
   * @returns {Promise<Array<{role: string, text: string, createdAt: Date}>>}
   */
  async getHistory(userId, limit) {
    if (!userId) {
      throw new Error('MongoStore.getHistory: userId is required.');
    }

    const Model = await this._getModel();

    let query = Model.find({ userId }).sort({ createdAt: -1 });
    if (typeof limit === 'number') {
      query = query.limit(limit);
    }

    const docs = await query.lean();
    return docs.reverse().map((doc) => ({
      role: doc.role,
      text: doc.text,
      createdAt: doc.createdAt,
    }));
  }

  /**
   * Delete a user's history, optionally limited to the most recent N messages.
   * Without a limit, deletes the entire history.
   * @param {string} userId
   * @param {number} [limit]
   */
  async deleteHistory(userId, limit) {
    if (!userId) {
      throw new Error('MongoStore.deleteHistory: userId is required.');
    }

    return this._queue.run(userId, async () => {
      const Model = await this._getModel();

      if (typeof limit !== 'number') {
        await Model.deleteMany({ userId });
        return;
      }

      const recentDocs = await Model.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('_id')
        .lean();

      const idsToDelete = recentDocs.map((doc) => doc._id);
      if (idsToDelete.length > 0) {
        await Model.deleteMany({ _id: { $in: idsToDelete } });
      }
    });
  }
}

module.exports = MongoStore;
