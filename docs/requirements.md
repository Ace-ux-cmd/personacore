# Requirements

This document is the formal specification for PersonaFlow. It defines what the SDK must do (functional requirements) and the qualities it must exhibit while doing it (non-functional requirements). This acts as the implementation contract behavior described here should be treated as authoritative over any single code comment.

Requirement IDs are stable identifiers for cross-referencing from `architecture.md`, `api.md`, and `decisions.md`.

## Functional Requirements

### Configuration & Initialization

- **FR-1.** The SDK exposes a single default export, an `AI` class, as its entry point.
- **FR-2.** The `AI` constructor requires a configuration object with `apiKeys` (a non-empty array of non-empty strings) and `persona` (a non-empty string). Missing or invalid values throw synchronously.
- **FR-3.** The constructor accepts an optional `historyLimit` (a positive number). If omitted, the SDK default (10) applies.
- **FR-4.** An `AI` instance is fully usable for text conversation immediately after construction, with no additional setup required.

### Optional Feature Activation

- **FR-5.** `useMemory(mongoUri)` switches the conversation history backend from in-memory to MongoDB. It requires a non-empty string connection URI and throws if not provided.
- **FR-6.** `useVision()` enables image input support. It takes no arguments.
- **FR-7.** `useSpeechRecognition()` enables voice input transcription. It takes no arguments.
- **FR-8.** `useVoiceOutput(options)` enables spoken audio replies. It accepts an optional `{ includeText?: boolean, probability?: number }` object.
  - `probability`, if provided, must be a number between 0 and 1 inclusive; invalid values throw.
  - `includeText`, if provided, must be a boolean; invalid values throw.
  - If `probability` is omitted, it defaults based on `includeText`: voice-only responses default to probability 1.0; voice-with-text responses default to probability 0.5.
  - If `probability` is included without `includeText`, throws, meaning `includeText` is required before a `probability` field can be determined.
- **FR-9.** Optional features that are not enabled must cause any request depending on them to fail with a clear, descriptive error rather than silently ignoring the input or crashing unexpectedly.

### Conversation Handling

- **FR-10.** `handleMessage(request)` accepts `{ userId: string, text?: string, image?: Buffer, voice?: Buffer }`. `userId` is required. At least one of `text`, `image`, or `voice` is required.
- **FR-11.** If `voice` is provided but `useSpeechRecognition()` was not called, `handleMessage()` throws before making any model call.
- **FR-12.** If `image` is provided but `useVision()` was not called, `handleMessage()` throws before making any model call.
- **FR-13.** If `voice` is provided, it is transcribed first; the resulting transcription becomes the effective text for the turn (both for the model call and for what is stored in history).
- **FR-14.** `image`, if provided, must be a `Buffer`; `voice`, if provided, must be a `Buffer`; `text`, if provided, must be a `string`. Violations throw synchronously.
- **FR-15.** Before generating a reply, the SDK retrieves the user's existing conversation history and includes it as context for the model call.
- **FR-16.** The system instruction sent to Gemini on every conversational call is the combination of the internal conversational-behavior layer and the developer-supplied persona (in that order).
- **FR-17.** On a successful model reply, both the user's turn (effective text) and the model's reply are persisted to history as a pair.
- **FR-18.** On a failed model reply, nothing is persisted to history for that turn.
- **FR-18a.** If the storage backend fails either while retrieving history before generation, or while persisting a turn after a successful model reply `handleMessage()` resolves (does not throw) with a structured `{ success: false, error: { code: 'STORAGE_ERROR', message }, metadata }` response. When the failure occurs after a successful model reply, `metadata` still reports that reply's `apiKeyIndex`, `rotated`, and `keysTriedThisRequest`, even though the reply itself is not returned to the caller.
- **FR-19.** If voice output is enabled and the probability roll for a given turn succeeds, the SDK generates spoken audio for the model's reply text.
- **FR-20.** If voice output generation fails after a successful text reply, `handleMessage()` still returns a failure response for that call (the turn is not silently returned as text-only).
- **FR-20a.** If Gemini TTS succeeds but converting its audio output to the SDK's public OGG/Opus format fails, `handleMessage()` resolves (does not throw) with a structured `{ success: false, error: { code: 'AUDIO_TRANSCODING_ERROR', message }, metadata }` response, with `metadata.keyIndex` reporting the key used for the underlying (successful) TTS call.
- **FR-21.** The response of `handleMessage()` always includes a `success` boolean and a `metadata` object.
  - On success, it includes `text` unless voice output produced audio without `includeText`, in which case it includes `audio` instead (or in addition, if `includeText` is true for that call).
  - On failure, it includes `error` describing what went wrong instead of `text`/`audio`.

### History Management

- **FR-22.** `getHistory(userId, options?)` returns a user's stored conversation history, most-recent-aware, optionally limited by `options.limit`. `userId` is required and must be a string.
- **FR-22a.** If the active storage backend fails while `getHistory()` is retrieving data, the call resolves (does not throw) with a structured failure object in the standard `{ success: false, error: { code, message }, metadata }` shape, distinguishable from a successful result by `Array.isArray(result) === false`.
- **FR-23.** `deleteHistory(userId, options?)` deletes a user's stored conversation history. Without `options.limit`, it deletes the entire history for that user. With a limit, it deletes only that many of the most recent messages.
- **FR-23a.** If the active storage backend fails while `deleteHistory()` is deleting data, the call resolves (does not throw) with a structured failure object in the standard `{ success: false, error: { code, message }, metadata }` shape, in place of its normal `undefined` return.
- **FR-24.** History for a given `userId` is independent across different `userId` values within the same `AI` instance.
- **FR-25.** History is capped at `historyLimit` messages per user; once the cap is reached, the oldest messages are dropped as new ones are added.
- **FR-26.** History entries store at minimum a `role` (`'user'` or `'model'`), `text`, and a `creation timestamp`.
- **FR-27.** When memory is backed by MongoDB, each `AI` instance that calls `useMemory()` uses its own dedicated collection, so history from different instances never mixes even if they share a MongoDB URI.

