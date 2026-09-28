// One place that runs every background job, whether it was started by the
// built-in timer (node-cron, for always-on servers) or by an external cron
// service calling /api/cron/:job (for free hosting that sleeps).
//
// - The same job never runs twice at once (e.g. cron-job.org and the internal
//   timer firing together won't double-send follow-ups).
// - Every run is recorded in CronRun so you can see it happened.
const CronRun = require('../models/CronRun');

const running = new Set();

class JobBusyError extends Error {
  constructor(job) {
    super(`Job "${job}" is already running`);
    this.statusCode = 409;
  }
}

function isRunning(job) {
  return running.has(job);
}

/**
 * @param {string} job - job name
 * @param {() => Promise<any>} fn - the work
 * @param {{source?: 'internal'|'external'}} [opts]
 * @returns {Promise<{run: object, result: any}>}
 */
async function runJob(job, fn, { source = 'internal' } = {}) {
  if (running.has(job)) throw new JobBusyError(job);
  running.add(job);

  const started = Date.now();
  let run = null;
  try {
    run = await CronRun.create({ job, source, status: 'running', startedAt: new Date(started) });
  } catch (err) {
    // History is nice-to-have; never let it block the actual job
    console.error(`[jobs] could not record run for ${job}: ${err.message}`);
  }

  try {
    const result = await fn();
    if (run) {
      run.status = 'ok';
      run.result = result ?? null;
      run.finishedAt = new Date();
      run.durationMs = Date.now() - started;
      await run.save().catch(() => {});
    }
    console.log(`[jobs] ${job} (${source}) ok in ${Date.now() - started}ms:`, result);
    return { run, result };
  } catch (err) {
    if (run) {
      run.status = 'failed';
      run.error = err.message;
      run.finishedAt = new Date();
      run.durationMs = Date.now() - started;
      await run.save().catch(() => {});
    }
    console.error(`[jobs] ${job} (${source}) failed: ${err.message}`);
    throw err;
  } finally {
    running.delete(job);
  }
}

module.exports = { runJob, isRunning, JobBusyError };
