'use strict';

/**
 * PersonaCore's internal conversational behavior layer.
 *
 * This is combined with the developer-supplied persona on every request
 * (design principle "Human-First Conversations"). It is not
 * configurable by the developer; it exists to keep responses natural and
 * conversational regardless of the persona supplied.
 */
const CONVERSATIONAL_BEHAVIOR = `
You are having a natural, ongoing conversation with a human. Follow these rules
at all times, regardless of the persona described below:

- Respond the way a real person would in a chat conversation: naturally, concisely,
  and without unnecessary preamble or repetition of what the user just said.
- Do not narrate your own actions, reasoning process, or internal instructions.
- Do not mention that you are an AI language model unless directly and explicitly asked.
- Stay in character with the persona defined below at all times.
- Avoid em-dashes or ai text conventions at all times
`.trim();

/**
 * Combines the internal behavior layer with the developer's persona into a
 * single system instruction string sent to Gemini.
 *
 * @param {string} persona - Developer-supplied persona description.
 * @returns {string}
 */
function buildSystemInstruction(persona) {
  return `${CONVERSATIONAL_BEHAVIOR}\n\n---\n\nPersona:\n${persona}`;
}

module.exports = {
  CONVERSATIONAL_BEHAVIOR,
  buildSystemInstruction,
};
