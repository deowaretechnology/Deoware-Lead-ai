// Auto-Finder: every day, for each user with active saved searches, find new
// businesses (rotating through areas), scan the good ones' websites for
// contacts, and import the best into the pipeline - up to the daily target.
const SavedSearch = require('../models/SavedSearch');
const Prospect = require('../models/Prospect');
const { searchProspects, enrichProspects, importProspects, getUsage } = require('./finderService');
const { isSocialOrDirectory } = require('./websiteScraper');
const { startOfToday } = require('../utils/time');

function settings() {
  const num = (k, d) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && v >= 0 ? v : d;
  };
  return {
    dailyTarget: num('AUTO_FINDER_DAILY_TARGET', 50), // new leads added to the pipeline per day
    minScore: num('AUTO_FINDER_MIN_SCORE', 60), // only import prospects at least this good
    maxCallsPerRun: num('AUTO_FINDER_MAX_CALLS_PER_RUN', 10), // Google calls per daily run
    enrich: process.env.AUTO_FINDER_ENRICH !== 'false', // scan websites for email/Instagram before import
  };
}

async function importedToday(ownerId) {
  return Prospect.countDocuments({
    owner: ownerId,
    source: 'auto',
    status: 'imported',
    updatedAt: { $gte: startOfToday() },
  });
}

/**
 * One user's daily run.
 * @returns {Promise<object>} summary
 */
async function runForOwner(ownerId) {
  const cfg = settings();
  const summary = { searches: 0, calls: 0, found: 0, enriched: 0, imported: 0, linked: 0, stoppedBecause: '' };

  const already = await importedToday(ownerId);
  let remaining = Math.max(0, cfg.dailyTarget - already);
  if (remaining === 0) {
    summary.stoppedBecause = 'daily target already reached';
    return summary;
  }

  const searches = await SavedSearch.find({ owner: ownerId, active: true }).sort({ lastRunAt: 1, createdAt: 1 });
  if (!searches.length) {
    summary.stoppedBecause = 'no active saved searches';
    return summary;
  }

  // 1. Search: rotate areas until we have enough good new candidates
  const goodPool = async () =>
    Prospect.countDocuments({ owner: ownerId, source: 'auto', status: 'new', score: { $gte: cfg.minScore } });

  const maxCalls = Math.min(cfg.maxCallsPerRun, searches.reduce((n, s) => n + s.areas.length, 0));
  let i = 0;
  while (summary.calls < maxCalls && (await goodPool()) < remaining) {
    const usage = await getUsage(ownerId);
    if (usage.remaining < 1) {
      summary.stoppedBecause = 'monthly Google limit reached';
      break;
    }
    const s = searches[i % searches.length];
    const area = s.areas[s.nextAreaIndex % s.areas.length];
    try {
      const out = await searchProspects({
        ownerId,
        query: `${s.businessType} in ${area}`,
        pages: 1,
        regionCode: s.country,
        source: 'auto',
      });
      summary.calls += out.calls;
      summary.found += out.added;
      s.totalFound += out.added;
    } catch (err) {
      summary.stoppedBecause = err.message;
      if (err.statusCode === 429) break;
    }
    s.nextAreaIndex = (s.nextAreaIndex + 1) % s.areas.length;
    s.lastRunAt = new Date();
    await s.save();
    summary.searches += 1;
    i += 1;
  }

  // 2. Pick today's best candidates
  const candidates = await Prospect.find({ owner: ownerId, source: 'auto', status: 'new', score: { $gte: cfg.minScore } })
    .sort({ score: -1, createdAt: 1 })
    .limit(remaining);
  if (!candidates.length) {
    summary.stoppedBecause = summary.stoppedBecause || 'no new prospects above the minimum score';
    return summary;
  }

  // 3. Scan their websites for email / Instagram (only real websites, not scanned yet)
  if (cfg.enrich) {
    const toScan = candidates.filter((p) => p.website && !isSocialOrDirectory(p.website) && !p.enrichedAt).map((p) => p._id);
    for (let k = 0; k < toScan.length; k += 25) {
      const out = await enrichProspects({ ownerId, ids: toScan.slice(k, k + 25) });
      summary.enriched += out.scanned;
    }
  }

  // 4. Import into the pipeline
  const imported = await importProspects({ ownerId, ids: candidates.map((p) => p._id) });
  summary.imported = imported.imported;
  summary.linked = imported.linked;
  remaining -= imported.imported + imported.linked;
  if (!summary.stoppedBecause) summary.stoppedBecause = remaining <= 0 ? 'daily target reached' : 'ran out of good prospects for today';
  return summary;
}

/** Daily job: every owner with active saved searches. */
async function runProspecting({ ownerId } = {}) {
  const owners = ownerId ? [ownerId] : await SavedSearch.distinct('owner', { active: true });
  const results = {};
  for (const id of owners) {
    try {
      results[String(id)] = await runForOwner(id);
    } catch (err) {
      results[String(id)] = { error: err.message };
    }
  }
  return results;
}

module.exports = { runProspecting, runForOwner, settings, importedToday };
