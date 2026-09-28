const axios = require('axios');
const { GRAPH_VERSION } = require('../config/contentConfig');

// Base URL overridable for proxies / local testing
const graph = () => `${process.env.META_GRAPH_BASE || 'https://graph.facebook.com'}/${GRAPH_VERSION}`;

function getConfig() {
  const pageId = process.env.META_PAGE_ID;
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  const igUserId = process.env.META_IG_USER_ID;
  if (!pageId || !pageToken) {
    throw new Error('META_PAGE_ID / META_PAGE_ACCESS_TOKEN not set - add them to your .env to publish posts');
  }
  return { pageId, pageToken, igUserId };
}

// Meta errors come back nested - surface the useful message.
function metaError(err) {
  const msg = err.response?.data?.error?.message || err.message;
  return new Error(`Meta API: ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Publish to a Facebook Page. Uses /photos when there's an image, /feed otherwise.
 * @returns {Promise<string>} the Facebook post id
 */
async function publishToFacebook({ message, imageUrl }) {
  const { pageId, pageToken } = getConfig();
  try {
    if (imageUrl) {
      const res = await axios.post(`${graph()}/${pageId}/photos`, null, {
        params: { url: imageUrl, caption: message, access_token: pageToken },
      });
      return res.data.post_id || res.data.id;
    }
    const res = await axios.post(`${graph()}/${pageId}/feed`, null, {
      params: { message, access_token: pageToken },
    });
    return res.data.id;
  } catch (err) {
    throw metaError(err);
  }
}

/**
 * Publish an image post to Instagram (Business/Creator account linked to the Page).
 * Two-step flow: create a media container, wait until Meta has processed the
 * image, then publish it.
 * @returns {Promise<string>} the Instagram media id
 */
async function publishToInstagram({ caption, imageUrl }) {
  const { pageToken, igUserId } = getConfig();
  if (!igUserId) {
    throw new Error('META_IG_USER_ID not set - add your Instagram Business account id to .env');
  }
  if (!imageUrl) {
    throw new Error('Instagram needs an image - add a public image URL to this post');
  }

  try {
    const container = await axios.post(`${graph()}/${igUserId}/media`, null, {
      params: { image_url: imageUrl, caption, access_token: pageToken },
    });
    const creationId = container.data.id;

    // Wait for Meta to finish fetching/processing the image (usually a few seconds)
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const status = await axios.get(`${graph()}/${creationId}`, {
        params: { fields: 'status_code', access_token: pageToken },
      });
      const code = status.data.status_code;
      if (code === 'FINISHED') break;
      if (code === 'ERROR' || code === 'EXPIRED') {
        throw new Error(`Instagram could not process the image (status ${code}) - check the image URL is public and a JPG/PNG`);
      }
      await sleep(3000);
    }

    const published = await axios.post(`${graph()}/${igUserId}/media_publish`, null, {
      params: { creation_id: creationId, access_token: pageToken },
    });
    return published.data.id;
  } catch (err) {
    if (err.response) throw metaError(err);
    throw err;
  }
}

/** Likes + comments for a Facebook post. */
async function getFacebookMetrics(postId) {
  const { pageToken } = getConfig();
  try {
    const res = await axios.get(`${graph()}/${postId}`, {
      params: {
        fields: 'likes.summary(true).limit(0),comments.summary(true).limit(0)',
        access_token: pageToken,
      },
    });
    return {
      likes: res.data.likes?.summary?.total_count || 0,
      comments: res.data.comments?.summary?.total_count || 0,
    };
  } catch (err) {
    throw metaError(err);
  }
}

/** Likes + comments for an Instagram post. */
async function getInstagramMetrics(mediaId) {
  const { pageToken } = getConfig();
  try {
    const res = await axios.get(`${graph()}/${mediaId}`, {
      params: { fields: 'like_count,comments_count', access_token: pageToken },
    });
    return {
      likes: res.data.like_count || 0,
      comments: res.data.comments_count || 0,
    };
  } catch (err) {
    throw metaError(err);
  }
}

module.exports = {
  publishToFacebook,
  publishToInstagram,
  getFacebookMetrics,
  getInstagramMetrics,
};
