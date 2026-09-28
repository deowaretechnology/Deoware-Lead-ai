const mongoose = require('mongoose');

// Counts paid API calls per month so we can stop before leaving the free tier.
const apiUsageSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    api: { type: String, required: true }, // e.g. 'places_text_search'
    month: { type: String, required: true }, // 'YYYY-MM' (UTC)
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

apiUsageSchema.index({ owner: 1, api: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('ApiUsage', apiUsageSchema);
