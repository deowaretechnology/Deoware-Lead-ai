const express = require('express');
const rateLimit = require('express-rate-limit');
const { trigger, status } = require('../controllers/cronController');

const router = express.Router();

// Protected by CRON_SECRET (checked in the controller), plus a rate limit so
// a leaked URL can't be hammered.
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { success: false, message: 'Too many cron calls' },
  })
);

// Errors inside are handled by the controller; wrap to forward anything unexpected
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/status', wrap(status));
router.all('/:job', wrap(trigger));

module.exports = router;
