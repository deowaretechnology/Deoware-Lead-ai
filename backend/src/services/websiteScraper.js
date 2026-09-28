// Contact-detail scraper for a business's OWN website (the one Google lists
// for them). Reads the homepage plus up to two contact/about pages and pulls
// out public business contact info: emails, phone numbers and social links.
//
// Deliberately polite and narrow:
// - never touches Google Maps / Justdial / other directories
// - obeys robots.txt
// - max 3 pages per site, 10s timeout, 2 MB cap, pause between requests
// - identifies itself honestly in the User-Agent
const axios = require('axios');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');

const USER_AGENT =
  process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0 (compatible; CRMContactBot/1.0; business contact lookup)';
const MAX_PAGES = 3;
const TIMEOUT_MS = 10000;
const MAX_BYTES = 2 * 1024 * 1024;
const DELAY_MS = Number(process.env.SCRAPER_DELAY_MS ?? 700);

const SOCIAL_HOSTS = /(instagram\.com|facebook\.com|fb\.com|wa\.me|whatsapp\.com|linktr\.ee|business\.site|justdial\.com|sulekha\.com|indiamart\.com|linkedin\.com|youtube\.com)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProto).toString();
  } catch {
    return null;
  }
}

function isSocialOrDirectory(url) {
  return SOCIAL_HOSTS.test(url || '');
}

// ---------- Extractors ----------

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const JUNK_EMAIL = /(example\.(com|org)|domain\.com|email\.com|yourdomain|sentry|wixpress|\.(png|jpe?g|gif|svg|webp)$|@2x|noreply|no-reply)/i;

function cleanEmail(raw) {
  const e = String(raw || '')
    .trim()
    .replace(/^mailto:/i, '')
    .split('?')[0]
    .toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null;
  if (JUNK_EMAIL.test(e)) return null;
  return e;
}

// Cloudflare "email protection" hides addresses as a hex string in data-cfemail.
function decodeCfEmail(hex) {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = '';
    for (let i = 2; i < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    }
    return out;
  } catch {
    return '';
  }
}

function cleanPhone(raw) {
  const s = String(raw || '').replace(/^tel:/i, '').trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  return s.replace(/[^\d+\s-]/g, '').trim();
}

/**
 * Classify a link as a social profile we care about. Skips share buttons,
 * individual posts and the platforms' own homepages.
 */
function classifySocial(href) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  const first = (parts[0] || '').toLowerCase();

  if (host === 'instagram.com') {
    if (!first || ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'share'].includes(first)) return null;
    return { type: 'instagram', value: `https://instagram.com/${parts[0]}` };
  }
  if (host === 'facebook.com' || host === 'fb.com') {
    if (!first || ['sharer', 'sharer.php', 'share', 'dialog', 'plugins', 'tr', 'login'].includes(first)) return null;
    if (first === 'profile.php') {
      const id = u.searchParams.get('id');
      return id ? { type: 'facebook', value: `https://facebook.com/profile.php?id=${id}` } : null;
    }
    return { type: 'facebook', value: `https://facebook.com/${parts[0]}` };
  }
  if (host === 'wa.me') {
    const num = first.replace(/\D/g, '');
    return num.length >= 10 ? { type: 'whatsapp', value: `https://wa.me/${num}` } : null;
  }
  if (host === 'api.whatsapp.com' || host === 'whatsapp.com' || host === 'web.whatsapp.com') {
    const num = (u.searchParams.get('phone') || '').replace(/\D/g, '');
    return num.length >= 10 ? { type: 'whatsapp', value: `https://wa.me/${num}` } : null;
  }
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    if (!['company', 'in'].includes(first) || !parts[1]) return null;
    return { type: 'linkedin', value: `https://linkedin.com/${first}/${parts[1]}` };
  }
  if (host === 'youtube.com') {
    if (!first || ['watch', 'embed', 'shorts', 'results'].includes(first)) return null;
    return { type: 'youtube', value: `https://youtube.com/${parts.slice(0, 2).join('/')}` };
  }
  return null;
}

function emptyResult() {
  return { emails: new Set(), phones: new Set(), socials: {} };
}

