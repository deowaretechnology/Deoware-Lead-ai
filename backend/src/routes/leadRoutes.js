const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createLead,
  getLeads,
  getPipeline,
  getStats,
  getLead,
  updateLead,
  updateLeadStage,
  addActivity,
  deleteLead,
} = require('../controllers/leadController');

router.use(protect); // every route below requires login

router.route('/').post(createLead).get(getLeads);
router.get('/pipeline', getPipeline);
router.get('/stats', getStats);

router.route('/:id').get(getLead).put(updateLead).delete(deleteLead);

router.patch('/:id/stage', updateLeadStage);
router.post('/:id/activity', addActivity);

module.exports = router;
