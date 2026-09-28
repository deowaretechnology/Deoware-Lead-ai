const Lead = require('../models/Lead');

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;max-width:420px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#475569;font-size:15px;line-height:1.5;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

// @desc    One-click unsubscribe from cold emails (link in every email + List-Unsubscribe header)
// @route   GET|POST /api/unsubscribe/:token
// @access  Public (the random token is the credential)
async function unsubscribe(req, res) {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return res.status(404).type('html').send(page('Link not valid', 'This unsubscribe link is not valid.'));
  }

  const lead = await Lead.findOne({ unsubscribeToken: token });
  if (!lead) {
    return res.status(404).type('html').send(page('Link not valid', 'This unsubscribe link is not valid or has expired.'));
  }

  if (!lead.doNotContact) {
    lead.doNotContact = true;
    lead.autoFollowUp = false;
    lead.nextFollowUpAt = null;
    lead.activity.push({
      type: 'system',
      channel: 'system',
      direction: 'internal',
      message: 'Unsubscribed via the email link - no more automatic messages will be sent.',
      sentBy: 'system',
    });
    await lead.save();
  }

  // Mail clients' one-click unsubscribe (RFC 8058) POSTs and only needs a 200
  if (req.method === 'POST') return res.status(200).send('Unsubscribed');
  return res
    .status(200)
    .type('html')
    .send(page("You're unsubscribed", "You won't receive any more emails from us. Sorry for the bother!"));
}

module.exports = { unsubscribe };
