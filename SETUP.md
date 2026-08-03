# Setup Guide

This guide walks through everything needed to go from a blank project to a working PersonaCore instance: installing the package, getting a Gemini API key, configuring your environment, and running your first message. It's meant to be followed top to bottom the first time you set this up.

If you just want the shortest possible example, see the [Quick Start in the README](/README.md#quick-start) instead. This guide is the longer, more explicit version.

## Prerequisites

- **Node.js 18 or later.** Check your version with:
  ```bash
  node -v
  ```
  If you don't have Node.js installed, or your version is older than 18, install a current version from [nodejs.org](https://nodejs.org) before continuing.
- **A Gemini API key.** PersonaCore is built directly on Google's Gemini API — you'll need your own key before anything in this guide will actually run. See [Step 2](#step-2--get-a-gemini-api-key) below.
- **(Optional) A MongoDB connection string**, only if you plan to persist conversation history across restarts. Not required to get started — the default in-memory store works with zero setup.

## Step 1 — Install the package

In your project directory:

```bash
npm install personacore
```

This pulls in PersonaCore and its dependencies, including `@google/genai` (the Gemini SDK it's built on) and `ffmpeg-static` (used internally if you enable voice output later — no separate ffmpeg install needed).

## Step 2 — Get a Gemini API key

PersonaCore requires at least one valid Gemini API key to function — it has no functionality of its own without one.

Get your key from Google AI Studio:

**https://ai.google.dev/**

Getting and managing your API key (creating a project, generating a key, understanding quotas and billing) is entirely handled by that platform — refer to Google's own documentation there for those steps. Once you have a key in hand, come back here and continue with Step 3.

## Step 3 — Store your key safely

Never hardcode your API key directly in a source file, especially one you might commit to version control. Use an environment variable instead.

Create a `.env` file in your project root (make sure it's listed in `.gitignore`):

```
GEMINI_API_KEY=your-key-here
```

Then load it in your project using a package like [`dotenv`](https://www.npmjs.com/package/dotenv):

```bash
npm install dotenv
```

```js
require('dotenv').config();
```

Place that line at the very top of your entry file, before requiring anything that needs the key.

## Step 4 — Write your first script

Create a file, e.g. `index.js`:

```js
require('dotenv').config();
const AI = require('personacore');

const ai = new AI({
  apiKeys: [process.env.GEMINI_API_KEY],
  persona: 'You are Anna. You are friendly, sarcastic and intelligent.',
});

async function main() {
  const response = await ai.handleMessage({
    userId: 'user-123',
    text: 'Hello!',
  });

  if (response.success) {
    console.log('Reply:', response.text);
  } else {
    console.error('Something went wrong:', response.error);
  }
}

main();
```

`apiKeys` and `persona` are the only two required fields — everything else PersonaCore does is opt-in from here.

## Step 5 — Run it

```bash
node index.js
```

If everything is set up correctly, you'll see a conversational reply printed to your console. If you instead see an error, check:

- Is `GEMINI_API_KEY` actually set? Add a quick `console.log(process.env.GEMINI_API_KEY)` above `main()` to confirm it's not `undefined`.
- Did you call `require('dotenv').config()` before constructing `AI`? Order matters — the environment variable has to be loaded first.
- Is the key itself valid and active? A key that's been revoked, or hasn't finished propagating yet on Google's side, will cause every request to fail with an auth-related error.

## Step 6 — Add optional features (as needed)

Everything below is opt-in — skip anything you don't need right now. Each is enabled with one method call before you start handling messages.

**Persistent history (MongoDB)** — by default, conversation history lives in memory and resets when your process restarts. To persist it, you'll need a MongoDB connection string.

If you don't already have a MongoDB database, the easiest way to get a free connection string is via MongoDB Atlas:

**https://www.mongodb.com/cloud/atlas**

As with the Gemini key, creating a cluster and generating a connection string there is handled entirely by that platform — refer to MongoDB's own documentation for those steps.

Once you have a connection string, add it to your `.env` file alongside your Gemini key:

```
GEMINI_API_KEY=your-key-here
MONGODB_URL=your-connection-string-here
```

Then reference it the same way:

```js
ai.useMemory(process.env.MONGODB_URL);
```

Never hardcode the connection string directly in your source — like your API key, it can contain credentials and shouldn't end up in version control.

**Image understanding** — to let `handleMessage()` accept an `image` buffer:

```js
ai.useVision();
```

**Voice input (transcription)** — to let `handleMessage()` accept a `voice` buffer and transcribe it before processing:

```js
ai.useSpeechRecognition();
```

**Voice output (spoken replies)** — to have PersonaCore occasionally reply with generated audio:

```js
ai.useVoiceOutput({ includeText: true, probability: 0.5 });
```

You can mix and match any combination of these. None of them are required for PersonaCore to work — a bare instance with just `apiKeys` and `persona` is fully functional on its own.

## Next Steps

- [README.md](README.md) — feature overview and philosophy
- [`docs/overview.md`](docs/overview.md) — vision, goals, and design principles
- [`docs/api.md`](docs/api.md) — full method-by-method API reference
- [`docs/architecture.md`](docs/architecture.md) — how the SDK is put together internally
- [`docs/decisions.md`](docs/decisions.md) — why certain design choices were made

## Getting Help

If something in this guide doesn't work as described, double check you're on Node.js 18+, that your API key is valid and correctly loaded into `process.env`, and that you're passing `apiKeys` as an array (even with just one key: `[yourKey]`, not `yourKey` alone).
