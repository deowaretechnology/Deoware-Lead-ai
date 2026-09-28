const asyncHandler = require('express-async-handler');
const Prospect = require('../models/Prospect');
const SavedSearch = require('../models/SavedSearch');
const { searchProspects, importProspects, enrichProspects, importCsvRows, getUsage, FinderError } = require('../services/finderService');
const { runProspecting, settings: autoSettings, importedToday } = require('../services/autoFinderService');
const { runJob, JobBusyError } = require('../jobs/jobRunner');

function rethrow(res, err) {
  if (err instanceof FinderError) res.status(err.statusCode);
  throw err;
}

// @desc    Search Google for businesses and save them as prospects
// @route   POST /api/finder/search   { query, pages? }
const search = asyncHandler(async (req, res) => {
  try {
    const out = await searchProspects({ ownerId: req.user._id, query: req.body.query, pages: req.body.pages });
    res.json({ success: true, data: out.results, added: out.added, calls: out.calls, usage: out.usage });
  } catch (err) {
    rethrow(res, err);
  }
});

// @desc    Saved prospects with filters
// @route   GET /api/finder/prospects?status=new&noWebsite=true&minScore=50&search=salon
const listProspects = asyncHandler(async (req, res) => {
  const { status = 'new', noWebsite, minScore, search } = req.query;
  const query = { owner: req.user._id };
  if (status !== 'all') query.status = status;
  if (noWebsite === 'true') query.website = '';
  if (minScore) query.score = { $gte: Number(minScore) || 0 };
  if (search) {
    const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { category: { $regex: safe, $options: 'i' } },
      { address: { $regex: safe, $options: 'i' } },
      { searchQuery: { $regex: safe, $options: 'i' } },
    ];
  }
  const prospects = await Prospect.find(query).sort({ score: -1, createdAt: -1 }).limit(300);
  res.json({ success: true, count: prospects.length, data: prospects });
});

// @desc    This month's Google usage vs the free-tier guard
// @route   GET /api/finder/usage
const usage = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getUsage(req.user._id) });
});

// @desc    Import prospects into the pipeline as leads
// @route   POST /api/finder/import   { ids: [...] }
const importToPipeline = asyncHandler(async (req, res) => {
  try {
    const summary = await importProspects({ ownerId: req.user._id, ids: req.body.ids });
    res.json({ success: true, data: summary });
  } catch (err) {
    rethrow(res, err);
  }
});

// @desc    Scrape the businesses' own websites for emails / socials / phones
// @route   POST /api/finder/enrich   { ids: [...] } (max 25)
const enrich = asyncHandler(async (req, res) => {
  try {
    const summary = await enrichProspects({ ownerId: req.user._id, ids: req.body.ids });
    res.json({ success: true, data: summary });
  } catch (err) {
    rethrow(res, err);
  }
});

// @desc    Import businesses from a CSV (rows parsed in the browser)
// @route   POST /api/finder/import-csv   { rows: [...], fileName }
const importCsv = asyncHandler(async (req, res) => {
  try {
    const summary = await importCsvRows({ ownerId: req.user._id, rows: req.body.rows, fileName: req.body.fileName });
    res.json({ success: true, data: summary });
  } catch (err) {
    rethrow(res, err);
  }
});

// ---------- Auto-Finder (saved searches) ----------

const SAVED_FIELDS = ['businessType', 'areas', 'country', 'active'];

function cleanSaved(body) {
  const out = {};
  SAVED_FIELDS.forEach((f) => {
    if (body[f] !== undefined) out[f] = body[f];
  });
  if (typeof out.areas === 'string') out.areas = out.areas.split(',');
  if (Array.isArray(out.areas)) out.areas = [...new Set(out.areas.map((a) => String(a).trim()).filter(Boolean))].slice(0, 50);
  if (out.country !== undefined) out.country = String(out.country).trim().toUpperCase().slice(0, 2);
  return out;
}

// @route   GET /api/finder/auto
const autoStatus = asyncHandler(async (req, res) => {
  const searches = await SavedSearch.find({ owner: req.user._id }).sort({ createdAt: 1 });
  res.json({
    success: true,
    data: { settings: autoSettings(), importedToday: await importedToday(req.user._id), searches, usage: await getUsage(req.user._id) },
  });
});

// @route   POST /api/finder/auto/searches
const createSaved = asyncHandler(async (req, res) => {
  const saved = await SavedSearch.create({ owner: req.user._id, ...cleanSaved(req.body) });
  res.status(201).json({ success: true, data: saved });
});

// @route   PUT /api/finder/auto/searches/:id
const updateSaved = asyncHandler(async (req, res) => {
  const saved = await SavedSearch.findOne({ _id: req.params.id, owner: req.user._id });
  if (!saved) {
    res.status(404);
    throw new Error('Saved search not found');
  }
  Object.assign(saved, cleanSaved(req.body));
  if (saved.nextAreaIndex >= saved.areas.length) saved.nextAreaIndex = 0;
  await saved.save();
  res.json({ success: true, data: saved });
});

// @route   DELETE /api/finder/auto/searches/:id
const deleteSaved = asyncHandler(async (req, res) => {
  const saved = await SavedSearch.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!saved) {
    res.status(404);
    throw new Error('Saved search not found');
  }
  res.json({ success: true, data: {} });
});

// @desc    Run today's Auto-Finder now (same as the daily job, for this account)
// @route   POST /api/finder/auto/run
const runAutoNow = asyncHandler(async (req, res) => {
  try {
    const { result } = await runJob('prospecting', () => runProspecting({ ownerId: req.user._id }), { source: 'external' });
    res.json({ success: true, data: result[String(req.user._id)] || {} });
  } catch (err) {
    if (err instanceof JobBusyError) res.status(409);
    throw err;
  }
});

async function setStatus(req, res, status) {
  const prospect = await Prospect.findOne({ _id: req.params.id, owner: req.user._id });
  if (!prospect) {
    res.status(404);
    throw new Error('Prospect not found');
  }
  if (prospect.status === 'imported') {
    res.status(400);
    throw new Error('Already imported - manage it from the pipeline');
  }
  prospect.status = status;
  await prospect.save();
  res.json({ success: true, data: prospect });
}

// @route   POST /api/finder/prospects/:id/dismiss
const dismiss = asyncHandler(async (req, res) => setStatus(req, res, 'dismissed'));

// @route   POST /api/finder/prospects/:id/restore
const restore = asyncHandler(async (req, res) => setStatus(req, res, 'new'));

module.exports = { search, listProspects, usage, importToPipeline, enrich, dismiss, restore };

module.exports = {
  search,
  listProspects,
  usage,
  importToPipeline,
  enrich,
  importCsv,
  dismiss,
  restore,
  autoStatus,
  createSaved,
  updateSaved,
  deleteSaved,
  runAutoNow,
};
