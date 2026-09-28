// Shared Content Agent logic, used by both the API controller and the cron jobs.
const Post = require('../models/Post');
const { generatePost } = require('./contentAiService');
const {
  publishToFacebook,
  publishToInstagram,
  getFacebookMetrics,
  getInstagramMetrics,
} = require('./metaService');
const { TOP_POSTS_FOR_CONTEXT, RECENT_TOPICS_TO_AVOID } = require('../config/contentConfig');

// Mongoose subdocuments carry internal fields - convert before spreading.
const plain = (r) => (r && typeof r.toObject === 'function' ? r.toObject() : r || {});

/**
 * What the AI should know before writing: recent topics (to avoid repeats)
 * and the best performers so far (to learn from). This is the "gets better
 * over time" loop - it only has data once posts are published and metrics synced.
 */
async function buildGenerationContext(ownerId) {
  const recent = await Post.find({ owner: ownerId, topic: { $ne: '' } })
    .sort({ createdAt: -1 })
    .limit(RECENT_TOPICS_TO_AVOID)
    .select('topic');

  const published = await Post.find({
    owner: ownerId,
    status: { $in: ['published', 'partially_published'] },
  })
    .sort({ publishedAt: -1 })
    .limit(60);

  const topPosts = published
    .map((p) => ({ topic: p.topic, caption: p.caption, engagement: p.engagement() }))
    .filter((p) => p.engagement > 0)
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, TOP_POSTS_FOR_CONTEXT);

  return { recentTopics: recent.map((p) => p.topic), topPosts };
}

/** Ask the AI for a post and save it as a draft. */
async function createAiPost({ ownerId, brand, topic, platforms }) {
  const targetPlatforms = platforms?.length ? platforms : brand.defaultPlatforms;
  const context = await buildGenerationContext(ownerId);

  const generated = await generatePost({
    brand,
    platforms: targetPlatforms,
    topic,
    recentTopics: context.recentTopics,
    topPosts: context.topPosts,
  });

  return Post.create({
    owner: ownerId,
    ...generated,
    platforms: targetPlatforms,
    status: 'draft',
    generatedBy: 'ai',
  });
}

/**
 * Publish a post to every platform it targets. Safe to call again on a
 * partially failed post - platforms that already succeeded are skipped.
 * LinkedIn is marked "manual" (no auto-posting for personal profiles).
 */
async function publishPost(post) {
  const message = post.fullCaption();
  post.status = 'publishing';
  await post.save();

  for (const platform of post.platforms) {
    const result = plain(post.results[platform]);
    if (result.status === 'published' || result.status === 'manual') continue;

    try {
      let platformPostId = '';
      if (platform === 'facebook') {
        platformPostId = await publishToFacebook({ message, imageUrl: post.imageUrl });
      } else if (platform === 'instagram') {
        platformPostId = await publishToInstagram({ caption: message, imageUrl: post.imageUrl });
      } else if (platform === 'linkedin') {
        post.results.linkedin = { ...result, status: 'manual', error: '' };
        continue;
      }
      post.results[platform] = {
        ...result,
        status: 'published',
        postId: platformPostId,
        error: '',
        publishedAt: new Date(),
      };
    } catch (err) {
      post.results[platform] = { ...result, status: 'failed', error: err.message };
    }
  }

  const autoPlatforms = post.platforms.filter((p) => p !== 'linkedin');
  const statuses = autoPlatforms.map((p) => post.results[p]?.status);
  const succeeded = statuses.filter((s) => s === 'published').length;

  if (autoPlatforms.length === 0 || succeeded === autoPlatforms.length) {
    post.status = 'published';
  } else if (succeeded > 0) {
    post.status = 'partially_published';
  } else {
    post.status = 'failed';
  }

  if (succeeded > 0 || autoPlatforms.length === 0) {
    post.publishedAt = post.publishedAt || new Date();
  }

  post.markModified('results');
  await post.save();
  return post;
}

/** Refresh likes/comments for a published post. */
async function syncPostMetrics(post) {
  const fb = plain(post.results.facebook);
  if (fb?.status === 'published' && fb.postId) {
    const m = await getFacebookMetrics(fb.postId);
    post.results.facebook = { ...fb, ...m };
  }
  const ig = plain(post.results.instagram);
  if (ig?.status === 'published' && ig.postId) {
    const m = await getInstagramMetrics(ig.postId);
    post.results.instagram = { ...ig, ...m };
  }
  post.metricsUpdatedAt = new Date();
  post.markModified('results');
  await post.save();
  return post;
}

/**
 * Next occurrence of the brand's posting hour, in the brand's timezone,
 * returned as a UTC Date. If today's slot has passed (or is <30 min away),
 * it rolls to tomorrow.
 */
function nextPostingTime(brand, now = new Date()) {
  const offsetMs = (brand.timezoneOffsetMinutes ?? 330) * 60 * 1000;
  const localNow = new Date(now.getTime() + offsetMs);

  const slot = new Date(localNow);
  slot.setUTCHours(brand.postingHour ?? 19, 0, 0, 0);
  if (slot.getTime() - localNow.getTime() < 30 * 60 * 1000) {
    slot.setUTCDate(slot.getUTCDate() + 1);
  }
  return new Date(slot.getTime() - offsetMs);
}

module.exports = {
  buildGenerationContext,
  createAiPost,
  publishPost,
  syncPostMetrics,
  nextPostingTime,
};
