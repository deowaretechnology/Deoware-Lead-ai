const mongoose = require('mongoose');

// One per user. This is what the Content Agent "knows" about your brand -
// every generated post is written from this, so the better you fill it in,
// the less generic the posts get.
const brandProfileSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    brandName: { type: String, trim: true, default: '' },
    description: {
      type: String,
      trim: true,
      default: '', // e.g. "We build AI agents and websites for small businesses in India"
    },
    targetAudience: {
      type: String,
      trim: true,
      default: '', // e.g. "Salon, bakery, boutique and real-estate owners who get leads on WhatsApp/Instagram"
    },
    tone: {
      type: String,
      trim: true,
      default: 'friendly, confident, practical - no hype',
    },
    language: {
      type: String,
      trim: true,
      default: 'English', // or "Hinglish"
    },
    contentPillars: {
      type: [String],
      default: [], // e.g. ["AI automation tips", "client results", "behind the scenes", "myth vs fact"]
    },
    callToAction: {
      type: String,
      trim: true,
      default: '', // e.g. "DM 'AI' for a free demo"
    },
    defaultPlatforms: {
      type: [String],
      enum: ['facebook', 'instagram', 'linkedin'],
      default: ['facebook', 'instagram'],
    },
    // Daily automation
    autoGenerate: { type: Boolean, default: false }, // create one new post draft every day
    autoPublish: { type: Boolean, default: false }, // schedule that draft automatically instead of waiting for approval
    postingHour: { type: Number, min: 0, max: 23, default: 19 }, // local hour to publish auto posts (19 = 7 PM)
    timezoneOffsetMinutes: { type: Number, default: 330 }, // IST = +330
  },
  { timestamps: true }
);

module.exports = mongoose.model('BrandProfile', brandProfileSchema);
