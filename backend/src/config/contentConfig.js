module.exports = {
  // Posts are public brand content, so they get the stronger (still cheap)
  // Sonnet model rather than Haiku. One post a day costs a fraction of a rupee.
  AI_MODEL: process.env.CLAUDE_CONTENT_MODEL || 'claude-sonnet-5',

  // How many of your best-performing past posts to show the AI as "this is
  // what works for us" when writing the next one.
  TOP_POSTS_FOR_CONTEXT: 5,

  // How many recent topics to show the AI so it doesn't repeat itself.
  RECENT_TOPICS_TO_AVOID: 15,

  // How often the publisher checks for scheduled posts that are due.
  PUBLISH_CRON: process.env.CONTENT_PUBLISH_CRON || '*/10 * * * *', // every 10 min

  // Daily job: auto-generate posts for users with autoGenerate on, and sync metrics.
  DAILY_CRON: process.env.CONTENT_DAILY_CRON || '30 8 * * *', // 08:30 server time

  // Meta Graph API version
  GRAPH_VERSION: 'v20.0',
};
