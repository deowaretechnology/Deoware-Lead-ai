const { getAnthropicClient, extractText } = require('./anthropicClient');
const { AI_MODEL } = require('../config/contentConfig');

const PLATFORM_NOTES = {
  instagram: 'Instagram: hook in the first line (it gets cut off after ~125 chars), short lines, 1-3 emojis max, 8-15 relevant hashtags.',
  facebook: 'Facebook: conversational, can be a bit longer, ask a question to drive comments.',
  linkedin: 'LinkedIn: professional but human, story or insight led, 3-5 hashtags max, no emoji spam.',
};

/**
 * Pull the first JSON object out of a model response, tolerating stray
 * text or ```json fences around it.
 */
function parseJsonObject(text) {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AI did not return valid JSON');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Generate one social post from the brand profile.
 * @param {object} params
 * @param {object} params.brand - BrandProfile document (or plain object)
 * @param {string[]} params.platforms
 * @param {string} [params.topic] - optional: force a topic; otherwise AI picks one
 * @param {string[]} [params.recentTopics] - topics already covered, to avoid repeats
 * @param {{topic:string, caption:string, engagement:number}[]} [params.topPosts] - best performers so far
 * @returns {Promise<{topic:string, pillar:string, caption:string, hashtags:string[], imagePrompt:string}>}
 */
async function generatePost({ brand, platforms, topic, recentTopics = [], topPosts = [] }) {
  const anthropic = getAnthropicClient();

  const platformGuidance = platforms
    .map((p) => PLATFORM_NOTES[p])
    .filter(Boolean)
    .join('\n');

  const pillars = brand.contentPillars?.length
    ? brand.contentPillars.join(', ')
    : 'practical tips, client results, behind the scenes, common myths';

  const performanceContext = topPosts.length
    ? `These past posts performed best for us (higher = more likes/comments). Learn from what made them work - angle, hook, format - but do not copy them:\n${topPosts
        .map((p, i) => `${i + 1}. [engagement ${p.engagement}] ${p.topic}: "${p.caption.slice(0, 200)}"`)
        .join('\n')}`
    : 'No performance data yet - pick a strong, specific angle.';

  const avoidContext = recentTopics.length
    ? `Topics already covered recently (do NOT repeat these): ${recentTopics.join('; ')}`
    : '';

  const prompt = `You are the social media content writer for this brand.

Brand name: ${brand.brandName || 'our brand'}
What we do: ${brand.description || 'digital/AI services for small businesses'}
Target audience: ${brand.targetAudience || 'small business owners'}
Tone: ${brand.tone || 'friendly, practical'}
Language: ${brand.language || 'English'}
Content pillars: ${pillars}
Call to action to end with: ${brand.callToAction || 'invite them to DM us'}

Platforms this post goes to: ${platforms.join(', ')}
${platformGuidance}

${performanceContext}

${avoidContext}

${topic ? `Write the post about this topic: ${topic}` : 'Pick ONE specific, useful topic from the content pillars.'}

Rules:
- Make it specific and useful to the target audience - a real tip, example or number, not generic motivation.
- Strong first line (hook). End with the call to action.
- Do not put hashtags inside the caption - return them separately.
- The image prompt should describe a simple, clean visual that could be made in Canva or an AI image tool (include any short text overlay).

Return ONLY a JSON object, no other text:
{"topic": "...", "pillar": "...", "caption": "...", "hashtags": ["...", "..."], "imagePrompt": "..."}`;

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  const data = parseJsonObject(extractText(response));

  if (!data.caption) throw new Error('AI returned a post without a caption');

  return {
    topic: String(data.topic || topic || '').trim(),
    pillar: String(data.pillar || '').trim(),
    caption: String(data.caption).trim(),
    hashtags: Array.isArray(data.hashtags)
      ? data.hashtags.map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean)
      : [],
    imagePrompt: String(data.imagePrompt || '').trim(),
  };
}

module.exports = { generatePost, parseJsonObject };
