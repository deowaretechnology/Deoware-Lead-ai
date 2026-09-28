const mongoose = require('mongoose');

// One row per outreach message actually sent (or logged as sent by hand).
// Used for daily limits ("20 WhatsApp a day") and the Today page counts.
const outreachEventSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    channel: { type: String, enum: ['whatsapp', 'email', 'instagram', 'facebook', 'linkedin', 'manual'], required: true },
    type: { type: String, enum: ['first_touch', 'follow_up'], default: 'first_touch' },
    auto: { type: Boolean, default: false }, // sent by the system vs logged by you
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

outreachEventSchema.index({ owner: 1, channel: 1, createdAt: -1 });

module.exports = mongoose.model('OutreachEvent', outreachEventSchema);
