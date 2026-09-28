const { sendEmail } = require('./emailService');

/**
 * Tell the CRM owner something needs their attention (a hot new lead, a demo
 * request). Uses email via Resend when configured; otherwise just logs, so
 * nothing breaks before email is set up.
 * @returns {Promise<boolean>} whether an email actually went out
 */
async function notifyOwner({ owner, subject, message }) {
  const to = process.env.NOTIFY_EMAIL || owner?.email;
  if (!process.env.RESEND_API_KEY || !to) {
    console.log(`[notify] ${subject} - ${message.replace(/\n/g, ' ')}`);
    return false;
  }
  try {
    await sendEmail({ to, subject, message });
    return true;
  } catch (err) {
    console.error(`[notify] email failed: ${err.message}`);
    return false;
  }
}

module.exports = { notifyOwner };
