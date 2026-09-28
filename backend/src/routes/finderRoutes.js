const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
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
} = require('../controllers/finderController');

router.use(protect);

router.post('/search', search);
router.get('/usage', usage);
router.get('/prospects', listProspects);
router.post('/import', importToPipeline);
router.post('/enrich', enrich);
router.post('/import-csv', importCsv);
router.post('/prospects/:id/dismiss', dismiss);
router.post('/prospects/:id/restore', restore);

// Auto-Finder
router.get('/auto', autoStatus);
router.post('/auto/searches', createSaved);
router.route('/auto/searches/:id').put(updateSaved).delete(deleteSaved);
router.post('/auto/run', runAutoNow);

module.exports = router;
