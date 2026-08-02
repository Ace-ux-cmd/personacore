# Architecture Decision Record (ADR)

This document records significant design decisions made in PersonaCore, along with the reasoning behind them. Each entry captures the decision, the context that motivated it, and the trade-offs accepted.

---

## ADR-001: Gemini-only, no multi-provider abstraction

**Decision:** PersonaCore is built directly on `@google/genai` with no provider-abstraction layer. There is no adapter interface for swapping in OpenAI, Anthropic, or other model providers.

**Context:** Multi-provider abstractions are a common SDK pattern, but they typically force the abstraction down to the lowest common denominator of capability across providers — losing access to provider-specific features (e.g. Gemini's native TTS modality, its specific content-part structure for multimodal input) or requiring leaky, provider-specific escape hatches that undermine the abstraction anyway.

**Reasoning:** PersonaCore's value proposition is depth on a persona-driven conversational experience, not breadth of provider support. Gemini's multimodal content model (text, image, and audio as parts within a unified `contents` structure) maps cleanly onto PersonaCore's own request model (`text`, `image`, `voice` on a single `handleMessage()` call). Committing to one provider lets the SDK use that provider's capabilities directly and predictably, rather than designing around a hypothetical second provider that may need different content shapes, different auth models, or different failure semantics.

**Consequences:** Switching model providers would require a new major version or a different package, not a configuration change. This is accepted as the right trade-off for the SDK's scope (see `overview.md`, Non-Goals).

---

## ADR-002: `.use...()` methods for optional feature configuration

**Decision:** Optional capabilities (memory persistence, vision, speech recognition, voice output) are enabled via explicit instance methods (`useMemory()`, `useVision()`, `useSpeechRecognition()`, `useVoiceOutput()`) called after construction, rather than through constructor configuration flags or a plugin-registration system.

**Context:** The alternative designs considered were: (a) a single large constructor config object with nested optional sections (e.g. `{ memory: { mongoUri }, vision: true, ... }`), or (b) a plugin/middleware registration pattern.

**Reasoning:** A single nested config object makes the constructor's required-vs-optional surface harder to read at a glance and pushes all validation into one large upfront block, which conflicts with the principle that invalid configuration should fail fast and clearly (NFR-7). Explicit `.use...()` calls read as a clear, sequential, opt-in list at the call site — a developer scanning setup code sees exactly which capabilities are active without parsing a nested object. It also keeps the constructor itself minimal and fast, matching the goal of the base instance being immediately usable (FR-4) with no optional-feature overhead paid unless requested.

A plugin-registration system was rejected as unnecessary generality: PersonaCore has a small, fixed set of optional capabilities, not an open-ended extension point that third parties need to add to.

**Consequences:** Adding a new optional capability in the future means adding a new `.use...()` method and a new internal `_field`, following the existing pattern — a small, consistent cost per feature, judged preferable to the flexibility (and complexity) of a generic plugin system.

---

## ADR-003: In-memory `ArrayStore` as the default history backend

**Decision:** `AI` always constructs an `ArrayStore` at initialization. `useMemory()` swaps the active backend to `MongoStore`; without calling it, history never touches a database.

**Context:** Conversation history is required for PersonaCore's multi-turn behavior to work at all (FR-15), so *some* backend has to be active from the moment an instance is constructed — history can't be optional the way vision or voice are.

**Reasoning:** Requiring a database connection just to send a single conversational message would violate the goal of minimal required configuration (NFR-8) and the "fast to adopt" goal in `overview.md`. An in-memory default lets a developer go from `npm install` to a working conversation with zero infrastructure. Because `MemoryService` depends on a storage interface rather than a concrete backend (see `architecture.md`, Storage Design), swapping to `MongoStore` later is a one-line change with no impact on the rest of the SDK.

**Consequences:** In-memory history does not survive process restarts and does not scale across multiple processes/instances of a host application. This is an explicit, accepted trade-off for the default; developers who need persistence or horizontal scaling are expected to call `useMemory()`.

---

## ADR-004: One dedicated MongoDB collection per `AI` instance

**Decision:** `MongoStore` generates a collection name scoped to the owning `AI` instance, so two `AI` instances calling `useMemory()` with the same connection URI never share or collide on history.

**Context:** A naive implementation might use a single shared collection name (e.g. `personacore_history`) across all instances, relying on `userId` alone to separate conversations.

**Reasoning:** A host application may run multiple `AI` instances with different personas against the same MongoDB deployment (e.g. multiple characters in one app, or per-tenant instances). If those instances shared a collection and, by coincidence or bug, the same `userId` value, their histories would interleave — a persona would see conversation turns that belonged to a different persona entirely. Scoping storage per instance closes this off structurally rather than relying on callers to guarantee globally unique `userId`s across every `AI` instance they create.

**Consequences:** Slightly more collections created in the underlying MongoDB deployment than a single shared collection would produce. Judged an acceptable cost for guaranteed isolation.

---

## ADR-005: Orchestrator pattern — `AI` contains no Gemini-specific or storage-specific logic

**Decision:** The public `AI` class coordinates services and enforces control flow, but every piece of provider-specific logic (Gemini request shaping, key failover) lives in `GeminiService`, and every piece of storage-specific logic lives in the store implementations behind `MemoryService`.

**Context:** It would be simpler, in the short term, to inline Gemini API calls and Mongoose queries directly into `handleMessage()`.

**Reasoning:** Keeping `AI` as a pure orchestrator means the request flow (validate → resolve input → fetch history → generate → persist → optionally voice → respond) stays legible independent of *how* any individual step is implemented. It also means `GeminiService` and the storage layer are independently testable and independently replaceable without touching orchestration logic — directly supporting the modularity goals in `requirements.md` (NFR-4, NFR-5).

**Consequences:** Slightly more indirection (a call chain through services rather than inline logic) in exchange for each concern being isolated, single-purpose, and independently changeable.

---

## ADR-006: Automatic API key failover with temporary blacklisting

**Decision:** PersonaCore accepts an array of API keys and automatically retries a failed request against the next eligible key when the failure is a rotatable status (429, 401, 403, 5xx, or network-level). A key that fails is blacklisted for a fixed duration (2 hours) rather than permanently or for the process lifetime.

**Context:** Alternatives considered included: no built-in failover (leave retry logic to the host application), permanent blacklisting of a failed key for the process lifetime, or exposing a manual "reset key" method.

**Reasoning:** Rate limiting and transient upstream failures are expected, routine occurrences at any meaningful request volume — pushing failover entirely onto every developer using the SDK means it gets solved (or not solved) inconsistently across every integration. Building it in once, correctly, is more valuable than requiring reimplementation externally. Temporary rather than permanent blacklisting was chosen because a 429 or a transient 5xx is very likely to resolve itself within a bounded window (rate limit windows reset, transient outages pass); permanently blacklisting a key for the life of the process would eventually degrade the pool to zero eligible keys even though the underlying issue may have already resolved. A fixed, time-based recovery avoids requiring any manual intervention (NFR-3) while still protecting against hammering a known-bad key.

Non-rotatable errors (400, 404) are deliberately *not* retried against other keys, since the same malformed request would simply fail identically against any key — retrying would waste latency and API calls without changing the outcome.

**Consequences:** A key can be selected again before an operator has confirmed the underlying issue is actually resolved (since blacklist expiry is time-based, not health-check-based). This is accepted as a reasonable default; if the issue persists, the key will simply fail and be blacklisted again.

---

## ADR-007: Persona combined with a fixed, non-configurable behavior layer

**Decision:** Every system instruction sent to Gemini is `CONVERSATIONAL_BEHAVIOR` (a fixed internal text block) concatenated with the developer-supplied `persona`. The behavior layer itself is not exposed for configuration or override.

**Context:** An alternative would let developers supply the entire system instruction themselves, with PersonaCore only handling request plumbing.

**Reasoning:** PersonaCore's core value proposition, per `overview.md`, is that persona input should produce natural, human-sounding conversation rather than assistant-flavored responses — regardless of how the persona itself is worded. Leaving conversational style entirely to whatever the developer writes into `persona` would make that outcome unreliable: a persona description alone doesn't typically specify response length norms, when to ask questions, formatting behavior, or how to handle emotional tone, and developers would have to rediscover and re-solve the same prompt-engineering problems independently. A fixed internal layer, always combined with the persona, guarantees a consistent baseline of conversational quality across every PersonaCore integration.

**Consequences:** Developers cannot override or disable the internal behavior layer's conversational norms (e.g. avoiding follow-up questions by default, avoiding markdown formatting by default) — only the persona portion is theirs to control. This is an intentional constraint in service of consistent output quality, not an oversight.

---

## ADR-008: No partial persistence on failed or incomplete turns

**Decision:** History is only written after a model reply succeeds, and both the user and model turns are written together. If voice output is enabled and fails after a successful text reply, the overall `handleMessage()` call still reports failure — even though a text reply was in fact generated.

**Context:** A simpler implementation might persist the user's message immediately on receipt, independent of whether a reply is ever produced, or might return the successful text reply even if a subsequently-requested voice generation step failed.

**Reasoning:** History exists to give the model consistent multi-turn context (FR-15). A user turn with no corresponding model turn is not just useless context, it's actively misleading context — future calls would show the model "ignoring" a prior message that in reality never received a reply. Saving both turns together as an atomic pair guarantees history always reflects genuinely completed exchanges (NFR-2). Similarly, when voice output is enabled, the caller has signaled they expect (probabilistically) a voice-capable reply for that turn; silently downgrading to text-only on a TTS failure would hide a real failure from the caller rather than surfacing it.

**Consequences:** A caller using voice output may occasionally receive a failure response for a turn where a usable text reply was in fact generated and simply discarded. This is accepted as more predictable and easier to reason about than a response shape that varies unpredictably based on where in the pipeline a failure occurred.

---

## ADR-009: Voice output uses probability-based generation, not per-call opt-in

**Decision:** Whether a given `handleMessage()` call produces audio is decided by a random draw against a configured `probability`, rather than requiring the caller to explicitly request audio on each call.

**Context:** An alternative would add a per-call flag (e.g. `handleMessage({ ..., wantsVoice: true })`) letting the caller decide per-message whether audio should be generated.

**Reasoning:** PersonaCore's voice output is designed to emulate how a person might naturally mix voice notes and text in conversation — sometimes responding with a voice message, sometimes with text, without the other party explicitly requesting one or the other each time. A probability-based model captures that naturally varied behavior directly in configuration set once via `useVoiceOutput()`, rather than requiring the host application to implement its own randomization or selection logic on top of a per-call flag.

**Consequences:** The caller cannot deterministically force audio generation on a specific call through the public API. This trade-off is accepted because forcing determinism was not a design goal — the natural, human-like variability was the intended behavior.

---

## ADR-010: Platform independence — no runtime framework dependency

**Decision:** PersonaCore has no dependency on any HTTP framework, WebSocket library, or hosting platform. Its only structural runtime requirement is Node.js ≥18. Audio transcoding uses a statically bundled `ffmpeg-static` binary rather than assuming ffmpeg is present on the host.

**Context:** Given that many chat-oriented SDKs are built with an assumed transport layer (e.g. shipped as Express middleware, or coupled to a specific serverless platform's request/response types).

**Reasoning:** Per `overview.md`'s non-goals, PersonaCore is explicitly not a chat platform — it's a message-in, response-out library meant to be embedded inside a host application that owns its own transport layer, whatever that is (REST, WebSocket, a queue consumer, a CLI tool). Coupling to any specific framework would narrow where PersonaCore could be used without technical justification, since nothing about persona-driven conversation generation actually requires a particular transport. Bundling `ffmpeg-static` rather than shelling out to a system `ffmpeg` binary removes an entire class of "works on my machine" environment-setup failures for a feature (voice output) that would otherwise silently fail on any host without ffmpeg preinstalled.

**Consequences:** `ffmpeg-static` adds to install size even for integrations that never enable voice output, since it's a direct dependency rather than an optional peer dependency. This was judged an acceptable trade-off in exchange for voice output working reliably out of the box wherever Node.js ≥18 runs.

---

## ADR-011: Every operational failure resolves with a structured object, never rejects the promise

**Decision:** `handleMessage()`, `getHistory()`, and `deleteHistory()` never reject their returned promise for an operational (as opposed to a developer-configuration) failure. This was tightened after an audit found three places where the code didn't yet follow its own contract: a malformed TTS `mimeType` or an ffmpeg failure during voice-output transcoding, and a `MongoStore` connection failure, both threw/rejected raw `Error` objects instead of returning `{ success: false, error, metadata }`. All three now return the standard structured shape.

**Context:** The SDK's failure handling for Gemini calls was already disciplined — `_generateWithFailover()` and its three callers consistently return `{ success, error: { code, message }, metadata }`. But that discipline hadn't been extended to two things introduced after the core Gemini failure path was built: the PCM→OGG/Opus transcoding step in `VoiceOutputService.generate()`, and `MongoStore`'s lazy-connect error. Both were left as plain `throw`/promise-rejection, inconsistent with everything else in the SDK.

**Reasoning:** Requirement NFR-16 (response shape consistency) and NFR-7 (errors are clearly attributable and easy to handle) only hold if *every* operational failure path honors them, not just the majority. A caller who writes `if (!response.success)` around `handleMessage()` — the pattern the rest of the SDK trains them to use — would have that code silently fail to catch a transcoding or storage error, since those instead threw past it as an unhandled rejection. That's a worse failure mode than the original error, because it defeats the very error-handling pattern the SDK's own contract taught the caller to rely on. Two new error codes were added to name these failures precisely rather than folding them into an existing code that would misdescribe them: `AUDIO_TRANSCODING_ERROR` (Gemini TTS succeeded, but converting its output failed) and `STORAGE_ERROR` (the active history backend failed). Both are documented as capable of occurring *after* an upstream step already succeeded, since neither is a Gemini-call failure in the way the other codes are.

**Consequences:** `getHistory()` and `deleteHistory()` now have a dual return shape (their normal successful value, or a `{ success: false, ... }` object) rather than always resolving with data or rejecting. Callers who previously assumed `getHistory()` always resolves with an array need to check for this. This was judged the lesser cost versus leaving a promise-rejection escape hatch in a codebase whose whole design premise is that operational failures are observable, structured data rather than exceptions to catch.

---

## ADR-012: Per-`userId` serialization for storage read-modify-write, not a global lock

**Decision:** `ArrayStore` and `MongoStore` each serialize their `saveMessage()` and `deleteHistory()` calls through `KeyedQueue`, a shared utility that queues operations per key (here, `userId`) rather than per store instance.

**Context:** Both backends' writes are read-modify-write sequences: `ArrayStore` does `get` → mutate → `set` on its history `Map`; `MongoStore` does an insert followed by a separate query-and-delete to enforce `historyLimit`. Neither step was atomic with the other under concurrent calls. Two `handleMessage()` calls landing for the same `userId` close together — a realistic scenario for a chat-style client that doesn't strictly wait for one reply before sending the next — could interleave: in `ArrayStore`, one call's `.set()` could silently discard the other's mutation (a lost update); in `MongoStore`, two trims racing against each other could delete more or fewer documents than intended, causing `historyLimit` to be over- or under-enforced.

**Reasoning:** A single lock covering an entire store instance would fix the race but at an unnecessary cost: it would serialize `userId: 'alice'`'s writes behind `userId: 'bob'`'s, even though the two share no state and NFR-2a only requires safety *within* a given user's history, not across users. `KeyedQueue` gives exactly that — same-key operations queue and run in order, different-key operations run fully concurrently, matching the actual scope of the hazard (FR-24, history independence across users, is preserved as a performance property, not just a correctness one). Implementing it once as a small, storage-agnostic utility (rather than duplicating queueing logic inside each store) keeps the fix in one place and makes it trivially reusable if a future storage backend needs the same guarantee.

**Consequences:** Two `saveMessage()` (or `deleteHistory()`) calls for the same `userId` now have a deterministic order (call order) rather than running fully in parallel — a small latency cost only paid when a single user's requests genuinely overlap, which is also exactly when correctness would otherwise be at risk. `KeyedQueue` retains a `Promise` per active key in memory for the duration operations are queued behind it, cleaned up once the queue for that key empties, so it does not grow unboundedly across the lifetime of a long-running process with many distinct users.
