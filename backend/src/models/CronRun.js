const mongoose = require('mongoose');

// History of background job runs, so you can check that the daily jobs
// actually ran (GET /api/cron/status).
const cronRunSchema = new mongoose.Schema(
  {
    job: { type: String, required: true, index: true },
    source: { type: String, enum: ['external', 'internal'], default: 'internal' },
    status: { type: String, enum: ['running', 'ok', 'failed'], default: 'running' },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: '' },
  },
  { timestamps: false }
);

// Keep history small: auto-delete runs older than 30 days
cronRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('CronRun', cronRunSchema);
