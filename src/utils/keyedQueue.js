'use strict';

/**
 * Serializes async operations per key, so concurrent calls for the same
 * key (e.g. the same userId) run strictly one at a time, in call order,
 * while calls for different keys stay fully concurrent.
 *
 * This exists to make read-modify-write sequences safe:
 * - ArrayStore's get -> mutate -> set on its history Map, and
 * - MongoStore's insert -> trim pair,
 * both need "no other operation for this userId runs in between". A
 * single per-instance lock would also serialize unrelated users against
 * each other for no reason; this only serializes same-key operations.
 */
class KeyedQueue {
  constructor() {
    /** @type {Map<string, Promise<void>>} tail of the chain for each key */
    this._tails = new Map();
  }

  /**
   * Runs `fn` only after any previously queued operation for `key` has
   * settled (succeeded or failed), and returns a promise that
   * resolves/rejects with `fn`'s own outcome. One operation's failure
   * never blocks or fails the next operation queued behind it — only
   * ordering is shared, not outcome.
   * @param {string} key
   * @param {() => Promise<any>} fn
   * @returns {Promise<any>}
   */
  run(key, fn) {
    const previousTail = this._tails.get(key) || Promise.resolve();

    // `result` is what the caller gets back: fn()'s own outcome, run only
    // after previousTail has settled either way.
    const result = previousTail.then(fn, fn);

    // The stored tail must itself always resolve (never reject), so it
    // never poisons whatever call comes next for this key. It carries no
    // value — it's purely a "has settled" signal.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this._tails.set(key, tail);

    // Once no further operation is queued behind this one for `key`,
    // drop the map entry so memory doesn't grow with every distinct
    // userId ever seen. Safe because a fresh `run()` call after this
    // point just falls back to Promise.resolve() above, which is
    // equivalent to what `tail` would have resolved to anyway.
    tail.then(() => {
      if (this._tails.get(key) === tail) {
        this._tails.delete(key);
      }
    });

    return result;
  }
}

module.exports = KeyedQueue;