### Vision

- **FR-28.** When vision is enabled, an `image` Buffer supplied to `handleMessage()` is converted into a Gemini-compatible inline data part and included in the same model call as any accompanying text.

### Speech Recognition (Voice Input)

- **FR-29.** When speech recognition is enabled, a `voice` Buffer supplied to `handleMessage()` is transcribed to text via a dedicated model call before conversational processing begins.
- **FR-30.** Only the transcription never the raw audio is persisted to conversation history.

### Voice Output

- **FR-31.** When voice output is enabled, whether a given reply includes generated audio is decided per-message by a random draw against the configured `probability`.
- **FR-32.** Audio returned to the caller is encoded as OGG/Opus, regardless of the raw format returned by the underlying model.
- **FR-33.** Whether the reply text accompanies generated audio in the response is controlled by `includeText`; it does not affect what is persisted to history (the model's full text reply is always persisted regardless of `includeText`).

### API Key Management

- **FR-34.** The SDK accepts one or more Gemini API keys and distributes requests across them, retrying with an alternate eligible key when a request fails with a rotatable status code.
- **FR-35.** Rotatable status codes are: 429 (rate limit), 401/403 (auth), and 5xx (upstream/server errors). Network-level errors with no HTTP status are also treated as rotatable.
- **FR-36.** Non-rotatable errors (e.g. 400, 404) propagate immediately as a failure without attempting other keys.
- **FR-37.** A key that fails with a rotatable error is temporarily excluded from selection ("blacklisted") for a fixed duration, after which it automatically becomes eligible again without requiring any restart or manual reset.
- **FR-38.** If every configured key is currently ineligible, the SDK returns a structured failure indicating all keys are unavailable, without attempting a network call.
- **FR-39.** Every successful and failed model-call outcome reports which key index was used (or attempted), how many keys were tried for that request, and whether rotation occurred.

### Response Metadata

- **FR-40.** `handleMessage()` responses include token usage, the API key index used, whether rotation occurred, how many keys were tried, response time in milliseconds, the model's finish reason, the configured history limit, and which model was used for each active capability (text, speech recognition, voice output).

## Non-Functional Requirements

### Reliability

- **NFR-1.** A single failing or rate-limited API key must not cause request failure as long as at least one other configured key is eligible.
- **NFR-2.** No conversation turn is ever partially persisted: a turn is either fully saved (both user and model messages) or not saved at all.
- **NFR-2a.** Storage read-modify-write sequences (saving a message, deleting history) for a given `userId` are serialized: concurrent calls for the same `userId` never interleave in a way that loses an update or causes `historyLimit` enforcement to over- or under-trim. Concurrent calls for _different_ `userId` values are not serialized against each other.
- **NFR-3.** Blacklisted API keys recover automatically over time without operator intervention.

### Modularity & Maintainability

- **NFR-4.** Gemini-specific logic (request shaping, model selection, key failover) is isolated to a single service, never duplicated in the orchestrator or feature services.
- **NFR-5.** Storage backends are interchangeable behind a single interface; adding a new backend must not require changes to `MemoryService`'s public contract or to the orchestrator.
- **NFR-6.** Optional features are structurally isolated: disabling a feature (never calling its `.use...()` method) must have zero runtime cost and zero side effects on unrelated requests.

### Usability (Developer Experience)

- **NFR-7.** All configuration and request validation errors are synchronous, descriptive, and prefixed identifiably (`PersonaFlow: ...`) so they are easy to distinguish from upstream Gemini errors.
- **NFR-8.** The minimum viable configuration (`apiKeys`, `persona`) is sufficient to send and receive a conversational message; no other setup, service, or environment dependency is required.

### Performance

- **NFR-9.** `handleMessage()` reports response time in its metadata so callers can monitor latency without external instrumentation.
- **NFR-10.** History retrieval respects the configured `historyLimit` so that context sent to the model does not grow unbounded as a conversation lengthens.

### Portability

- **NFR-11.** The SDK has no dependency on any particular host runtime (e.g. Express, a specific serverless platform) beyond Node.js ≥18 itself.
- **NFR-12.** Audio transcoding uses a statically bundled ffmpeg binary rather than assuming ffmpeg is present on the host system.

### Security

- **NFR-13.** API keys are only ever used to construct outbound requests to Gemini; they are not logged, echoed in error messages, or included in any response payload.
- **NFR-14.** MongoDB connection strings are provided by the developer at runtime and are not persisted or logged by the SDK.

### Consistency

- **NFR-15.** History records have an identical shape (`role`, `text`, `createdAt`) regardless of which storage backend is active.
- **NFR-16.** Response object shape (`success`, `metadata`, and either `text`/`audio` or `error`) is consistent across all `handleMessage()` outcomes, including failures originating downstream of a successful model call (storage failures, audio transcoding failures) these resolve with a structured failure object rather than rejecting the returned promise.
- **NFR-17.** Operational failures in `getHistory()` and `deleteHistory()` (i.e. failures of the storage backend itself, as opposed to invalid arguments) resolve with the same structured `{ success: false, error: { code, message }, metadata }` shape used by `handleMessage()`, rather than rejecting the returned promise. Argument validation errors (e.g. a missing `userId`) continue to throw synchronously, consistent with NFR-7.
