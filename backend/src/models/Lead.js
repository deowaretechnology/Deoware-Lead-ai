const mongoose = require('mongoose');

// One entry per message/note/event on a lead's timeline.
// This is what later phases (auto-outreach, follow-up scheduler, AI replies)
// will read from and write to.
const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['note', 'message', 'stage_change', 'system'],
      default: 'note',
    },
    channel: {
      type: String,
      enum: ['whatsapp', 'email', 'instagram', 'facebook', 'linkedin', 'manual', 'system'],
      default: 'manual',
    },
    direction: {
      type: String,
      enum: ['outbound', 'inbound', 'internal'],
      default: 'internal',
    },
    message: {
      type: String,
      required: true,
    },
    sentBy: {
      type: String, // 'ai' | 'user' | the sender's name/number for inbound
      default: 'user',
    },
  },
  { timestamps: true }
);

const leadSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Lead name is required'],
      trim: true,
    },
    businessName: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    instagramHandle: {
      type: String,
      trim: true,
      default: '',
    },
    website: {
      type: String,
      trim: true,
      default: '',
    },
    facebookUrl: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    // Platform user ids from the Unified Inbox (Phase 4), so a second message
    // from the same person lands on the same lead instead of creating a new one.
    externalIds: {
      facebook: { type: String, default: '' }, // Messenger PSID / commenter id
      instagram: { type: String, default: '' }, // Instagram-scoped user id
    },
    source: {
      type: String,
      enum: [
        'manual',
        'instagram_dm',
        'instagram_comment',
        'whatsapp',
        'facebook',
        'facebook_comment',
        'google_maps',
        'linkedin',
        'website',
        'referral',
        'other',
      ],
      default: 'manual',
    },
    stage: {
      type: String,
      enum: [
        'new',
        'contacted',
        'replied',
        'interested',
        'demo_requested',
        'converted',
        'lost',
      ],
      default: 'new',
      index: true,
    },
    dealValue: {
      type: Number,
      default: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
    activity: {
      type: [activitySchema],
      default: [],
    },
    nextFollowUpAt: {
      type: Date,
      default: null,
    },
    lastContactedAt: {
      type: Date,
      default: null,
    },
    lastContactedChannel: {
      type: String,
      enum: ['whatsapp', 'email', 'instagram', 'facebook', 'linkedin', 'manual', null],
      default: null,
    },
    // Channels we've already messaged this lead on (for the Today send lists)
    contactedChannels: {
      type: [String],
      default: [],
    },
    followUpCount: {
      type: Number,
      default: 0,
    },
    autoFollowUp: {
      type: Boolean,
      default: true, // set to false once max follow-ups are hit, or manually paused
    },
    // Opted out (unsubscribed, said "stop" / "not interested"). Nothing
    // automatic is ever sent to this lead again.
    doNotContact: {
      type: Boolean,
      default: false,
      index: true,
    },
    unsubscribeToken: {
      type: String,
      default: undefined,
      index: { unique: true, sparse: true },
    },
    emailStatus: {
      type: String,
      enum: ['unknown', 'valid', 'risky', 'invalid'],
      default: 'unknown',
    },
    emailCheckedAt: {
      type: Date,
      default: null,
    },
    lostReason: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Helpful compound index for pipeline board queries (per-user, per-stage)
leadSchema.index({ owner: 1, stage: 1, createdAt: -1 });

// Inbox lookups: find the lead behind an incoming message
leadSchema.index({ owner: 1, 'externalIds.facebook': 1 });
leadSchema.index({ owner: 1, 'externalIds.instagram': 1 });
leadSchema.index({ owner: 1, phone: 1 });

// Used by the follow-up scheduler to find leads that are due
leadSchema.index({ autoFollowUp: 1, nextFollowUpAt: 1, stage: 1 });

module.exports = mongoose.model('Lead', leadSchema);
