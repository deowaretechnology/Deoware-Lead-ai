const express = require('express');
const rateLimit = require('express-rate-limit');
const { unsubscribe } = require('../controllers/unsubscribeController');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: 30 }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// POST bodies from mail clients are form-encoded (List-Unsubscribe=One-Click) - already parsed by app
router.get('/:token', wrap(unsubscribe));
router.post('/:token', wrap(unsubscribe));

module.exports = router;
