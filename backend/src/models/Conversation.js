const mongoose = require('mongoose');

// One conversation = one person on one platform, in one place (DMs or
// comments). Every incoming DM/comment lands in one of these.
const conversationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: { type: String, enum: ['facebook', 'instagram', 'whatsapp'], required: true },
    channelType: { type: String, enum: ['dm', 'comment'], required: true },
    externalUserId: { type: String, required: true }, // PSID / IGSID / WhatsApp number
    name: { type: String, default: '' },
    username: { type: String, default: '' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },

    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, default: '' },
    lastInboundAt: { type: Date, default: null }, // for the 24h reply window
    unreadCount: { type: Number, default: 0 },

    // Latest AI read of what this person wants
    intent: {
      type: String,
      enum: ['demo_requested', 'interested', 'question', 'not_interested', 'spam', 'casual', 'unknown'],
      default: 'unknown',
    },
    intentSummary: { type: String, default: '' },

    status: { type: String, enum: ['open', 'archived'], default: 'open' },
  },
  { timestamps: true }
);

conversationSchema.index(
  { owner: 1, platform: 1, channelType: 1, externalUserId: 1 },
  { unique: true }
);
conversationSchema.index({ owner: 1, status: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
