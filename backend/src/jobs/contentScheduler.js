const cron = require('node-cron');
const { runJob } = require('./jobRunner');
const Post = require('../models/Post');
const BrandProfile = require('../models/BrandProfile');
const {
  createAiPost,
  publishPost,
  syncPostMetrics,
  nextPostingTime,
} = require('../services/contentEngine');
const { PUBLISH_CRON, DAILY_CRON } = require('../config/contentConfig');

/**
 * Publish every scheduled post that's due. Each post is "claimed" with an
 * atomic status flip (scheduled -> publishing) first, so two overlapping
 * runs can never publish the same post twice.
 */
async function runPublishSweep(now = new Date()) {
  const results = { published: 0, partial: 0, failed: 0 };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const post = await Post.findOneAndUpdate(
      { status: 'scheduled', scheduledAt: { $lte: now } },
      { $set: { status: 'publishing' } },
      { new: true, sort: { scheduledAt: 1 } }
    );
    if (!post) break;

    try {
      const done = await publishPost(post);
      if (done.status === 'published') results.published += 1;
      else if (done.status === 'partially_published') results.partial += 1;
      else results.failed += 1;
    } catch (err) {
      results.failed += 1;
      console.error(`[content] publish failed for post ${post._id}: ${err.message}`);
      post.status = 'failed';
      await post.save().catch(() => {});
    }
  }

  return results;
}

function startOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * For every brand with autoGenerate on: create today's AI post (once per
 * day). With autoPublish on, schedule it for the brand's posting hour -
 * unless it targets Instagram with no image yet (AI writes the image prompt,
 * but someone still has to make the image), in which case it stays a draft.
 */
async function runDailyGeneration(now = new Date()) {
  const results = { generated: 0, scheduled: 0, needsImage: 0, skipped: 0, failed: 0 };
  const brands = await BrandProfile.find({ autoGenerate: true });

  for (const brand of brands) {
    try {
      const alreadyToday = await Post.exists({
        owner: brand.owner,
        generatedBy: 'ai',
        createdAt: { $gte: startOfToday(now) },
      });
      if (alreadyToday) {
        results.skipped += 1;
        continue;
      }

      const post = await createAiPost({ ownerId: brand.owner, brand });
      results.generated += 1;

      if (brand.autoPublish) {
        if (post.platforms.includes('instagram') && !post.imageUrl) {
          results.needsImage += 1; // stays a draft until an image is added
        } else {
          post.status = 'scheduled';
          post.scheduledAt = nextPostingTime(brand, now);
          await post.save();
          results.scheduled += 1;
        }
      }
    } catch (err) {
      results.failed += 1;
      console.error(`[content] daily generation failed for owner ${brand.owner}: ${err.message}`);
    }
  }

  return results;
}

/** Refresh likes/comments on everything published in the last 14 days. */
async function runMetricsSync(now = new Date()) {
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const posts = await Post.find({
    status: { $in: ['published', 'partially_published'] },
    publishedAt: { $gte: since },
  });

  const results = { synced: 0, failed: 0 };
  for (const post of posts) {
    try {
      await syncPostMetrics(post);
      results.synced += 1;
    } catch (err) {
      results.failed += 1;
      console.error(`[content] metrics sync failed for post ${post._id}: ${err.message}`);
    }
  }
  return results;
}

function startContentScheduler() {
  // Errors are logged + recorded by runJob; a busy job is simply skipped.
  cron.schedule(PUBLISH_CRON, () => runJob('publish', () => runPublishSweep(), { source: 'internal' }).catch(() => {}));

  cron.schedule(DAILY_CRON, async () => {
    await runJob('daily-content', () => runDailyGeneration(), { source: 'internal' }).catch(() => {});
    await runJob('metrics', () => runMetricsSync(), { source: 'internal' }).catch(() => {});
  });

  console.log(`[content] scheduler on - publish "${PUBLISH_CRON}", daily "${DAILY_CRON}"`);
}

module.exports = { startContentScheduler, runPublishSweep, runDailyGeneration, runMetricsSync };
