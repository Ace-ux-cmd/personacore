# Overview

## Vision

PersonaCore exists to make it easy to give an application a consistent, believable conversational character — without every developer having to re-solve prompt engineering, conversation history, multimodal input, and API resilience from scratch.

A developer should be able to describe a persona in a sentence or two and get back something that talks like a person having a conversation, not a chatbot performing customer service.

## Purpose

Concretely, PersonaCore is a Node.js SDK that wraps Google's Gemini API and provides:

- A single orchestration point (`AI`) for turning a persona description plus a user message into a conversational reply.
- Built-in, per-user conversation history, so multi-turn context "just works" without the developer managing arrays or database rows themselves.
- Optional multimodal capabilities (image understanding, voice transcription, voice synthesis) that layer on cleanly when needed and add zero overhead when not.
- Resilience against individual API key failures (rate limits, auth issues, transient upstream errors) via automatic key rotation, so a single exhausted key doesn't take down the integration.

## Goals

- **Fast to adopt.** A working conversational persona in under 10 lines of code, using only what's required (`apiKeys`, `persona`).
- **Natural by default.** Responses should read like a person talking, not an assistant executing instructions — regardless of how the persona is worded.
- **Progressive complexity.** Memory persistence, vision, voice input, and voice output are all opt-in. The base SDK does not require a database, audio tooling, or any configuration beyond credentials and a persona.
- **Predictable failure behavior.** When something goes wrong (a bad API key, an exhausted quota, an upstream outage), the SDK degrades in a defined, observable way rather than throwing unexplained errors or silently corrupting state.
- **Storage independence.** History works the same way whether it's held in memory or persisted to MongoDB; switching backends should not change the developer-facing contract.

## Non-Goals

- **Not a multi-provider abstraction.** PersonaCore does not attempt to support OpenAI, Anthropic, or other model providers behind a common interface. It is built specifically around Gemini's capabilities and request/response shapes.
- **Not a full chat platform.** PersonaCore does not provide UI components, transport layers (WebSocket servers, REST endpoints), authentication, or user management. It is a message-in, response-out SDK meant to be embedded inside a larger application.
- **Not a general-purpose agent framework.** There is no tool-use, function-calling, or autonomous task execution built into the core orchestration. PersonaCore's job is conversation, not task automation.
- **Not a prompt-engineering toolkit.** Developers supply a persona description; PersonaCore does not offer prompt templating, few-shot example management, or persona versioning as first-class features.
- **Not responsible for audio capture or playback.** Voice input/output work with raw audio buffers; recording from a microphone and playing back audio to a user are the responsibility of the host application.

## Design Principles

1. **Orchestrator, not implementer.** The main `AI` class coordinates feature services and the Gemini service. It does not itself contain Gemini API details or storage logic — those live in dedicated services, so each concern can change independently.
2. **Human-first conversations.** Every request is grounded by an internal, non-configurable conversational-behavior layer, combined with the developer's persona, so replies stay natural, reactive, and appropriately concise regardless of what persona text is supplied.
3. **Opt-in complexity.** No optional feature (memory persistence, vision, speech recognition, voice output) is active unless explicitly enabled via its `.use...()` method. The default instance is the simplest possible configuration.
4. **Fail loud on developer error, degrade gracefully on operational error.** Invalid configuration (missing persona, malformed request) throws immediately and synchronously. Operational failures (a rate-limited key, an unreachable model) are handled internally where possible (key rotation) and surfaced as structured `{ success: false }` responses where not.
5. **One storage contract, two backends.** In-memory (`ArrayStore`) and MongoDB (`MongoStore`) history stores implement an identical interface, so `MemoryService` — and everything above it — is unaware of which backend is active.
6. **No partial persistence on failure.** If a model call fails, nothing is written to history for that turn. History always represents completed user/model exchanges, never an orphaned user message with no reply.

## Default Behavior

Out of the box, with only `apiKeys` and `persona` supplied:

- History is kept in memory, per `userId`, scoped to the running process, limited to the last 10 messages (configurable via `historyLimit`).
- Only text input/output is supported — image and voice inputs are rejected with a clear error until their respective features are enabled.
- Every `handleMessage()` call is grounded by the internal conversational-behavior layer plus the supplied persona.
- API key failover is always active, even with a single key configured (a single key simply has nothing to rotate to).

## Intended Audience

- Node.js developers building chat-based product features (companion apps, character-driven assistants, persona-based bots) who want conversational behavior without hand-rolling prompt construction, history management, and retry logic.
- Teams already committed to Gemini as their model provider, who want a purpose-built layer on top of it rather than a generic multi-provider SDK.
- Developers comfortable working directly with buffers and structured JSON responses, integrating PersonaCore into their own transport layer (HTTP handler, WebSocket server, job queue, etc.).
