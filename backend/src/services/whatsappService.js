const axios = require('axios');

const GRAPH_VERSION = 'v20.0';

function getConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error(
      'WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set - add them to your .env to send WhatsApp messages'
    );
  }
  return { token, phoneNumberId };
}

function normalizePhone(phone) {
  // WhatsApp Cloud API wants digits only, with country code, no + or spaces.
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`; // assume India if no country code given
  return digits;
}

/**
 * Send a free-form text message.
 * NOTE: Meta only allows free-form text within a 24-hour window after the
 * lead has messaged you first (the "customer service window"). Outside that
 * window - which includes almost every cold first-touch message - Meta will
 * reject this and you must use an approved message template instead
 * (see sendWhatsAppTemplate below).
 */
async function sendWhatsAppText({ to, message }) {
  const { token, phoneNumberId } = getConfig();

  const res = await axios.post(
    `${process.env.META_GRAPH_BASE || 'https://graph.facebook.com'}/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'text',
      text: { body: message },
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data;
}

/**
 * Send a pre-approved WhatsApp message template. Required for cold
 * first-touch outreach (outside the 24h session window).
 * @param {object} params
 * @param {string} params.to
 * @param {string} params.templateName - must match a template approved in Meta Business Manager
 * @param {string} [params.languageCode] - defaults to en_US
 * @param {string[]} [params.bodyParams] - values to fill the template's {{1}}, {{2}}, ... placeholders
 */
async function sendWhatsAppTemplate({ to, templateName, languageCode = 'en_US', bodyParams = [] }) {
  const { token, phoneNumberId } = getConfig();

  const components =
    bodyParams.length > 0
      ? [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }]
      : undefined;

  const res = await axios.post(
    `${process.env.META_GRAPH_BASE || 'https://graph.facebook.com'}/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data;
}

module.exports = { sendWhatsAppText, sendWhatsAppTemplate, normalizePhone };
