const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const Conversation = require('../models/Conversation');
const InboxMessage = require('../models/InboxMessage');
const BrandProfile = require('../models/BrandProfile');
const {
  handleInboundEvent,
  sendReply,
  createLeadFromConversation,
  InboxError,
} = require('../services/inboxService');
const { draftInboxReply } = require('../services/inboxAiService');

// Let InboxError carry its own HTTP status through the central error handler
function rethrow(res, err) {
  if (err instanceof InboxError) res.status(err.statusCode);
  throw err;
}

async function findOwnConversation(req, res) {
  const conversation = await Conversation.findOne({ _id: req.params.id, owner: req.user._id });
  if (!conversation) {
    res.status(404);
    throw new Error('Conversation not found');
  }
  return conversation;
}

// @desc    List conversations
// @route   GET /api/inbox/conversations?filter=open|unread|leads|archived|all&platform=
const listConversations = asyncHandler(async (req, res) => {
  const { filter = 'open', platform } = req.query;
  const query = { owner: req.user._id };
  if (platform) query.platform = platform;
  if (filter === 'archived') query.status = 'archived';
  else if (filter !== 'all') query.status = 'open';
  if (filter === 'unread') query.unreadCount = { $gt: 0 };
  if (filter === 'leads') query.lead = { $ne: null };

  const conversations = await Conversation.find(query)
    .sort({ lastMessageAt: -1 })
    .limit(200)
    .populate('lead', 'name stage');
  res.json({ success: true, count: conversations.length, data: conversations });
});

// @desc    Total unread (for the navbar badge)
// @route   GET /api/inbox/unread-count
const unreadCount = asyncHandler(async (req, res) => {
  const [row] = await Conversation.aggregate([
    { $match: { owner: req.user._id, status: 'open' } },
    { $group: { _id: null, total: { $sum: '$unreadCount' } } },
  ]);
  res.json({ success: true, data: { unread: row?.total || 0 } });
});

// @desc    One conversation with its messages (marks it read)
// @route   GET /api/inbox/conversations/:id
const getConversation = asyncHandler(async (req, res) => {
  const conversation = await findOwnConversation(req, res);
  const messages = await InboxMessage.find({ conversation: conversation._id }).sort({ createdAt: 1 }).limit(300);

  if (conversation.unreadCount > 0) {
    conversation.unreadCount = 0;
    await conversation.save();
  }
  await conversation.populate('lead', 'name stage');

  res.json({ success: true, data: { conversation, messages } });
});

// @desc    AI-drafted reply (not sent)
// @route   POST /api/inbox/conversations/:id/draft
const draftReply = asyncHandler(async (req, res) => {
  const conversation = await findOwnConversation(req, res);
  const messages = await InboxMessage.find({ conversation: conversation._id }).sort({ createdAt: 1 }).limit(50);
  const brand = await BrandProfile.findOne({ owner: req.user._id });
  const text = await draftInboxReply({ brand, conversation, messages });
  res.json({ success: true, data: { text } });
});

// @desc    Send a reply on the conversation's platform
// @route   POST /api/inbox/conversations/:id/reply   { text, sentBy? }
const reply = asyncHandler(async (req, res) => {
  const conversation = await findOwnConversation(req, res);
  try {
    const message = await sendReply({
      owner: req.user,
      conversation,
      text: req.body.text,
      sentBy: req.body.sentBy === 'ai' ? 'ai' : 'user',
    });
    res.status(201).json({ success: true, data: message });
  } catch (err) {
    rethrow(res, err);
  }
});

// @desc    Turn this conversation into a CRM lead
// @route   POST /api/inbox/conversations/:id/lead
const createLead = asyncHandler(async (req, res) => {
  const conversation = await findOwnConversation(req, res);
  const { lead, created } = await createLeadFromConversation({ owner: req.user, conversation });
  res.status(created ? 201 : 200).json({ success: true, data: lead, created });
});

// @desc    Archive / reopen
// @route   PATCH /api/inbox/conversations/:id   { status }
const updateConversation = asyncHandler(async (req, res) => {
  const conversation = await findOwnConversation(req, res);
  if (!['open', 'archived'].includes(req.body.status)) {
    res.status(400);
    throw new Error('status must be "open" or "archived"');
  }
  conversation.status = req.body.status;
  await conversation.save();
  res.json({ success: true, data: conversation });
});

// @desc    Fake an incoming message to try the inbox without Meta set up.
//          Disabled in production.
// @route   POST /api/inbox/simulate   { platform, channelType, name, text, externalUserId? }
const simulate = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404);
    throw new Error('Not available in production');
  }
  const { platform = 'instagram', channelType = 'dm', name = 'Test User', text, externalUserId } = req.body;
  if (!text) {
    res.status(400);
    throw new Error('text is required');
  }
  if (!['facebook', 'instagram', 'whatsapp'].includes(platform) || !['dm', 'comment'].includes(channelType)) {
    res.status(400);
    throw new Error('Invalid platform or channelType');
  }
  if (platform === 'whatsapp' && channelType === 'comment') {
    res.status(400);
    throw new Error('WhatsApp has no comments');
  }

  const id = crypto.randomBytes(6).toString('hex');
  const result = await handleInboundEvent(
    {
      platform,
      channelType,
      externalUserId: externalUserId || (platform === 'whatsapp' ? `9199${Date.now().toString().slice(-8)}` : `sim_${name.toLowerCase().replace(/\W+/g, '_')}`),
      name: platform === 'instagram' ? '' : name,
      username: platform === 'instagram' ? name.toLowerCase().replace(/\s+/g, '_') : '',
      text,
      externalMessageId: `sim_${id}`,
      commentId: channelType === 'comment' ? `sim_comment_${id}` : '',
      postId: channelType === 'comment' ? 'sim_post' : '',
      timestamp: new Date(),
    },
    { owner: req.user }
  );

  res.status(201).json({
    success: true,
    data: {
      conversationId: result.conversation?._id,
      leadId: result.lead?._id || null,
      leadCreated: result.leadCreated,
      classification: result.classification,
    },
  });
});

module.exports = {
  listConversations,
  unreadCount,
  getConversation,
  draftReply,
  reply,
  createLead,
  updateConversation,
  simulate,
};
