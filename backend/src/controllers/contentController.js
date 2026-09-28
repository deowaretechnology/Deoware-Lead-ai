const asyncHandler = require('express-async-handler');
const BrandProfile = require('../models/BrandProfile');
const Post = require('../models/Post');
const {
  createAiPost,
  publishPost,
  syncPostMetrics,
  nextPostingTime,
} = require('../services/contentEngine');

const BRAND_FIELDS = [
  'brandName',
  'description',
  'targetAudience',
  'tone',
  'language',
  'contentPillars',
  'callToAction',
  'defaultPlatforms',
  'autoGenerate',
  'autoPublish',
  'postingHour',
  'timezoneOffsetMinutes',
];

const POST_EDITABLE_FIELDS = ['topic', 'pillar', 'caption', 'hashtags', 'imageUrl', 'imagePrompt', 'platforms'];

async function getOrCreateBrand(user) {
  let brand = await BrandProfile.findOne({ owner: user._id });
  if (!brand) {
    brand = await BrandProfile.create({ owner: user._id, brandName: user.businessName || user.name });
  }
  return brand;
}

async function findOwnPost(req, res) {
  const post = await Post.findOne({ _id: req.params.id, owner: req.user._id });
  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }
  return post;
}

// Instagram can't post without an image - catch it before we try.
function assertPublishable(post, res) {
  if (post.platforms.includes('instagram') && !post.imageUrl) {
    res.status(400);
    throw new Error('Instagram needs an image - add a public image URL, or remove Instagram from this post');
  }
}

// @desc    Get (or create) the brand profile
// @route   GET /api/content/brand
const getBrand = asyncHandler(async (req, res) => {
  const brand = await getOrCreateBrand(req.user);
  res.json({ success: true, data: brand });
});

// @desc    Update the brand profile / automation settings
// @route   PUT /api/content/brand
const updateBrand = asyncHandler(async (req, res) => {
  const brand = await getOrCreateBrand(req.user);
  BRAND_FIELDS.forEach((field) => {
    if (req.body[field] !== undefined) brand[field] = req.body[field];
  });
  await brand.save();
  res.json({ success: true, data: brand });
});

// @desc    Generate a new post draft with AI
// @route   POST /api/content/generate   { topic?, platforms? }
const generate = asyncHandler(async (req, res) => {
  const brand = await getOrCreateBrand(req.user);
  const post = await createAiPost({
    ownerId: req.user._id,
    brand,
    topic: req.body.topic,
    platforms: req.body.platforms,
  });
  res.status(201).json({ success: true, data: post });
});

// @desc    List posts
// @route   GET /api/content?status=draft
const listPosts = asyncHandler(async (req, res) => {
  const query = { owner: req.user._id };
  if (req.query.status) query.status = req.query.status;
  const posts = await Post.find(query).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, count: posts.length, data: posts });
});

// @desc    Create a post manually (no AI)
// @route   POST /api/content
const createPost = asyncHandler(async (req, res) => {
  const data = { owner: req.user._id, generatedBy: 'user' };
  POST_EDITABLE_FIELDS.forEach((f) => {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  });
  const post = await Post.create(data);
  res.status(201).json({ success: true, data: post });
});

// @desc    Edit a post (only while not yet published)
// @route   PUT /api/content/:id
const updatePost = asyncHandler(async (req, res) => {
  const post = await findOwnPost(req, res);
  if (['publishing', 'published'].includes(post.status)) {
    res.status(400);
    throw new Error('This post is already published and can no longer be edited here');
  }
  POST_EDITABLE_FIELDS.forEach((f) => {
    if (req.body[f] !== undefined) post[f] = req.body[f];
  });
  await post.save();
  res.json({ success: true, data: post });
});

// @desc    Delete a post (from the CRM only - does not delete it from Facebook/Instagram)
// @route   DELETE /api/content/:id
const deletePost = asyncHandler(async (req, res) => {
  const post = await findOwnPost(req, res);
  await post.deleteOne();
  res.json({ success: true, data: {} });
});

// @desc    Schedule a post. No scheduledAt = next posting slot from brand settings
// @route   POST /api/content/:id/schedule   { scheduledAt? }
const schedulePost = asyncHandler(async (req, res) => {
  const post = await findOwnPost(req, res);
  if (['publishing', 'published'].includes(post.status)) {
    res.status(400);
    throw new Error('This post is already published');
  }
  assertPublishable(post, res);

  let when;
  if (req.body.scheduledAt) {
    when = new Date(req.body.scheduledAt);
    if (Number.isNaN(when.getTime())) {
      res.status(400);
      throw new Error('scheduledAt is not a valid date');
    }
  } else {
    const brand = await getOrCreateBrand(req.user);
    when = nextPostingTime(brand);
  }

  post.scheduledAt = when;
  post.status = 'scheduled';
  await post.save();
  res.json({ success: true, data: post });
});

// @desc    Move a scheduled post back to draft
// @route   POST /api/content/:id/unschedule
const unschedulePost = asyncHandler(async (req, res) => {
  const post = await findOwnPost(req, res);
  if (post.status !== 'scheduled') {
    res.status(400);
    throw new Error('Only scheduled posts can be unscheduled');
  }
  post.status = 'draft';
  post.scheduledAt = null;
  await post.save();
  res.json({ success: true, data: post });
});

// @desc    Publish right now (also retries failed platforms on a partial/failed post)
// @route   POST /api/content/:id/publish
const publishNow = asyncHandler(async (req, res) => {
  const post = await findOwnPost(req, res);
  if (post.status === 'published') {
    res.status(400);
    throw new Error('This post is already published');
  }
  if (post.status === 'publishing') {
    res.status(409);
    throw new Error('This post is being published right now');
  }
  assertPublishable(post, res);
  const result = await publishPost(post);
  res.json({ success: true, data: result });
});

// @desc    Refresh likes/comments for a published post
// @route   POST /api/content/:id/metrics
const refreshMetrics = asyncHandler(async (req, res) => {
  const post = await findOwnPost(req, res);
  const updated = await syncPostMetrics(post);
  res.json({ success: true, data: updated });
});

module.exports = {
  getBrand,
  updateBrand,
  generate,
  listPosts,
  createPost,
  updatePost,
  deletePost,
  schedulePost,
  unschedulePost,
  publishNow,
  refreshMetrics,
};
