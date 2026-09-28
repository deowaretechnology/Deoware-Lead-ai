// Unified Inbox core: turns an incoming DM/comment into a conversation
// message, decides (with AI) whether it's a lead, creates/updates the lead,
// and sends replies back out on the right platform.
const User = require('../models/User');
const Lead = require('../models/Lead');
const BrandProfile = require('../models/BrandProfile');
const Conversation = require('../models/Conversation');
const InboxMessage = require('../models/InboxMessage');
const { classifyMessage } = require('./inboxAiService');
const { applyInboundReply } = require('./leadService');
const { notifyOwner } = require('./notifyService');
const {
  sendDirectMessage,
  replyToFacebookComment,
  replyToInstagramComment,
  fetchProfile,
} = require('./metaMessagingService');
const { sendWhatsAppText } = require('./whatsappService');

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const PLATFORM_LABEL = { facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp' };

function leadSourceFor(platform, channelType) {
  if (platform === 'whatsapp') return 'whatsapp';
  if (platform === 'instagram') return channelType === 'comment' ? 'instagram_comment' : 'instagram_dm';
  return channelType === 'comment' ? 'facebook_comment' : 'facebook';
}

// What stage an intent justifies. null = don't move the stage.
function stageForIntent(intent) {
  if (intent === 'demo_requested') return 'demo_requested';
  if (intent === 'interested') return 'interested';
  if (intent === 'not_interested' || intent === 'spam') return null;
  return 'replied';
}

class InboxError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Webhooks don't say which CRM user they belong to. This is a personal,
 * single-business setup, so everything goes to INBOX_OWNER_EMAIL (or the
 * first account created, if that's not set).
 */
async function resolveOwner() {
  const email = process.env.INBOX_OWNER_EMAIL;
  const owner = email
    ? await User.findOne({ email: email.toLowerCase() })
    : await User.findOne().sort({ createdAt: 1 });
  if (!owner) throw new InboxError('No CRM user found to receive inbox messages', 500);
  return owner;
}

// Match a WhatsApp number against leads whose phone may be stored as
// "98765 43210", "+91-98765-43210", etc. Compares the last 10 digits.
function phoneRegex(number) {
  const last10 = String(number).replace(/\D/g, '').slice(-10);
  if (last10.length < 10) return null;
  return new RegExp(`${last10.split('').join('\\D*')}\\D*$`);
}

async function findLeadFor(ownerId, conversation) {
  if (conversation.lead) {
    const linked = await Lead.findOne({ _id: conversation.lead, owner: ownerId });
    if (linked) return linked;
  }
  if (conversation.platform === 'whatsapp') {
    const re = phoneRegex(conversation.externalUserId);
    return re ? Lead.findOne({ owner: ownerId, phone: { $regex: re } }) : null;
  }
  return Lead.findOne({
    owner: ownerId,
    [`externalIds.${conversation.platform}`]: conversation.externalUserId,
  });
}

/**
 * Process one normalized inbound event (from webhookParser or the simulator).
 * Safe to call twice with the same message - the second call is a no-op.
 */
async function handleInboundEvent(event, { owner: givenOwner } = {}) {
  const owner = givenOwner || (await resolveOwner());
  const ownerId = owner._id;

  if (event.externalMessageId) {
    const seen = await InboxMessage.exists({ platform: event.platform, externalMessageId: event.externalMessageId });
    if (seen) return { duplicate: true };
  }

  // 1. Conversation
  let conversation = await Conversation.findOne({
    owner: ownerId,
    platform: event.platform,
    channelType: event.channelType,
    externalUserId: event.externalUserId,
  });
  if (!conversation) {
    let { name, username } = event;
    if (!name && !username && event.platform !== 'whatsapp') {
      ({ name = '', username = '' } = await fetchProfile({ platform: event.platform, userId: event.externalUserId }));
    }
    conversation = await Conversation.create({
      owner: ownerId,
      platform: event.platform,
      channelType: event.channelType,
      externalUserId: event.externalUserId,
      name: name || '',
      username: username || '',
    });
  } else if (!conversation.name && event.name) {
    conversation.name = event.name;
  }

  const history = await InboxMessage.find({ conversation: conversation._id })
    .sort({ createdAt: -1 })
    .limit(10);

  // 2. Store the message (unique index catches a webhook retry racing us)
  let message;
  try {
    message = await InboxMessage.create({
      owner: ownerId,
      conversation: conversation._id,
      platform: event.platform,
      direction: 'inbound',
      text: event.text,
      sentBy: conversation.name || conversation.username || 'them',
      externalMessageId: event.externalMessageId || '',
      commentId: event.commentId || '',
      postId: event.postId || '',
    });
  } catch (err) {
    if (err.code === 11000) return { duplicate: true };
    throw err;
  }

  conversation.lastMessageAt = event.timestamp || new Date();
  conversation.lastInboundAt = event.timestamp || new Date();
  conversation.lastMessagePreview = event.text.slice(0, 140);
  conversation.unreadCount = (conversation.unreadCount || 0) + 1;
  conversation.status = 'open';

  // 3. What do they want?
  const brand = await BrandProfile.findOne({ owner: ownerId });
  const classification = await classifyMessage({
    text: event.text,
    channelType: event.channelType,
    platform: event.platform,
    history: history.reverse(),
    brand,
  });
  conversation.intent = classification.intent;
  conversation.intentSummary = classification.summary;

  // 4. Lead: update the existing one, or create one if it's worth it
  const channel = event.platform; // matches Lead activity channel enum
  const displayName = conversation.name || conversation.username || `${PLATFORM_LABEL[event.platform]} user`;
  let lead = await findLeadFor(ownerId, conversation);
  let leadCreated = false;
  let stageChanged = false;

  if (lead) {
    lead.activity.push({ type: 'message', channel, direction: 'inbound', message: event.text, sentBy: displayName });
    if (event.platform !== 'whatsapp' && !lead.externalIds?.[event.platform]) {
      lead.set(`externalIds.${event.platform}`, event.externalUserId);
    }
    const target = stageForIntent(classification.intent);
    if (target) {
      stageChanged = applyInboundReply(lead, target);
    } else {
      lead.autoFollowUp = false;
      lead.nextFollowUpAt = null;
      if (classification.intent === 'not_interested') {
        // Respect it everywhere: no more automatic messages on any channel
        lead.doNotContact = true;
        lead.activity.push({
          type: 'system',
          channel: 'system',
          direction: 'internal',
          message: 'They said they are not interested - marked do-not-contact, all automatic messages stopped. Consider marking this lead Lost.',
          sentBy: 'system',
        });
      }
    }
    await lead.save();
  } else if (classification.isLead) {
    const intentStage = stageForIntent(classification.intent);
    lead = await Lead.create({
      owner: ownerId,
      name: displayName,
      phone: event.platform === 'whatsapp' ? event.externalUserId : '',
      instagramHandle: event.platform === 'instagram' ? conversation.username : '',
      externalIds: event.platform === 'whatsapp' ? {} : { [event.platform]: event.externalUserId },
      source: leadSourceFor(event.platform, event.channelType),
      stage: intentStage === 'demo_requested' || intentStage === 'interested' ? intentStage : 'new',
      autoFollowUp: false, // they came to us - reply by hand, not with a cold follow-up sequence
      activity: [
        {
          type: 'system',
          channel: 'system',
          direction: 'internal',
          message: `Lead created automatically from ${PLATFORM_LABEL[event.platform]} ${event.channelType === 'comment' ? 'comment' : 'message'}. AI: ${classification.summary || classification.intent}`,
          sentBy: 'system',
        },
        { type: 'message', channel, direction: 'inbound', message: event.text, sentBy: displayName },
      ],
    });
    leadCreated = true;
  }

  if (lead) conversation.lead = lead._id;
  await conversation.save();

  // 5. Ping the owner for the things that matter
  if (leadCreated || (classification.intent === 'demo_requested' && lead)) {
    const what = classification.intent === 'demo_requested' ? 'wants a DEMO' : 'looks like a new lead';
    await notifyOwner({
      owner,
      subject: `${displayName} ${what} (${PLATFORM_LABEL[event.platform]})`,
      message: `${displayName} on ${PLATFORM_LABEL[event.platform]} ${what}.\n\nThey said: "${event.text}"\n\nAI summary: ${classification.summary}\n\nOpen your CRM inbox to reply.`,
    });
  }

  return { duplicate: false, conversation, message, lead, leadCreated, stageChanged, classification };
}

/**
 * Send a reply on whatever platform the conversation lives on.
 * Enforces Meta's 24-hour rule for DMs up front with a clear message.
 */
async function sendReply({ owner, conversation, text, sentBy = 'user' }) {
  const clean = String(text || '').trim();
  if (!clean) throw new InboxError('Reply text is required');

  const withinWindow =
    conversation.lastInboundAt && Date.now() - new Date(conversation.lastInboundAt).getTime() < REPLY_WINDOW_MS;

  let externalMessageId = '';
  let commentId = '';

  if (conversation.channelType === 'dm') {
    if (!withinWindow) {
      throw new InboxError(
        `${PLATFORM_LABEL[conversation.platform]} only allows replies within 24 hours of their last message. ` +
          (conversation.platform === 'whatsapp'
            ? 'Use an approved WhatsApp template from the lead page instead.'
            : 'Wait for them to message again, or reach out another way.')
      );
    }
    if (conversation.platform === 'whatsapp') {
      const res = await sendWhatsAppText({ to: conversation.externalUserId, message: clean });
      externalMessageId = res?.messages?.[0]?.id || '';
    } else {
      externalMessageId = await sendDirectMessage({ recipientId: conversation.externalUserId, text: clean });
    }
  } else {
    const lastComment = await InboxMessage.findOne({
      conversation: conversation._id,
      direction: 'inbound',
      commentId: { $gt: '' },
    }).sort({ createdAt: -1 });
    if (!lastComment) throw new InboxError('No comment found to reply to');
    commentId = lastComment.commentId;
    externalMessageId =
      conversation.platform === 'instagram'
        ? await replyToInstagramComment({ commentId, text: clean })
        : await replyToFacebookComment({ commentId, text: clean });
  }

  const message = await InboxMessage.create({
    owner: owner._id,
    conversation: conversation._id,
    platform: conversation.platform,
    direction: 'outbound',
    text: clean,
    sentBy,
    externalMessageId: externalMessageId ? `out_${externalMessageId}` : '',
    commentId,
  });

  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = `You: ${clean.slice(0, 130)}`;
  conversation.unreadCount = 0;
  await conversation.save();

  if (conversation.lead) {
    const lead = await Lead.findOne({ _id: conversation.lead, owner: owner._id });
    if (lead) {
      lead.activity.push({
        type: 'message',
        channel: conversation.platform,
        direction: 'outbound',
        message: clean,
        sentBy,
      });
      lead.lastContactedAt = new Date();
      lead.lastContactedChannel = conversation.platform;
      await lead.save();
    }
  }

  return message;
}

/** Turn a conversation into a lead by hand (when the AI didn't). */
async function createLeadFromConversation({ owner, conversation }) {
  if (conversation.lead) {
    const existing = await Lead.findOne({ _id: conversation.lead, owner: owner._id });
    if (existing) return { lead: existing, created: false };
  }
  const messages = await InboxMessage.find({ conversation: conversation._id }).sort({ createdAt: 1 }).limit(50);
  const displayName = conversation.name || conversation.username || `${PLATFORM_LABEL[conversation.platform]} user`;

  const lead = await Lead.create({
    owner: owner._id,
    name: displayName,
    phone: conversation.platform === 'whatsapp' ? conversation.externalUserId : '',
    instagramHandle: conversation.platform === 'instagram' ? conversation.username : '',
    externalIds: conversation.platform === 'whatsapp' ? {} : { [conversation.platform]: conversation.externalUserId },
    source: leadSourceFor(conversation.platform, conversation.channelType),
    stage: ['demo_requested', 'interested'].includes(conversation.intent) ? conversation.intent : 'new',
    autoFollowUp: false,
    activity: [
      {
        type: 'system',
        channel: 'system',
        direction: 'internal',
        message: `Lead created from ${PLATFORM_LABEL[conversation.platform]} inbox conversation`,
        sentBy: 'user',
      },
      ...messages.map((m) => ({
        type: 'message',
        channel: conversation.platform,
        direction: m.direction,
        message: m.text,
        sentBy: m.direction === 'inbound' ? displayName : m.sentBy,
      })),
    ],
  });

  conversation.lead = lead._id;
  await conversation.save();
  return { lead, created: true };
}

module.exports = {
  handleInboundEvent,
  sendReply,
  createLeadFromConversation,
  resolveOwner,
  phoneRegex,
  stageForIntent,
  InboxError,
};
