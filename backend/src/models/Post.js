const mongoose = require('mongoose');

const platformResultSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'published', 'failed', 'manual'],
      default: 'pending',
    },
    postId: { type: String, default: '' },
    error: { type: String, default: '' },
    publishedAt: { type: Date, default: null },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    topic: { type: String, trim: true, default: '' },
    pillar: { type: String, trim: true, default: '' },
    caption: {
      type: String,
      required: [true, 'Caption is required'],
    },
    hashtags: { type: [String], default: [] },
    // Instagram REQUIRES an image, and it must be a public URL Meta can fetch
    // (e.g. a Cloudinary/Imgur/Canva-share link). Facebook can post text-only.
    imageUrl: { type: String, trim: true, default: '' },
    // AI's suggestion for the visual, so you can make it in Canva or any image tool
    imagePrompt: { type: String, default: '' },
    platforms: {
      type: [String],
      enum: ['facebook', 'instagram', 'linkedin'],
      default: ['facebook', 'instagram'],
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'publishing', 'published', 'partially_published', 'failed'],
      default: 'draft',
      index: true,
    },
    scheduledAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    results: {
      facebook: { type: platformResultSchema, default: () => ({}) },
      instagram: { type: platformResultSchema, default: () => ({}) },
      linkedin: { type: platformResultSchema, default: () => ({}) },
    },
    generatedBy: { type: String, enum: ['ai', 'user'], default: 'user' },
    metricsUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Scheduler query: due scheduled posts
postSchema.index({ status: 1, scheduledAt: 1 });

// Full caption as it will actually be posted (caption + hashtags)
postSchema.methods.fullCaption = function () {
  const tags = (this.hashtags || [])
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .join(' ');
  return tags ? `${this.caption}\n\n${tags}` : this.caption;
};

postSchema.methods.engagement = function () {
  const r = this.results || {};
  return ['facebook', 'instagram', 'linkedin'].reduce(
    (sum, p) => sum + ((r[p]?.likes || 0) + (r[p]?.comments || 0) * 2),
    0
  );
};

module.exports = mongoose.model('Post', postSchema);
