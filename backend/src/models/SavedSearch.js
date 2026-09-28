const mongoose = require('mongoose');

// A search the Auto-Finder runs by itself every day, e.g.
// "beauty salon" in [Salt Lake, New Town, Park Street] (India), or
// "bakery" in [Dubai Marina, Jumeirah, Deira] (UAE).
// Big cities are split into areas because Google returns at most 60
// results per search - one area per run, rotating, gives hundreds per city.
const savedSearchSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    businessType: { type: String, required: [true, 'Business type is required'], trim: true },
    areas: {
      type: [String],
      validate: { validator: (a) => Array.isArray(a) && a.length > 0, message: 'Add at least one area' },
    },
    country: { type: String, default: 'IN', uppercase: true, trim: true }, // 2-letter region code
    active: { type: Boolean, default: true },
    nextAreaIndex: { type: Number, default: 0 },
    lastRunAt: { type: Date, default: null },
    totalFound: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
