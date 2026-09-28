const { Resend } = require('resend');

let client = null;
function getClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set - add it to your .env to send emails');
  }
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

/**
 * Send a plain outreach email.
 * @param {object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.message - plain text; converted to simple HTML paragraphs
 */
async function sendEmail({ to, subject, message }) {
  if (!to) throw new Error('Lead has no email address on file');

  const resend = getClient();
  const html = message
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p>${line}</p>`)
    .join('');

  const fromAddress = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to,
    subject,
    html,
    text: message,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
  }

  return data;
}

module.exports = { sendEmail };
