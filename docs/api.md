# API Reference

## Installation & Import

```js
const AI = require("personacore");
```

`AI` is the default (and only) export.

---

## `new AI(config)`

Creates a new PersonaCore instance.

### Parameters

| Field          | Type       | Required | Description                                                                                                                             |
| -------------- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKeys`      | `string[]` | Yes      | One or more Gemini API keys. Must be a non-empty array of non-empty strings.                                                            |
| `persona`      | `string`   | Yes      | Description of the character/persona this instance should embody. Combined internally with PersonaCore's conversational-behavior layer. |
| `historyLimit` | `number`   | No       | Maximum number of messages retained per user. Must be a positive number if provided. Defaults to `10`.                                  |

### Throws

- `'PersonaCore: a configuration object is required.'` no config object passed.
- `'PersonaCore: "apiKeys" must be a non-empty array of Gemini API key strings.'`
- `'PersonaCore: "persona" is required and must be a string.'`
- `'PersonaCore: "historyLimit" must be a positive number.'`

### Example

```js
const ai = new AI({
  apiKeys: [process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2],
  persona: "You are Anna. You are friendly, sarcastic and intelligent.",
  historyLimit: 20,
});
```

---

## `.useMemory(mongoUri)`

Switches conversation history storage from the default in-memory store to MongoDB. History persists across process restarts once enabled.

Each `AI` instance gets its own dedicated collection (`personacore_history`, scoped internally per instance), so multiple instances never share history even against the same MongoDB URI.

### Parameters

| Field      | Type     | Required | Description                |
| ---------- | -------- | -------- | -------------------------- |
| `mongoUri` | `string` | Yes      | MongoDB connection string. |

### Throws

- `'PersonaCore: useMemory() requires a valid MongoDB connection string.'`

### Example

```js
ai.useMemory("mongodb://localhost:27017/personacore");
```

The connection is established lazily this call itself is synchronous, and connection errors surface the first time history is actually read or written.

---

## `.useVision()`

Enables image understanding. Once enabled, `handleMessage()` accepts an `image` buffer.

Takes no arguments and does not throw.

### Example

```js
ai.useVision();
```

---

## `.useSpeechRecognition()`

Enables voice input transcription. Once enabled, `handleMessage()` accepts a `voice` buffer, which is transcribed to text before conversational processing.

Takes no arguments and does not throw.

### Example

```js
ai.useSpeechRecognition();
```

---

## `.useVoiceOutput(options?)`

Enables spoken audio replies. When enabled, some fraction of `handleMessage()` calls (per `probability`) generate an OGG/Opus audio reply in addition to (or instead of) text.

### Parameters

| Field                 | Type      | Required | Description                                                                                                                                                        |
| --------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `options.includeText` | `boolean` | No       | Whether text accompanies generated audio in the response. Defaults to `false`.                                                                                     |
| `options.probability` | `number`  | No       | Probability (0–1) that a given reply includes generated audio. If omitted, defaults to `1.0` when `includeText` is `false`, or `0.5` when `includeText` is `true`. |

### Throws

- `'PersonaCore: "probability" must be a number between 0 and 1.'`
- `'PersonaCore: "includeText" must be a boolean.'`

### Example

```js
// Audio-only replies, always generated
ai.useVoiceOutput();

