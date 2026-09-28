const { verifyMetaSignature, parseMetaWebhook } = require('../services/webhookParser');
const { handleInboundEvent } = require('../services/inboxService');

// @desc    Meta's one-time webhook verification handshake
// @route   GET /api/webhooks/meta
// @access  Public (Meta calls this when you save the webhook URL)
const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

/**
 * Process every event in a webhook payload, one at a time. Errors on one
 * event are logged and don't stop the rest. Exported for tests.
 */
async function processWebhookBody(body) {
  const events = parseMetaWebhook(body);
  const summary = { events: events.length, processed: 0, duplicates: 0, leadsCreated: 0, failed: 0 };
  for (const event of events) {
    try {
      const result = await handleInboundEvent(event);
      if (result.duplicate) summary.duplicates += 1;
      else summary.processed += 1;
      if (result.leadCreated) summary.leadsCreated += 1;
    } catch (err) {
      summary.failed += 1;
      console.error(`[inbox] failed to process ${event.platform} ${event.channelType} from ${event.externalUserId}: ${err.message}`);
    }
  }
  return summary;
}

// @desc    Incoming DMs/comments from Facebook, Instagram and WhatsApp
// @route   POST /api/webhooks/meta
// @access  Public, but signature-checked
const receiveWebhook = (req, res) => {
  const secret = process.env.META_APP_SECRET;

  if (secret) {
    const ok = verifyMetaSignature(req.rawBody, req.get('x-hub-signature-256'), secret);
    if (!ok) {
      console.warn('[inbox] rejected webhook with bad signature');
      return res.sendStatus(401);
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[inbox] META_APP_SECRET is not set - refusing unsigned webhooks in production');
    return res.sendStatus(401);
  }

  // Meta wants a fast 200, otherwise it retries. Do the real work after.
  res.status(200).send('EVENT_RECEIVED');

  processWebhookBody(req.body)
    .then((s) => {
      if (s.events) console.log('[inbox] webhook:', s);
    })
    .catch((err) => console.error('[inbox] webhook processing crashed:', err.message));
  return undefined;
};

module.exports = { verifyWebhook, receiveWebhook, processWebhookBody };
