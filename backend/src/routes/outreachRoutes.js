const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { draftMessage, sendMessage, today, runDailyNow } = require('../controllers/outreachController');

router.use(protect);

router.get('/today', today);
router.post('/run-daily', runDailyNow);
router.post('/:id/draft', draftMessage);
router.post('/:id/send', sendMessage);

module.exports = router;
