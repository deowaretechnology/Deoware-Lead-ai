const mongoose = require('mongoose');

// A business found by the Lead Finder. Stays here (not in the pipeline)
// until you choose to import it - so a big search doesn't flood your CRM.
const prospectSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    placeId: { type: String, required: true }, // Google place id - dedupes repeat searches
    name: { type: String, required: true, trim: true },
    category: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' }, // international format when Google has it
    website: { type: String, default: '' },
    rating: { type: Number, default: null },
    reviewCount: { type: Number, default: 0 },
    mapsUrl: { type: String, default: '' },
    businessStatus: { type: String, default: '' },

    // Filled in by "Find contacts" (scrapes the business's own website)
    emails: { type: [String], default: [] },
    extraPhones: { type: [String], default: [] },
    socials: {
      instagram: { type: String, default: '' },
      facebook: { type: String, default: '' },
      whatsapp: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      youtube: { type: String, default: '' },
    },
    enrichedAt: { type: Date, default: null },
    enrichError: { type: String, default: '' },

    score: { type: Number, default: 0, index: true }, // 0-100, higher = better prospect for us
    scoreReasons: { type: [String], default: [] },
    searchQuery: { type: String, default: '' },
    source: { type: String, enum: ['search', 'auto', 'csv'], default: 'search' }, // how it got here

    status: { type: String, enum: ['new', 'imported', 'dismissed'], default: 'new', index: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  },
  { timestamps: true }
);

prospectSchema.index({ owner: 1, placeId: 1 }, { unique: true });

module.exports = mongoose.model('Prospect', prospectSchema);
