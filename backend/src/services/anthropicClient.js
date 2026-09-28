const Anthropic = require('@anthropic-ai/sdk');

let client = null;

// Shared Claude client for every AI feature (outreach drafts, content posts).
function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set - add it to your .env to use AI features');
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Pulls plain text out of a Messages API response.
function extractText(response) {
  return (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

module.exports = { getAnthropicClient, extractText };