// Audio + text, generated for ~50% of replies
ai.useVoiceOutput({ includeText: true, probability: 0.5 });
```

---

## `.handleMessage(request)`

Processes a single conversational turn: resolves input (transcribing voice if needed), retrieves history, generates a reply, persists the turn, and optionally generates voice output.

### Parameters

| Field    | Type     | Required      | Description                                                                    |
| -------- | -------- | ------------- | ------------------------------------------------------------------------------ |
| `userId` | `string` | Yes           | Identifies whose conversation this is. History is scoped per `userId`.         |
| `text`   | `string` | Conditionally | Text input. At least one of `text`, `image`, `voice` is required.              |
| `image`  | `Buffer` | Conditionally | Image input. Requires `useVision()` to have been called.                       |
| `voice`  | `Buffer` | Conditionally | Voice input (OGG/Opus). Requires `useSpeechRecognition()` to have been called. |

### Throws (synchronously, before any model call)

- `'PersonaCore: handleMessage() requires a request object.'`
- `'PersonaCore: handleMessage() requires a "userId" string.'`
- `'PersonaCore: handleMessage() requires at least one of "text", "image", or "voice".'`
- `'PersonaCore: "image" must be a Buffer.'`
- `'PersonaCore: "voice" must be a Buffer.'`
- `'PersonaCore: "text" must be a string.'`
- `'PersonaCore: voice input requires useSpeechRecognition() to be enabled.'`
- `'PersonaCore: image input requires useVision() to be enabled.'`

### Returns

A `Promise` resolving to a response object. Shape depends on outcome and enabled features.

#### Success text only (default)

```js
{
  success: true,
  text: "Hey! Not much, just here. What's up?",
  metadata: {
    tokenUsage: { /* Gemini usageMetadata */ },
    apiKeyIndex: 0,
    rotated: false,
    keysTriedThisRequest: 1,
    responseTime: 812,
    finishReason: 'STOP',
    historyLimit: 10,
    model: {
      text: 'gemini-3.1-flash-lite',
      speechRecognition: null,
      voiceOutput: null,
    },
  },
}
```

#### Success voice output enabled, audio generated this turn

```js
{
  success: true,
  audio: <Buffer ...>,     // OGG/Opus encoded
  // text is only present if useVoiceOutput({ includeText: true }) was set
  metadata: { /* same shape as above, model.voiceOutput populated */ },
}
```

#### Failure

```js
{
  success: false,
  error: {
    code: 'RATE_LIMIT', // or AUTH_ERROR | UPSTREAM_ERROR | NETWORK_ERROR | REQUEST_ERROR
                         // | ALL_KEYS_UNAVAILABLE | NO_AUDIO_RETURNED | AUDIO_TRANSCODING_ERROR
                         // | STORAGE_ERROR
    message: 'All available Gemini API keys failed for this request. Last error: ...',
  },
  metadata: { /* partial metadata: keyIndex, model, responseTime  or apiKeyIndex,
                 rotated, keysTriedThisRequest, responseTime for STORAGE_ERROR */ },
}
```

On failure, nothing is persisted to history for that turn the user's message is not saved without a corresponding model reply.

A `STORAGE_ERROR` can occur even after Gemini has already generated a reply for example, if history retrieval fails before generation, or if the storage backend fails while persisting a turn that was otherwise successful (e.g. `MongoStore` losing its connection). In the latter case, `metadata.apiKeyIndex`/`rotated`/`keysTriedThisRequest` reflect the Gemini call that _did_ succeed, even though the overall result is a failure the generated reply itself is not returned or recoverable through this call.

An `AUDIO_TRANSCODING_ERROR` can similarly occur after Gemini TTS has already returned audio successfully, if converting that audio to OGG/Opus fails (e.g. a malformed sample rate, or the bundled ffmpeg binary failing). As with `STORAGE_ERROR`, `metadata.keyIndex` reflects the Gemini call that succeeded.

### Examples

```js
// Text-only
const res = await ai.handleMessage({ userId: "user-123", text: "Hello!" });

// With an image (requires useVision())
const res = await ai.handleMessage({
  userId: "user-123",
  text: "What is this?",
  image: fs.readFileSync("./photo.jpg"),
});

