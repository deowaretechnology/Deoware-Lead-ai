// Cold outreach email - sent from YOUR OWN mailbox (Zoho / Google Workspace /
// any SMTP), not Resend. Resend's policy forbids cold outreach and scraped
// contacts; your own mailbox, at low daily volume, is the normal way to do it.
//
// Every email carries: who you are + your address, and a one-click
// unsubscribe link (also as List-Unsubscribe headers, which Gmail/Outlook
// show as an "Unsubscribe" button and reward with better inbox placement).
const crypto = require('crypto');
const nodemailer = require('nodemailer');

let transporter = null;
let transporterKey = '';

function config() {
  return {
    host: process.env.COLD_EMAIL_SMTP_HOST,
    port: Number(process.env.COLD_EMAIL_SMTP_PORT || 587),
    secure: String(process.env.COLD_EMAIL_SMTP_SECURE || 'false') === 'true',
    user: process.env.COLD_EMAIL_SMTP_USER,
    pass: process.env.COLD_EMAIL_SMTP_PASS,
    from: process.env.COLD_EMAIL_FROM || process.env.COLD_EMAIL_SMTP_USER,
    address: process.env.COLD_EMAIL_POSTAL_ADDRESS || '',
    publicUrl: (process.env.PUBLIC_API_URL || '').replace(/\/+$/, ''),
  };
}

function isConfigured() {
  const c = config();
  return Boolean(c.host && c.user && c.pass && c.from);
}

function getTransporter() {
  const c = config();
  const key = `${c.host}:${c.port}:${c.secure}:${c.user}`;
  if (!transporter || key !== transporterKey) {
    transporter = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: { user: c.user, pass: c.pass },
      // Local test servers use self-signed certs; real providers don't need this
      tls: process.env.COLD_EMAIL_ALLOW_SELF_SIGNED === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    transporterKey = key;
  }
  return transporter;
}

/** Make sure the lead has an unsubscribe token (saved by the caller). */
function ensureUnsubscribeToken(lead) {
  if (!lead.unsubscribeToken) lead.unsubscribeToken = crypto.randomBytes(16).toString('hex');
  return lead.unsubscribeToken;
}

function unsubscribeUrl(token) {
  const { publicUrl } = config();
  return publicUrl ? `${publicUrl}/api/unsubscribe/${token}` : '';
}

/**
 * Send one cold/follow-up email to a lead.
 * @returns {Promise<string>} SMTP message id
 */
async function sendColdEmail({ lead, subject, message }) {
  if (!isConfigured()) {
    throw new Error(
      'Cold email is not set up - add COLD_EMAIL_SMTP_HOST / _USER / _PASS / COLD_EMAIL_FROM (your own Zoho/Google mailbox) to .env'
    );
  }
  if (!lead.email) throw new Error('Lead has no email address');

  const c = config();
  const token = ensureUnsubscribeToken(lead);
  const unsubUrl = unsubscribeUrl(token);
  const fromName = String(c.from).replace(/<.*>/, '').trim().replace(/^"|"$/g, '');

  const footerLines = [
    '',
    '--',
    fromName,
    c.address,
    unsubUrl
      ? `Not interested? Reply "stop" or unsubscribe here: ${unsubUrl}`
      : 'Not interested? Just reply "stop" and I won\'t email again.',
  ].filter((l) => l !== undefined && l !== null);

  const text = `${message.trim()}\n${footerLines.join('\n')}`;
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html =
    message
      .trim()
      .split(/\n{2,}/)
      .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
      .join('') +
    `<p style="color:#888;font-size:12px;margin-top:24px">--<br>${escape(fromName)}${c.address ? `<br>${escape(c.address)}` : ''}<br>` +
    (unsubUrl
      ? `Not interested? Reply "stop" or <a href="${unsubUrl}">unsubscribe</a>.`
      : 'Not interested? Just reply "stop" and I won\'t email again.') +
    '</p>';

  const listUnsub = [`<mailto:${c.user}?subject=unsubscribe>`];
  if (unsubUrl) listUnsub.unshift(`<${unsubUrl}>`);

  const info = await getTransporter().sendMail({
    from: c.from,
    to: lead.email,
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': listUnsub.join(', '),
      ...(unsubUrl ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {}),
    },
  });
  return info.messageId || '';
}

module.exports = { sendColdEmail, isConfigured, ensureUnsubscribeToken, unsubscribeUrl };
