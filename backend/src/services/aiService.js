const { AI_MODEL } = require('../config/outreachConfig');
const { getAnthropicClient, extractText } = require('./anthropicClient');

const getClient = getAnthropicClient;

const CHANNEL_STYLE = {
  whatsapp: 'Casual, warm, short (2-4 sentences). Fine to use one emoji. No formal sign-off.',
  email: 'A little more structured - short subject-less body, still friendly, 3-5 sentences, one clear call to action.',
  instagram: 'Very casual, like a DM to a friend, 2-3 sentences, no corporate tone.',
  facebook: 'Casual, similar to Instagram, 2-3 sentences.',
  linkedin: 'Professional but still human, 3-4 sentences, no hard sales pitch.',
  manual: 'Casual and short.',
};

const SOCIAL_ONLY = /(instagram\.com|facebook\.com|fb\.com|wa\.me|whatsapp\.com|linktr\.ee|business\.site|justdial\.com|sulekha\.com|indiamart\.com)/i;

// The single most useful fact for a web/AI agency pitch.
function websiteContext(lead) {
  if (!lead.website) return 'none found - they do not seem to have a website (a strong, natural reason to reach out)';
  if (SOCIAL_ONLY.test(lead.website)) return `only a social/listing page (${lead.website}) - no proper website of their own`;
  return `${lead.website} - they already have one, so pitch improvements/automation rather than a new website`;
}

/**
 * Draft a first-touch or follow-up outreach message for a lead using Claude.
 * @param {object} params
 * @param {import('../models/Lead')} params.lead
 * @param {'first_touch'|'follow_up'} params.type
 * @param {string} params.channel - whatsapp | email | instagram | facebook | linkedin | manual
 * @param {string} params.senderBusinessName - the CRM owner's business name, used for signing off
 * @returns {Promise<string>}
 */
async function draftOutreachMessage({ lead, type, channel, senderBusinessName }) {
  const anthropic = getClient();
  const style = CHANNEL_STYLE[channel] || CHANNEL_STYLE.manual;

  const followUpCount = lead.followUpCount || 0;
  const context =
    type === 'follow_up'
      ? `This is follow-up #${followUpCount + 1}. We already reached out before and haven't heard back. Don't be pushy - keep it light, and give them an easy way to say "not interested" without feeling bad.`
      : `This is the very first message to this lead. Introduce why we're reaching out.`;

  const prompt = `You are writing a ${type === 'follow_up' ? 'follow-up' : 'first-touch'} outreach message on behalf of "${senderBusinessName || 'our studio'}", a web/digital agency, to a potential client lead.

Lead details:
- Name: ${lead.name}
- Business: ${lead.businessName || 'unknown business'}
- How we found them / source: ${lead.source}${lead.tags?.length ? `\n- Business type: ${lead.tags.join(', ')}` : ''}${lead.address ? `\n- Location: ${lead.address}` : ''}
- Website: ${websiteContext(lead)}
${lead.source === 'google_maps' ? '\nWe found them on Google Maps. Mention something specific and true about them (their area, their type of business, their reviews) - never claim we have been to their shop or are an existing customer.\n' : ''}
Channel: ${channel}
Style for this channel: ${style}

${context}

Write ONLY the message text - no subject line, no explanation, no quotation marks around it. Do not use placeholders like [Name] - use the actual lead name given above. Keep it human, not salesy or generic-sounding.`;

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = extractText(response);

  if (!text) {
    throw new Error('AI returned an empty draft');
  }

  return text;
}

module.exports = { draftOutreachMessage, websiteContext, SOCIAL_ONLY };