// With voice input (requires useSpeechRecognition())
const res = await ai.handleMessage({
  userId: "user-123",
  voice: fs.readFileSync("./message.ogg"),
});
```

---

## `.getHistory(userId, options?)`

Retrieves a user's stored conversation history.

### Parameters

| Field           | Type     | Required | Description                                                                                                |
| --------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `userId`        | `string` | Yes      | The user whose history to retrieve.                                                                        |
| `options.limit` | `number` | No       | Maximum number of most-recent messages to return. Omit for the full stored history (up to `historyLimit`). |

### Throws (synchronously, before any storage call)

- `'PersonaCore: getHistory() requires a valid userId.'`

### Returns

A `Promise` resolving to one of two shapes:

- **Success:** `Array<{ role: 'user' | 'model', text: string, createdAt: Date }>`, in chronological order (oldest first).
- **Storage failure:** `{ success: false, error: { code: 'STORAGE_ERROR', message }, metadata }` see [Error Codes Reference](#error-codes-reference). This happens if the active storage backend itself fails (e.g. `MongoStore` cannot connect); it does not throw.

Check for `Array.isArray(result)` (or `result.success === false`) to distinguish the two before using the return value.

### Example

```js
const history = await ai.getHistory("user-123");
if (!Array.isArray(history)) {
  // storage failure  history.error.code, history.error.message
} else {
  const lastFive = history.slice(-5);
}
```

---

## `.deleteHistory(userId, options?)`

Deletes a user's stored conversation history.

### Parameters

| Field           | Type     | Required | Description                                                                                                       |
| --------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `userId`        | `string` | Yes      | The user whose history to delete.                                                                                 |
| `options.limit` | `number` | No       | If provided, deletes only the most recent `limit` messages. If omitted, deletes the entire history for that user. |

### Throws (synchronously, before any storage call)

- `'PersonaCore: deleteHistory() requires a valid userId.'`

### Returns

A `Promise` resolving to one of two shapes:

- **Success:** `undefined`.
- **Storage failure:** `{ success: false, error: { code: 'STORAGE_ERROR', message }, metadata }` see [Error Codes Reference](#error-codes-reference). This happens if the active storage backend itself fails; it does not throw.

Check `result && result.success === false` if you need to detect a storage failure.

### Example

```js
const result = await ai.deleteHistory("user-123");
if (result && result.success === false) {
  // storage failure  result.error.code, result.error.message
}

await ai.deleteHistory("user-123", { limit: 2 }); // drop just the last 2 messages
```

---

## Error Codes Reference

| Code                      | Meaning                                                                                                                                                                   | Rotates keys? |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `RATE_LIMIT`              | Gemini returned 429 for the attempted key.                                                                                                                                | Yes           |
| `AUTH_ERROR`              | Gemini returned 401/403 for the attempted key.                                                                                                                            | Yes           |
| `UPSTREAM_ERROR`          | Gemini returned a 5xx server error.                                                                                                                                       | Yes           |
| `NETWORK_ERROR`           | No HTTP status was available (connection-level failure).                                                                                                                  | Yes           |
| `REQUEST_ERROR`           | Gemini returned a non-rotatable error (e.g. 400, 404) likely a malformed request.                                                                                         | No            |
| `ALL_KEYS_UNAVAILABLE`    | Every configured key is currently blacklisted; no call was attempted.                                                                                                     | N/A           |
| `NO_AUDIO_RETURNED`       | Voice output was requested but Gemini TTS returned no audio part.                                                                                                         | N/A           |
| `AUDIO_TRANSCODING_ERROR` | Gemini TTS returned audio, but converting it to OGG/Opus failed (unparseable sample rate, or the transcoding step itself failed).                                         | N/A           |
| `STORAGE_ERROR`           | The active storage backend failed (e.g. `MongoStore` could not connect or a read/write failed). Can surface from `handleMessage()`, `getHistory()`, or `deleteHistory()`. | N/A           |

Rotatable errors are retried against the next eligible key automatically within a single `handleMessage()` call; only once all eligible keys are exhausted (or a non-rotatable error occurs) does the call fail.

`AUDIO_TRANSCODING_ERROR` and `STORAGE_ERROR` are distinct from the others in that they can occur _after_ a Gemini call has already succeeded they represent a failure in a step downstream of generation (transcoding audio, or persisting/reading history), not a failure of generation itself.
