const crypto = require('crypto');
const Prospect = require('../models/Prospect');
const Lead = require('../models/Lead');
const ApiUsage = require('../models/ApiUsage');
const { searchText, normalizePlace, scoreProspect } = require('./placesService');
const { phoneRegex } = require('./inboxService');
const { scrapeWebsite, classifySocial, isSocialOrDirectory } = require('./websiteScraper');

const MAX_ENRICH_PER_CALL = 25;

function instagramHandle(url) {
  const m = String(url || '').match(/instagram\.com\/([^/?#]+)/i);
  return m ? m[1] : '';
}

// A "website" that's really an Instagram/Facebook/WhatsApp link tells us the
// social profile for free - no scraping needed.
function socialsFromWebsite(website) {
  if (!website || !isSocialOrDirectory(website)) return null;
  const social = classifySocial(website);
  return social ? { [social.type]: social.value } : null;
}

const API = 'places_text_search';

class FinderError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

// Stay inside Google's free monthly allowance by default (1,000 Enterprise
// Text Search calls). Each call returns up to 20 businesses.
function monthlyLimit() {
  const n = Number(process.env.PLACES_MONTHLY_REQUEST_LIMIT);
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

async function getUsage(ownerId) {
  const row = await ApiUsage.findOne({ owner: ownerId, api: API, month: monthKey() });
  const used = row?.count || 0;
  const limit = monthlyLimit();
  return { used, limit, remaining: Math.max(0, limit - used), month: monthKey() };
}

async function recordCall(ownerId) {
  await ApiUsage.findOneAndUpdate(
    { owner: ownerId, api: API, month: monthKey() },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );
}

async function findExistingLead(ownerId, phone) {
  const re = phone ? phoneRegex(phone) : null;
  return re ? Lead.findOne({ owner: ownerId, phone: { $regex: re } }) : null;
}

/**
 * Save (or refresh) one business as a prospect: score it, pick up social links
 * from a social-only "website", and link it if it's already a lead.
 * @returns {Promise<{prospect: object, created: boolean}>}
 */
async function upsertProspect(ownerId, data, { searchQuery = '', source = 'search', extra = {} } = {}) {
  const { score, scoreReasons } = scoreProspect(data);
  const freeSocials = socialsFromWebsite(data.website);

  let prospect = await Prospect.findOne({ owner: ownerId, placeId: data.placeId });
  let created = false;
  if (prospect) {
    // Refresh details but keep our status (imported/dismissed) and first source
    Object.assign(prospect, data, { score, scoreReasons });
  } else {
    prospect = new Prospect({ owner: ownerId, ...data, score, scoreReasons, searchQuery, source });
    created = true;
  }

  const socials = { ...(freeSocials || {}), ...(extra.socials || {}) };
  for (const [k, v] of Object.entries(socials)) {
    if (v && !prospect.socials?.[k]) prospect.set(`socials.${k}`, v);
  }
  if (extra.emails?.length) {
    prospect.emails = [...new Set([...(prospect.emails || []), ...extra.emails])].slice(0, 5);
  }

  // Already in the pipeline under the same phone? Mark it so we don't double up.
  if (prospect.status === 'new' && !prospect.lead) {
    const existing = await findExistingLead(ownerId, data.phone);
    if (existing) {
      prospect.status = 'imported';
      prospect.lead = existing._id;
    }
  }

  await prospect.save();
  return { prospect, created };
}

/**
 * Search Google for businesses, score them, save new ones as prospects.
 * @param {object} p
 * @param {number} [p.pages=1] 1-3 pages of 20 results (each page = 1 billable call)
 * @param {string} [p.regionCode] - country bias, e.g. IN, AE, GB, US (defaults to PLACES_REGION_CODE)
 * @param {'search'|'auto'} [p.source]
 */
async function searchProspects({ ownerId, query, pages = 1, regionCode, source = 'search' }) {
  const q = String(query || '').trim();
  if (q.length < 3) throw new FinderError('Type what and where, e.g. "beauty parlour in Salt Lake Kolkata"');

  const wanted = Math.min(3, Math.max(1, Number(pages) || 1));
  const usage = await getUsage(ownerId);
  if (usage.remaining < 1) {
    throw new FinderError(
      `Monthly search limit reached (${usage.limit} calls). Raise PLACES_MONTHLY_REQUEST_LIMIT if you're OK paying Google beyond the free tier.`,
      429
    );
  }

  const found = [];
  let pageToken = null;
  let calls = 0;
  for (let i = 0; i < Math.min(wanted, usage.remaining); i += 1) {
    const { places, nextPageToken } = await searchText({ query: q, pageToken, regionCode });
    calls += 1;
    await recordCall(ownerId);
    found.push(...places);
    if (!nextPageToken) break;
    pageToken = nextPageToken;
  }

  const results = [];
  let added = 0;
  for (const place of found) {
    if (!place.id) continue;
    const { prospect, created } = await upsertProspect(ownerId, normalizePlace(place), { searchQuery: q, source });
    if (created) added += 1;
    results.push(prospect);
  }

  results.sort((a, b) => b.score - a.score);
  return { results, added, calls, usage: await getUsage(ownerId) };
}

// ---------- CSV import ----------

// Header names used by common exports (Google Maps scraper tools, Excel lists)
const CSV_COLUMNS = {
  name: ['name', 'business name', 'business', 'company', 'company name', 'title', 'place name'],
  phone: ['phone', 'phone number', 'phone_number', 'phone_1', 'mobile', 'international phone', 'contact number', 'whatsapp'],
  website: ['website', 'site', 'url', 'web', 'domain', 'website url'],
  address: ['address', 'full_address', 'full address', 'formatted_address', 'location', 'street'],
  category: ['category', 'categories', 'type', 'main category', 'business type', 'subtypes'],
  rating: ['rating', 'stars', 'google rating'],
  reviews: ['reviews', 'reviews_count', 'review count', 'user_ratings_total', 'number of reviews', 'reviewcount'],
  email: ['email', 'email_1', 'emails', 'e-mail', 'email address'],
  instagram: ['instagram', 'instagram url', 'instagram_url'],
  facebook: ['facebook', 'facebook url', 'facebook_url'],
  mapsUrl: ['maps url', 'google maps url', 'location_link', 'maps link', 'link'],
};

function pickColumn(row, keys) {
  const lower = {};
  for (const [k, v] of Object.entries(row || {})) lower[String(k).trim().toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function csvRowToProspect(row) {
  const get = (field) => pickColumn(row, CSV_COLUMNS[field]);
  const name = get('name');
  if (!name) return null;
  const phone = get('phone');
  const address = get('address');
  const website = get('website');
  const ratingNum = Number(String(get('rating')).replace(',', '.'));
  const reviewsNum = parseInt(String(get('reviews')).replace(/[^\d]/g, ''), 10);
  const emails = get('email')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e));
  const ig = get('instagram');
  const fb = get('facebook');

  const key = `${name}|${phone.replace(/\D/g, '').slice(-10)}|${address}`.toLowerCase();
  return {
    data: {
      placeId: `csv:${crypto.createHash('sha1').update(key).digest('hex').slice(0, 20)}`,
      name,
      category: get('category').split(',')[0].trim(),
      address,
      phone,
      website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
      rating: Number.isFinite(ratingNum) && ratingNum > 0 && ratingNum <= 5 ? ratingNum : null,
      reviewCount: Number.isFinite(reviewsNum) ? reviewsNum : 0,
      mapsUrl: get('mapsUrl'),
      businessStatus: 'OPERATIONAL',
    },
    extra: {
      emails,
      socials: {
        ...(ig ? { instagram: /^https?:/i.test(ig) ? ig : `https://instagram.com/${ig.replace(/^@/, '')}` } : {}),
        ...(fb ? { facebook: /^https?:/i.test(fb) ? fb : `https://facebook.com/${fb}` } : {}),
      },
    },
  };
}

/**
 * Bring in businesses from a CSV (already parsed into row objects by the
 * browser). Headers are matched loosely, so exports from most tools work.
 */
async function importCsvRows({ ownerId, rows, fileName = 'CSV' }) {
  if (!Array.isArray(rows) || rows.length === 0) throw new FinderError('The file has no rows');
  if (rows.length > 2000) throw new FinderError('Import at most 2,000 rows at a time');

  const summary = { added: 0, updated: 0, skipped: 0, alreadyLeads: 0 };
  for (const row of rows) {
    const parsed = csvRowToProspect(row);
    if (!parsed) {
      summary.skipped += 1;
      continue;
    }
    const { prospect, created } = await upsertProspect(ownerId, parsed.data, {
      searchQuery: `CSV: ${String(fileName).slice(0, 60)}`,
      source: 'csv',
      extra: parsed.extra,
    });
    if (created) summary.added += 1;
    else summary.updated += 1;
    if (prospect.status === 'imported') summary.alreadyLeads += 1;
  }
  return summary;
}

/**
 * Move chosen prospects into the CRM pipeline as leads. Idempotent: running
 * it twice doesn't create duplicates, and it links to an existing lead with
 * the same phone number instead of making a new one.
 */
async function importProspects({ ownerId, ids }) {
  if (!Array.isArray(ids) || ids.length === 0) throw new FinderError('Pick at least one business to import');
  if (ids.length > 100) throw new FinderError('Import at most 100 at a time');

  const summary = { imported: 0, linked: 0, skipped: 0, leads: [] };

  for (const id of ids) {
    const prospect = await Prospect.findOne({ _id: id, owner: ownerId });
    if (!prospect) {
      summary.skipped += 1;
      continue;
    }
    if (prospect.lead) {
      summary.skipped += 1;
      continue;
    }

    const existing = await findExistingLead(ownerId, prospect.phone);
    if (existing) {
      prospect.lead = existing._id;
      prospect.status = 'imported';
      await prospect.save();
      summary.linked += 1;
      summary.leads.push(existing._id);
      continue;
    }

    const details = [
      prospect.category && `Type: ${prospect.category}`,
      prospect.address && `Address: ${prospect.address}`,
      `Website: ${prospect.website || 'none'}`,
      prospect.rating !== null && `Google rating: ${prospect.rating}★ (${prospect.reviewCount} reviews)`,
      prospect.mapsUrl && `Maps: ${prospect.mapsUrl}`,
      prospect.scoreReasons.length && `Why it's a good prospect: ${prospect.scoreReasons.join('; ')}`,
      prospect.emails?.length && `Emails found on their site: ${prospect.emails.join(', ')}`,
      prospect.extraPhones?.length && `Other phones on their site: ${prospect.extraPhones.join(', ')}`,
      ...Object.entries(prospect.socials?.toObject?.() || prospect.socials || {})
        .filter(([, v]) => v)
        .map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`),
    ]
      .filter(Boolean)
      .join('\n');

    const lead = await Lead.create({
      owner: ownerId,
      name: prospect.name,
      businessName: prospect.name,
      phone: prospect.phone,
      email: prospect.emails?.[0] || '',
      instagramHandle: instagramHandle(prospect.socials?.instagram),
      facebookUrl: prospect.socials?.facebook || '',
      website: prospect.website,
      address: prospect.address,
      source: 'google_maps',
      tags: prospect.category ? [prospect.category] : [],
      activity: [
        {
          type: 'system',
          channel: 'system',
          direction: 'internal',
          message: `Imported from Lead Finder (search: "${prospect.searchQuery}", score ${prospect.score}/100)\n${details}`,
          sentBy: 'system',
        },
      ],
    });

    prospect.lead = lead._id;
    prospect.status = 'imported';
    await prospect.save();
    summary.imported += 1;
    summary.leads.push(lead._id);
  }

  return summary;
}

/**
 * "Find contacts": scrape each prospect's own website for emails, phones and
 * social links. Runs one site at a time (polite + predictable). If the
 * prospect is already a lead, missing email/Instagram on the lead are filled in.
 */
async function enrichProspects({ ownerId, ids }) {
  if (!Array.isArray(ids) || ids.length === 0) throw new FinderError('Pick at least one business');
  if (ids.length > MAX_ENRICH_PER_CALL) {
    throw new FinderError(`Find contacts for at most ${MAX_ENRICH_PER_CALL} businesses at a time`);
  }

  const summary = { scanned: 0, withEmail: 0, withSocial: 0, noWebsite: 0, failed: 0, prospects: [] };

  for (const id of ids) {
    const prospect = await Prospect.findOne({ _id: id, owner: ownerId });
    if (!prospect) continue;

    if (!prospect.website) {
      prospect.enrichError = 'No website to scan';
      prospect.enrichedAt = new Date();
      await prospect.save();
      summary.noWebsite += 1;
      summary.prospects.push(prospect);
      continue;
    }

    try {
      const found = await scrapeWebsite(prospect.website);
      const knownPhones = new Set([String(prospect.phone).replace(/\D/g, '').slice(-10)]);
      prospect.emails = found.emails;
      prospect.extraPhones = found.phones.filter((p) => {
        const key = p.replace(/\D/g, '').slice(-10);
        if (knownPhones.has(key)) return false;
        knownPhones.add(key);
        return true;
      });
      for (const [k, v] of Object.entries(found.socials)) prospect.set(`socials.${k}`, v);
      prospect.enrichError = found.blockedByRobots ? 'Site asks bots not to read it (robots.txt) - skipped' : '';
      summary.scanned += 1;
      if (found.emails.length) summary.withEmail += 1;
      if (Object.keys(found.socials).length) summary.withSocial += 1;
    } catch (err) {
      prospect.enrichError = err.message;
      summary.failed += 1;
    }
    prospect.enrichedAt = new Date();
    await prospect.save();

    // Already a lead? Fill in what it's missing.
    if (prospect.lead && !prospect.enrichError) {
      const lead = await Lead.findOne({ _id: prospect.lead, owner: ownerId });
      if (lead) {
        const added = [];
        if (!lead.email && prospect.emails[0]) {
          lead.email = prospect.emails[0];
          added.push(`email ${lead.email}`);
        }
        const handle = instagramHandle(prospect.socials?.instagram);
        if (!lead.instagramHandle && handle) {
          lead.instagramHandle = handle;
          added.push(`Instagram @${handle}`);
        }
        if (added.length) {
          lead.activity.push({
            type: 'system',
            channel: 'system',
            direction: 'internal',
            message: `Contact details found on their website: ${added.join(', ')}`,
            sentBy: 'system',
          });
          await lead.save();
        }
      }
    }

    summary.prospects.push(prospect);
  }

  return summary;
}

module.exports = {
  searchProspects,
  upsertProspect,
  importCsvRows,
  csvRowToProspect,
  importProspects,
  enrichProspects,
  getUsage,
  FinderError,
  monthKey,
  instagramHandle,
};
