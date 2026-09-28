const { getAnthropicClient, extractText } = require('./anthropicClient');
const { parseJsonObject } = require('./contentAiService');

// Classification + reply drafting are short, high-volume jobs -> Haiku.
const MODEL = process.env.CLAUDE_INBOX_MODEL || 'claude-haiku-4-5-20251001';

const INTENTS = ['demo_requested', 'interested', 'question', 'not_interested', 'spam', 'casual'];

// Keyword fallback, used when there's no API key or the AI call fails, so
// the inbox keeps working (just less smart). Covers English + Hinglish.
const KEYWORDS = {
  demo_requested: /\b(demo|sample|trial|dikhao|dikha do|show me|example dikh)/i,
  not_interested: /(not interested|no thanks|nahi chahiye|mat bhejo|stop|unsubscribe)/i,
  interested: /(price|pricing|cost|rate|kitna|kitne|charges?|fees?|interested|details?|info|how much|package|quote|call me|contact|website chahiye|chahiye|budget|book)/i,
  spam: /(follow back|f4f|check my profile|earn money|crypto|giveaway winner)/i,
};

function heuristicClassify({ text, channelType }) {
  const t = String(text || '');
  let intent;
  if (KEYWORDS.not_interested.test(t)) intent = 'not_interested';
  else if (KEYWORDS.spam.test(t)) intent = 'spam';
  else if (KEYWORDS.demo_requested.test(t)) intent = 'demo_requested';
  else if (KEYWORDS.interested.test(t)) intent = 'interested';
  else if (channelType === 'dm') intent = 'question';
  else intent = 'casual';

  const isLead =
    intent === 'demo_requested' ||
    intent === 'interested' ||
    (intent === 'question' && channelType === 'dm');

  return { intent, isLead, summary: t.slice(0, 120), source: 'keywords' };
}

/**
 * Decide what an incoming message means for sales.
 * @returns {Promise<{intent:string, isLead:boolean, summary:string, source:'ai'|'keywords'}>}
 */
async function classifyMessage({ text, channelType, platform, history = [], brand }) {
  if (!process.env.ANTHROPIC_API_KEY) return heuristicClassify({ text, channelType });

  try {
    const anthropic = getAnthropicClient();
    const historyText = history.length
      ? history.map((m) => `${m.direction === 'inbound' ? 'THEM' : 'US'}: ${m.text}`).join('\n')
      : '(no earlier messages)';

    const prompt = `You triage incoming social media messages for a business.

Business: ${brand?.brandName || 'a digital/AI agency'} - ${brand?.description || 'websites, AI automation and marketing for small businesses'}

A person sent this ${channelType === 'comment' ? 'public comment' : 'direct message'} on ${platform}.

Earlier conversation:
${historyText}

New message: "${text}"

Classify the new message:
- intent: one of ${INTENTS.join(', ')}
  - demo_requested: asks to see a demo/sample/example of our work
  - interested: asks about price, details, availability, or says they need the service
  - question: a genuine question that may lead to business
  - not_interested: declines or asks us to stop
  - spam: bots, follow-for-follow, scams
  - casual: compliments, emojis, "nice", small talk with no buying signal
- isLead: true if this person could realistically become a paying client and deserves a spot in the CRM pipeline
- summary: under 15 words, what they want

Return ONLY JSON: {"intent": "...", "isLead": true, "summary": "..."}`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const data = parseJsonObject(extractText(response));
    const intent = INTENTS.includes(data.intent) ? data.intent : 'question';
    return {
      intent,
      isLead: Boolean(data.isLead),
      summary: String(data.summary || '').slice(0, 200),
      source: 'ai',
    };
  } catch (err) {
    console.error(`[inbox] AI classify failed, using keywords: ${err.message}`);
    return heuristicClassify({ text, channelType });
  }
}

/** Draft a reply to a conversation for the owner to review before sending. */
async function draftInboxReply({ brand, conversation, messages }) {
  const anthropic = getAnthropicClient();
  const historyText = messages
    .slice(-12)
    .map((m) => `${m.direction === 'inbound' ? 'THEM' : 'US'}: ${m.text}`)
    .join('\n');

  const style =
    conversation.channelType === 'comment'
      ? 'This is a PUBLIC comment reply: 1-2 short sentences, friendly, and if they asked about price or details, invite them to DM rather than discussing it publicly.'
      : conversation.platform === 'whatsapp'
        ? 'WhatsApp reply: warm, short (2-4 sentences), one clear next step.'
        : 'Direct message reply: casual, short (2-4 sentences), one clear next step.';

  const prompt = `You reply to messages on behalf of ${brand?.brandName || 'our business'}.
What we do: ${brand?.description || 'websites, AI automation and marketing for small businesses'}
Tone: ${brand?.tone || 'friendly, practical'}
Language: reply in the same language the person is writing in (${brand?.language || 'English'} is our default; match Hinglish if they use it).
${brand?.callToAction ? `Our usual call to action: ${brand.callToAction}` : ''}

${style}

Conversation so far (latest last):
${historyText}

Write ONLY the reply text. Don't invent prices, dates or promises - if they ask for a price, offer a quick call or ask one question about their needs instead.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = extractText(response);
  if (!text) throw new Error('AI returned an empty reply');
  return text;
}

module.exports = { classifyMessage, heuristicClassify, draftInboxReply };
