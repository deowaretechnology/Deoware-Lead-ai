const mongoose = require('mongoose');

const inboxMessageSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    platform: { type: String, enum: ['facebook', 'instagram', 'whatsapp'], required: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    text: { type: String, default: '' },
    sentBy: { type: String, default: '' }, // 'user' | 'ai' | the sender's name for inbound

    // Ids from Meta. externalMessageId dedupes webhook retries.
    externalMessageId: { type: String, default: '' },
    commentId: { type: String, default: '' }, // for comments: reply target
    postId: { type: String, default: '' }, // which post/media the comment was on
  },
  { timestamps: true }
);

// Meta retries webhooks - the same message must never be stored twice.
inboxMessageSchema.index(
  { platform: 1, externalMessageId: 1 },
  { unique: true, partialFilterExpression: { externalMessageId: { $gt: '' } } }
);

module.exports = mongoose.model('InboxMessage', inboxMessageSchema);