/** Pull contacts + candidate contact-page links out of one HTML page. */
function extractFromHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const found = emptyResult();
  const base = new URL(pageUrl);
  const contactLinks = [];

  $('a[href]').each((_, el) => {
    const rawHref = ($(el).attr('href') || '').trim();
    if (!rawHref) return;

    if (/^mailto:/i.test(rawHref)) {
      const e = cleanEmail(rawHref);
      if (e) found.emails.add(e);
      return;
    }
    if (/^tel:/i.test(rawHref)) {
      const p = cleanPhone(rawHref);
      if (p) found.phones.add(p);
      return;
    }

    let abs;
    try {
      abs = new URL(rawHref, base).toString();
    } catch {
      return;
    }

    const social = classifySocial(abs);
    if (social && !found.socials[social.type]) {
      found.socials[social.type] = social.value;
      return;
    }

    const text = $(el).text().trim();
    const sameSite = new URL(abs).hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '');
    if (sameSite && /(contact|about|reach|get-in-touch|enquir|inquir)/i.test(`${rawHref} ${text}`)) {
      contactLinks.push(abs.split('#')[0]);
    }
  });

  $('[data-cfemail]').each((_, el) => {
    const e = cleanEmail(decodeCfEmail($(el).attr('data-cfemail') || ''));
    if (e) found.emails.add(e);
  });

  // Emails written as plain text (not links)
  $('script, style, noscript').remove();
  const text = $('body').text() || '';
  for (const m of text.match(EMAIL_RE) || []) {
    const e = cleanEmail(m);
    if (e) found.emails.add(e);
  }

  return { found, contactLinks: [...new Set(contactLinks)] };
}

function merge(into, from) {
  from.emails.forEach((e) => into.emails.add(e));
  from.phones.forEach((p) => into.phones.add(p));
  for (const [k, v] of Object.entries(from.socials)) {
    if (!into.socials[k]) into.socials[k] = v;
  }
}

// ---------- Fetching ----------

async function loadRobots(origin) {
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const res = await axios.get(robotsUrl, {
      timeout: 5000,
      responseType: 'text',
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: () => true,
    });
    if (res.status >= 400) return null; // no robots.txt = no restrictions
    return robotsParser(robotsUrl, String(res.data || ''));
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: TIMEOUT_MS,
    maxContentLength: MAX_BYTES,
    maxRedirects: 5,
    responseType: 'text',
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
  });
  const type = String(res.headers?.['content-type'] || 'text/html');
  if (!/html/i.test(type)) throw new Error(`Not an HTML page (${type})`);
  return String(res.data || '');
}

/**
 * Scrape a business website for contact details.
 * @param {string} website
 * @returns {Promise<{emails:string[], phones:string[], socials:object, pagesScanned:number, blockedByRobots:boolean}>}
 */
async function scrapeWebsite(website) {
  const start = normalizeUrl(website);
  if (!start) throw new Error('Invalid website URL');

  // A social/directory link isn't their site - just record it, don't crawl it.
  if (isSocialOrDirectory(start)) {
    const social = classifySocial(start);
    return {
      emails: [],
      phones: [],
      socials: social ? { [social.type]: social.value } : {},
      pagesScanned: 0,
      blockedByRobots: false,
    };
  }

  const origin = new URL(start).origin;
  const robots = await loadRobots(origin);
  const allowed = (url) => !robots || robots.isAllowed(url, USER_AGENT) !== false;

  if (!allowed(start)) {
    return { emails: [], phones: [], socials: {}, pagesScanned: 0, blockedByRobots: true };
  }

  const result = emptyResult();
  const queue = [start];
  const seen = new Set();
  let pagesScanned = 0;
  let firstError = null;

  while (queue.length && pagesScanned < MAX_PAGES) {
    const url = queue.shift();
    if (seen.has(url) || !allowed(url)) continue;
    seen.add(url);

    if (pagesScanned > 0) await sleep(DELAY_MS);
    try {
      const html = await fetchHtml(url);
      pagesScanned += 1;
      const { found, contactLinks } = extractFromHtml(html, url);
      merge(result, found);
      if (pagesScanned === 1) {
        contactLinks.slice(0, MAX_PAGES - 1).forEach((l) => queue.push(l));
      }
    } catch (err) {
      if (pagesScanned === 0 && !firstError) firstError = err;
    }
  }

  if (pagesScanned === 0 && firstError) {
    const reason = firstError.response?.status ? `HTTP ${firstError.response.status}` : firstError.message;
    throw new Error(`Could not open website (${reason})`);
  }

  return {
    emails: [...result.emails].slice(0, 5),
    phones: [...result.phones].slice(0, 5),
    socials: result.socials,
    pagesScanned,
    blockedByRobots: false,
  };
}

module.exports = {
  scrapeWebsite,
  extractFromHtml,
  classifySocial,
  cleanEmail,
  decodeCfEmail,
  normalizeUrl,
  isSocialOrDirectory,
};
