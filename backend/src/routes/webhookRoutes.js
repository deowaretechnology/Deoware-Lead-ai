const express = require('express');
const router = express.Router();
const { verifyWebhook, receiveWebhook } = require('../controllers/webhookController');

// Public: Meta calls these directly. POSTs are signature-checked in the controller.
router.get('/meta', verifyWebhook);
router.post('/meta', receiveWebhook);

module.exports = router;
