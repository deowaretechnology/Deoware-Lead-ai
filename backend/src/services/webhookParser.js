const crypto = require('crypto');

/**
 * Check Meta's X-Hub-Signature-256 header against the raw request body.
 * Anyone can POST to a public webhook URL; this proves the call really came
 * from Meta (it's signed with your App Secret).
 */
function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!rawBody || !signatureHeader || !appSecret) return false;
  const [algo, received] = String(signatureHeader).split('=');
  if (algo !== 'sha256' || !received) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(received, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function toDate(ts, unit = 'ms') {
  const n = Number(ts);
  if (!n) return new Date();
  return new Date(unit === 's' ? n * 1000 : n);
}

// Best-effort text for non-text WhatsApp messages (buttons, images, ...)
function whatsappText(msg) {
  if (msg.type === 'text') return msg.text?.body || '';
  if (msg.type === 'button') return msg.button?.text || '[button]';
  if (msg.type === 'interactive') {
    return msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[interactive]';
  }
  return `[${msg.type || 'message'}]`;
}

function parseMessaging(entry, platform, events) {
  for (const m of entry.messaging || []) {
    const msg = m.message;
    if (!msg || msg.is_echo) continue; // echoes = messages WE sent
    if (!m.sender?.id || m.sender.id === entry.id) continue; // from our own page/account
    const text = msg.text || (msg.attachments?.length ? `[${msg.attachments[0].type || 'attachment'}]` : '');
    if (!text) continue;
    events.push({
      platform,
      channelType: 'dm',
      externalUserId: m.sender.id,
      name: '',
      username: '',
      text,
      externalMessageId: msg.mid || '',
      commentId: '',
      postId: '',
      timestamp: toDate(m.timestamp),
    });
  }
}

/**
 * Turn any Meta webhook payload (Facebook Page, Instagram, WhatsApp) into a
 * flat list of normalized inbound events. Anything we don't care about
 * (read receipts, delivery statuses, our own echoes, edits, likes) is dropped.
 */
function parseMetaWebhook(body) {
  const events = [];
  if (!body || !Array.isArray(body.entry)) return events;

  for (const entry of body.entry) {
    if (body.object === 'page') {
      parseMessaging(entry, 'facebook', events);
      for (const change of entry.changes || []) {
        const v = change.value || {};
        if (change.field !== 'feed' || v.item !== 'comment' || v.verb !== 'add') continue;
        if (!v.from?.id || v.from.id === entry.id) continue; // our own page's comments
        if (!v.message) continue;
        events.push({
          platform: 'facebook',
          channelType: 'comment',
          externalUserId: v.from.id,
          name: v.from.name || '',
          username: '',
          text: v.message,
          externalMessageId: v.comment_id || '',
          commentId: v.comment_id || '',
          postId: v.post_id || '',
          timestamp: toDate(v.created_time, 's'),
        });
      }
    } else if (body.object === 'instagram') {
      parseMessaging(entry, 'instagram', events);
      for (const change of entry.changes || []) {
        const v = change.value || {};
        if (change.field !== 'comments') continue;
        if (!v.from?.id || v.from.id === entry.id) continue; // our own replies
        if (!v.text) continue;
        events.push({
          platform: 'instagram',
          channelType: 'comment',
          externalUserId: v.from.id,
          name: '',
          username: v.from.username || '',
          text: v.text,
          externalMessageId: v.id || '',
          commentId: v.id || '',
          postId: v.media?.id || '',
          timestamp: new Date(),
        });
      }
    } else if (body.object === 'whatsapp_business_account') {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        for (const msg of v.messages || []) {
          const contact = (v.contacts || []).find((c) => c.wa_id === msg.from);
          events.push({
            platform: 'whatsapp',
            channelType: 'dm',
            externalUserId: msg.from,
            name: contact?.profile?.name || '',
            username: '',
            text: whatsappText(msg),
            externalMessageId: msg.id || '',
            commentId: '',
            postId: '',
            timestamp: toDate(msg.timestamp, 's'),
          });
        }
      }
    }
  }

  return events;
}

module.exports = { verifyMetaSignature, parseMetaWebhook };
