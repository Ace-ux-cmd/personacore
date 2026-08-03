# PersonaFlow

A persona-driven conversational AI SDK for Node.js, powered by Gemini.

PersonaFlow lets you define a persona a character, a tone, a set of traits and drop it into your application as a conversational engine. You describe _who_ it is; PersonaFlow handles _how_ it holds a natural conversation: history, multi-turn context, optional vision, voice input, voice output, and resilient API key failover.

```js
const AI = require("personaflow");

const ai = new AI({
  apiKeys: [process.env.GEMINI_API_KEY],
  persona: "You are Anna. You are friendly, sarcastic and intelligent.",
});

const response = await ai.handleMessage({
  userId: "user-123",
  text: "Hello!",
});

console.log(response.text);
```

## Features

- **Persona-driven** supply a persona description; PersonaFlow combines it with an internal conversational-behavior layer so replies read like a person, not an assistant completing a task.
- **Gemini-native** built directly on `@google/genai`, with no abstraction layer for swapping model providers.
- **Conversation memory** per-user history out of the box, in-memory by default, or persisted to MongoDB with one call.
- **Optional vision** pass image buffers alongside text for multimodal understanding.
- **Optional voice input** transcribe voice messages before they enter the conversation.
- **Optional voice output** generate spoken audio replies, with configurable probability and text inclusion.
- **API key failover** configure multiple Gemini API keys; PersonaFlow rotates automatically past rate limits and transient failures.

## Installation

```bash
npm install personaflow
```

Requires Node.js 18 or later. If you enable voice output, `ffmpeg-static` (a dependency) is used internally to transcode audio no separate ffmpeg install is required.

## Quick Start

```js
const AI = require("personaflow");

const ai = new AI({
  apiKeys: [process.env.GEMINI_API_KEY],
  persona: "You are Anna. You are friendly, sarcastic and intelligent.",
  historyLimit: 10, // optional, defaults to 10
});

const response = await ai.handleMessage({
  userId: "user-123",
  text: "Hello!",
});

console.log(response.text);
console.log(response.metadata);
```

`apiKeys` and `persona` are required. Everything else memory persistence, vision, voice input, voice output is opt-in. 

See [`SETUP.md`](/SETUP.md) for installation and setup guidance.
## Optional Features

Each optional feature is enabled with a `.use...()` call on the instance before you start handling messages:

```js
ai.useMemory(process.env.MONGODB_URL); // persist history to MongoDB
ai.useVision(); // enable image understanding
ai.useSpeechRecognition(); // enable voice input transcription
ai.useVoiceOutput({ includeText: true, probability: 0.5 }); // enable spoken replies
```

Nothing is enabled unless you explicitly call for it. An `AI` instance with no optional features is text-only, in-memory, single-turn-persisted, and fully functional.

See [`docs/api.md`](/docs/api.md) for full method signatures, request/response shapes, and error formats.

## Philosophy

PersonaFlow is built around a few consistent ideas:

- **A persona is not a prompt hack.** It's combined with an internal, non-configurable behavior layer that keeps responses conversational, reactive, and natural regardless of what persona you supply.
- **Optional features stay optional.** Nothing is loaded, connected, or paid for until you explicitly enable it.
- **Gemini, deliberately.** PersonaFlow doesn't abstract over multiple model providers. It goes deep on one, rather than shallow on many. See [`docs/decisions.md`](/docs/decisions.md) for the reasoning.
- **The SDK orchestrates; it doesn't own logic it doesn't need to.** Gemini-specific and storage-specific concerns live in dedicated services, not in the main class.

## Documentation

- [`docs/overview.md`](/docs/overview.md) vision, goals, non-goals, design principles, intended audience
- [`docs/requirements.md`](/docs/requirements.md) the formal functional and non-functional specification
- [`docs/architecture.md`](/docs/architecture.md) internal design, module responsibilities, request flow
- [`docs/api.md`](/docs/api.md) full developer API reference
- [`docs/decisions.md`](/docs/decisions.md) architecture decision record (ADR)

## License

MIT
