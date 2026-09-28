// Checks whether an email address is worth sending to, BEFORE sending - bad
// addresses bounce, and bounces wreck your mailbox's reputation.
//
// Free checks (always on): format, disposable domains, and whether the
// domain actually receives mail (DNS MX record).
// Optional paid check: ZeroBounce (EMAIL_VERIFY_PROVIDER=zerobounce) - it can
// tell if the specific mailbox exists, which DNS can't.
//
// We deliberately do NOT "ping" mail servers ourselves (SMTP RCPT probing) -
// it's unreliable and quickly gets your server's IP blacklisted.
const dns = require('dns').promises;
const axios = require('axios');

const SYNTAX = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com',
]);

const ROLE = /^(info|contact|hello|admin|office|sales|support|enquiry|enquiries|booking|bookings|team|care)@/i;

/**
 * @param {string} email
 * @param {{resolveMx?: Function}} [deps] - injectable for tests
 * @returns {Promise<{status:'valid'|'risky'|'invalid', reason:string, role:boolean}>}
 */
async function verifyEmail(email, deps = {}) {
  const resolveMx = deps.resolveMx || dns.resolveMx;
  const e = String(email || '').trim().toLowerCase();
  const role = ROLE.test(e);

  if (!SYNTAX.test(e)) return { status: 'invalid', reason: 'Not a valid email format', role };
  const domain = e.split('@')[1];
  if (DISPOSABLE.has(domain)) return { status: 'invalid', reason: 'Disposable/temporary email', role };

  // Optional mailbox-level check
  if ((process.env.EMAIL_VERIFY_PROVIDER || '').toLowerCase() === 'zerobounce' && process.env.ZEROBOUNCE_API_KEY) {
    try {
      const base = process.env.ZEROBOUNCE_API_BASE || 'https://api.zerobounce.net';
      const res = await axios.get(`${base}/v2/validate`, {
        params: { api_key: process.env.ZEROBOUNCE_API_KEY, email: e },
        timeout: 15000,
      });
      const s = String(res.data?.status || '').toLowerCase();
      if (s === 'valid') return { status: 'valid', reason: 'Mailbox verified (ZeroBounce)', role };
      if (['invalid', 'spamtrap', 'abuse', 'do_not_mail'].includes(s)) {
        return { status: 'invalid', reason: `ZeroBounce: ${s}${res.data?.sub_status ? ` (${res.data.sub_status})` : ''}`, role };
      }
      return { status: 'risky', reason: `ZeroBounce: ${s || 'unknown'}`, role };
    } catch (err) {
      // Provider down / out of credits -> fall back to the free DNS check
      console.error(`[email-verify] ZeroBounce failed, falling back to DNS: ${err.message}`);
    }
  }

  try {
    const mx = await resolveMx(domain);
    if (Array.isArray(mx) && mx.some((r) => r.exchange && r.exchange !== '.')) {
      return { status: 'valid', reason: role ? 'Domain accepts email (shared inbox address)' : 'Domain accepts email', role };
    }
    return { status: 'invalid', reason: 'Domain does not accept email (no MX)', role };
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'NXDOMAIN') {
      return { status: 'invalid', reason: 'Domain does not accept email', role };
    }
    return { status: 'risky', reason: `Could not check domain (${err.code || err.message})`, role };
  }
}

module.exports = { verifyEmail };
