const axios = require('axios');
const { SOCIAL_ONLY } = require('./aiService');

// Base URL overridable for proxies / local testing
const endpoint = () => `${process.env.PLACES_API_BASE || 'https://places.googleapis.com'}/v1/places:searchText`;

// Only ask Google for what we use. Phone/website/rating push the request to
// the "Enterprise" SKU - that's the price of getting contactable leads.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.primaryTypeDisplayName',
  'nextPageToken',
].join(',');

/**
 * One Google Places Text Search call (up to 20 results).
 * @returns {Promise<{places: object[], nextPageToken: string|null}>}
 */
async function searchText({ query, pageToken, regionCode }) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not set - add it to your .env to use the Lead Finder');

  try {
    const res = await axios.post(
      endpoint(),
      {
        textQuery: query,
        pageSize: 20,
        regionCode: regionCode || process.env.PLACES_REGION_CODE || 'IN',
        languageCode: 'en',
        ...(pageToken ? { pageToken } : {}),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': FIELD_MASK,
        },
      }
    );
    return { places: res.data.places || [], nextPageToken: res.data.nextPageToken || null };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(`Google Places: ${msg}`);
  }
}

/** Google's place object -> our flat prospect fields. */
function normalizePlace(place) {
  return {
    placeId: place.id,
    name: place.displayName?.text || 'Unnamed business',
    category: place.primaryTypeDisplayName?.text || '',
    address: place.formattedAddress || '',
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || '',
    website: place.websiteUri || '',
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount: place.userRatingCount || 0,
    mapsUrl: place.googleMapsUri || '',
    businessStatus: place.businessStatus || '',
  };
}

/**
 * How good a prospect is this for a web / AI-automation agency? 0-100 with
 * human-readable reasons. Deterministic on purpose: no AI cost per result,
 * and you can see exactly why something ranked high.
 */
function scoreProspect(p) {
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') {
    return { score: 0, scoreReasons: ['Not currently operating'] };
  }

  let score = 0;
  const reasons = [];

  if (!p.website) {
    score += 40;
    reasons.push('No website');
  } else if (SOCIAL_ONLY.test(p.website)) {
    score += 30;
    reasons.push('Only a social/listing page, no real website');
  }

  if (p.phone) {
    score += 15;
    reasons.push('Phone available');
  } else {
    reasons.push('No phone listed - harder to reach');
  }

  if (p.reviewCount >= 10 && p.reviewCount <= 200) {
    score += 20;
    reasons.push(`${p.reviewCount} reviews - established, still growing`);
  } else if (p.reviewCount > 200) {
    score += 10;
    reasons.push(`${p.reviewCount} reviews - busy business`);
  } else if (p.reviewCount > 0) {
    score += 5;
    reasons.push(`Only ${p.reviewCount} reviews - very new or small`);
  }

  if (p.rating !== null && p.rating >= 4) {
    score += 15;
    reasons.push(`Rated ${p.rating}★ - customers like them`);
  } else if (p.rating !== null && p.rating < 3.5) {
    reasons.push(`Rated ${p.rating}★`);
  }

  return { score: Math.min(100, score), scoreReasons: reasons };
}

module.exports = { searchText, normalizePlace, scoreProspect, FIELD_MASK };
