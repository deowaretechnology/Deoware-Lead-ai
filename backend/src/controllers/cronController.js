const crypto = require('crypto');
const CronRun = require('../models/CronRun');
const { runJob, isRunning, JobBusyError } = require('../jobs/jobRunner');
const { runFollowUpSweep } = require('../jobs/followUpScheduler');
const { runPublishSweep, runDailyGeneration, runMetricsSync } = require('../jobs/contentScheduler');
const { runProspecting } = require('../services/autoFinderService');
const { runDailyOutreach } = require('../services/dailyOutreachService');

// Every job an external cron service (cron-job.org etc.) can trigger.
// "daily" is a convenience bundle for one call per day.
const JOBS = {
  prospecting: () => runProspecting(),
  outreach: () => runDailyOutreach(),
  followups: () => runFollowUpSweep(),
  publish: () => runPublishSweep(),
  'daily-content': () => runDailyGeneration(),
  metrics: () => runMetricsSync(),
  daily: async () => {
    const out = {};
    // Order matters: find new leads -> message them -> follow up older ones
    for (const [name, fn] of [
      ['prospecting', runProspecting],
      ['outreach', runDailyOutreach],
      ['followups', runFollowUpSweep],
      ['daily-content', runDailyGeneration],
      ['metrics', runMetricsSync],
    ]) {
      try {
        out[name] = await fn();
      } catch (err) {
        out[name] = { error: err.message };
      }
    }
    return out;
  },
};

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Secret can come as header (x-cron-secret / Bearer) or ?key= (for services
// that can't set headers, like UptimeRobot's free plan).
function checkSecret(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ success: false, message: 'Cron URLs are disabled - set CRON_SECRET in .env' });
    return false;
  }
  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const given = req.get('x-cron-secret') || bearer || req.query.key || '';
  if (!given || !safeEqual(given, secret)) {
    res.status(401).json({ success: false, message: 'Invalid cron key' });
    return false;
  }
  return true;
}

// @desc    Run a background job now
// @route   GET|POST /api/cron/:job?key=SECRET[&wait=1]
// @access  CRON_SECRET
// By default replies 202 straight away and runs the job in the background -
// cron services time out after ~30s, while AI-heavy jobs can take longer.
// Add ?wait=1 to wait for the result (handy for testing in a browser).
async function trigger(req, res) {
  if (!checkSecret(req, res)) return;

  const job = req.params.job;
  const fn = JOBS[job];
  if (!fn) {
    return res.status(404).json({ success: false, message: `Unknown job. Use one of: ${Object.keys(JOBS).join(', ')}` });
  }
  if (isRunning(job)) {
    return res.status(409).json({ success: false, message: `"${job}" is already running` });
  }

  const wait = req.query.wait === '1' || req.query.wait === 'true';
  const promise = runJob(job, fn, { source: 'external' });

  if (!wait) {
    promise.catch(() => {}); // outcome is recorded in CronRun
    return res.status(202).json({ success: true, message: `"${job}" started` });
  }

  try {
    const { run, result } = await promise;
    return res.json({ success: true, job, durationMs: run?.durationMs, result });
  } catch (err) {
    const status = err instanceof JobBusyError ? 409 : 500;
    return res.status(status).json({ success: false, job, message: err.message });
  }
}

// @desc    Last runs of every job (did today's jobs actually happen?)
// @route   GET /api/cron/status?key=SECRET
async function status(req, res) {
  if (!checkSecret(req, res)) return;
  const jobs = Object.keys(JOBS);
  const latest = await Promise.all(
    jobs.map((job) => CronRun.findOne({ job }).sort({ startedAt: -1 }).lean())
  );
  const recent = await CronRun.find({}).sort({ startedAt: -1 }).limit(20).lean();
  res.json({
    success: true,
    data: {
      serverTime: new Date().toISOString(),
      jobs: Object.fromEntries(jobs.map((job, i) => [job, { running: isRunning(job), last: latest[i] || null }])),
      recent,
    },
  });
}

module.exports = { trigger, status, JOBS };
