// Daily auto-outreach: first message to new leads that haven't been
// contacted yet, within your daily limits.
// - Verified email -> AI-written email from your own mailbox
// - Otherwise phone -> your approved WhatsApp template
// - Instagram / Facebook are NOT automated (Meta forbids cold DMs by API) -
//   those leads show up on the Today page for you to send by hand.
const User = require('../models/User');
const Lead = require('../models/Lead');
const OutreachEvent = require('../models/OutreachEvent');
const { sendOutreach, draftOrFallback, remainingToday, OutreachError } = require('./outreachService');
const { verifyEmail } = require('./emailVerifier');
const { isConfigured: coldEmailConfigured } = require('./coldEmailService');
const { dailyLimits } = require('../config/outreachConfig');
const { startOfToday } = require('../utils/time');

const MAX_CANDIDATES = 300;

function whatsappReady() {
  return Boolean(process.env.WHATSAPP_OUTREACH_TEMPLATE && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Leads nobody has contacted yet, oldest first. */
async function freshLeads(ownerId) {
  return Lead.find({
    owner: ownerId,
    stage: 'new',
    doNotContact: { $ne: true },
    lastContactedAt: null,
  })
    .sort({ createdAt: 1 })
    .limit(MAX_CANDIDATES);
}

async function runForOwner(owner) {
  const ownerId = owner._id;
  const senderName = owner.businessName || owner.name || '';
  const summary = { email: 0, whatsapp: 0, skipped: 0, failed: 0, notes: [] };

  let emailLeft = coldEmailConfigured() ? await remainingToday(ownerId, 'email') : 0;
  let waLeft = whatsappReady() ? await remainingToday(ownerId, 'whatsapp') : 0;
  if (!coldEmailConfigured()) summary.notes.push('cold email not set up (COLD_EMAIL_SMTP_*) - email skipped');
  if (!whatsappReady()) summary.notes.push('WhatsApp outreach template not set up (WHATSAPP_OUTREACH_TEMPLATE) - WhatsApp skipped');
  if (emailLeft <= 0 && waLeft <= 0) return summary;

  for (const lead of await freshLeads(ownerId)) {
    if (emailLeft <= 0 && waLeft <= 0) break;

    // Prefer email when the address is verified (free), else WhatsApp
    let channel = null;
    if (emailLeft > 0 && lead.email) {
      if (lead.emailStatus === 'unknown' || !lead.emailStatus) {
        const r = await verifyEmail(lead.email);
        lead.emailStatus = r.status;
        lead.emailCheckedAt = new Date();
      }
      if (lead.emailStatus === 'valid') channel = 'email';
    }
    if (!channel && waLeft > 0 && lead.phone) channel = 'whatsapp';
    if (!channel) {
      if (lead.isModified()) await lead.save();
      summary.skipped += 1;
      continue;
    }

    try {
      const { message } =
        channel === 'email' ? await draftOrFallback({ lead, type: 'first_touch', channel, senderName }) : { message: '' };
      await sendOutreach({ lead, ownerId, channel, message, type: 'first_touch', sentBy: 'ai', auto: true, senderName });
      summary[channel] += 1;
      if (channel === 'email') emailLeft -= 1;
      else waLeft -= 1;
    } catch (err) {
      if (err instanceof OutreachError && err.code === 'LIMIT') {
        if (channel === 'email') emailLeft = 0;
        else waLeft = 0;
        continue;
      }
      summary.failed += 1;
      summary.notes.push(`${lead.name}: ${err.message}`);
      console.error(`[outreach] ${channel} to lead ${lead._id} failed: ${err.message}`);
      if (channel === 'whatsapp' && /template|token|permission|auth/i.test(err.message)) waLeft = 0; // config problem - stop hammering
    }
  }

  summary.notes = summary.notes.slice(0, 20);
  return summary;
}

/** Daily job: every user (a personal CRM usually has one). */
async function runDailyOutreach({ ownerId } = {}) {
  const owners = ownerId ? await User.find({ _id: ownerId }) : await User.find({});
  const results = {};
  for (const owner of owners) {
    try {
      results[String(owner._id)] = await runForOwner(owner);
    } catch (err) {
      results[String(owner._id)] = { error: err.message };
    }
  }
  return results;
}

/** Numbers + send lists for the Today page. */
async function todaySummary(ownerId) {
  const since = startOfToday();
  const limits = dailyLimits();

  const counts = await OutreachEvent.aggregate([
    { $match: { owner: ownerId, createdAt: { $gte: since } } },
    { $group: { _id: '$channel', count: { $sum: 1 } } },
  ]);
  const sent = Object.fromEntries(counts.map((c) => [c._id, c.count]));

  const baseQuery = { owner: ownerId, doNotContact: { $ne: true }, stage: { $in: ['new', 'contacted'] } };
  const pick = 'name businessName instagramHandle facebookUrl tags address website stage lastContactedChannel contactedChannels followUpCount createdAt';

  // Anyone not yet messaged on that platform
  const notYet = (channel) => ({ contactedChannels: { $ne: channel } });

  const instagram = await Lead.find({ ...baseQuery, instagramHandle: { $gt: '' }, ...notYet('instagram') })
    .select(pick)
    .sort({ createdAt: 1 })
    .limit(Math.max(0, limits.instagram - (sent.instagram || 0)));
  const facebook = await Lead.find({ ...baseQuery, facebookUrl: { $gt: '' }, ...notYet('facebook') })
    .select(pick)
    .sort({ createdAt: 1 })
    .limit(Math.max(0, limits.facebook - (sent.facebook || 0)));

  const newLeadsToday = await Lead.countDocuments({ owner: ownerId, createdAt: { $gte: since } });
  const awaitingFirstMessage = await Lead.countDocuments({ owner: ownerId, stage: 'new', doNotContact: { $ne: true }, lastContactedAt: null });

  return {
    limits,
    sent: { email: sent.email || 0, whatsapp: sent.whatsapp || 0, instagram: sent.instagram || 0, facebook: sent.facebook || 0 },
    ready: { email: coldEmailConfigured(), whatsapp: whatsappReady() },
    newLeadsToday,
    awaitingFirstMessage,
    queues: { instagram, facebook },
  };
}

module.exports = { runDailyOutreach, runForOwner, todaySummary, whatsappReady };
