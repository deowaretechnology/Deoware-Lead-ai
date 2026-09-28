const axios = require('axios');
const { GRAPH_VERSION } = require('../config/contentConfig');

// Base URL overridable for proxies / local testing
const graph = () => `${process.env.META_GRAPH_BASE || 'https://graph.facebook.com'}/${GRAPH_VERSION}`;

function pageConfig() {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) {
    throw new Error('META_PAGE_ID / META_PAGE_ACCESS_TOKEN not set - needed to reply on Facebook/Instagram');
  }
  return { pageId, token };
}

function metaError(err) {
  const msg = err.response?.data?.error?.message || err.message;
  return new Error(`Meta API: ${msg}`);
}

/**
 * Send a DM on Messenger or Instagram. Both go through the Page's
 * /messages endpoint (Instagram DMs are handled by the linked Page).
 * Meta only allows this within 24h of the person's last message.
 */
async function sendDirectMessage({ recipientId, text }) {
  const { pageId, token } = pageConfig();
  try {
    const res = await axios.post(
      `${graph()}/${pageId}/messages`,
      { recipient: { id: recipientId }, message: { text }, messaging_type: 'RESPONSE' },
      { params: { access_token: token } }
    );
    return res.data.message_id || '';
  } catch (err) {
    throw metaError(err);
  }
}

/** Public reply under a Facebook comment. */
async function replyToFacebookComment({ commentId, text }) {
  const { token } = pageConfig();
  try {
    const res = await axios.post(`${graph()}/${commentId}/comments`, null, {
      params: { message: text, access_token: token },
    });
    return res.data.id || '';
  } catch (err) {
    throw metaError(err);
  }
}

/** Public reply under an Instagram comment. */
async function replyToInstagramComment({ commentId, text }) {
  const { token } = pageConfig();
  try {
    const res = await axios.post(`${graph()}/${commentId}/replies`, null, {
      params: { message: text, access_token: token },
    });
    return res.data.id || '';
  } catch (err) {
    throw metaError(err);
  }
}

/**
 * Look up a person's display name. Best-effort only - Meta often restricts
 * this, so failures just return {} and the lead gets a generic name.
 */
async function fetchProfile({ platform, userId }) {
  try {
    const { token } = pageConfig();
    const fields = platform === 'instagram' ? 'name,username' : 'first_name,last_name';
    const res = await axios.get(`${graph()}/${userId}`, { params: { fields, access_token: token } });
    const d = res.data || {};
    const name = d.name || [d.first_name, d.last_name].filter(Boolean).join(' ');
    return { name: name || '', username: d.username || '' };
  } catch {
    return {};
  }
}

module.exports = { sendDirectMessage, replyToFacebookComment, replyToInstagramComment, fetchProfile };
