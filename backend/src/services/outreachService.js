// The one place that actually sends (or logs) an outreach message to a lead.
// Used by the lead page ("Send"), the daily auto-outreach job, the follow-up
// sweep and the Today send list - so opt-outs, daily limits, WhatsApp
// template rules, email verification and follow-up scheduling behave the same
// everywhere.
const OutreachEvent = require('../models/OutreachEvent');
const { draftOutreachMessage } = require('./aiService');
const { verifyEmail } = require('./emailVerifier');
const { sendColdEmail } = require('./coldEmailService');
const { sendWhatsAppText, sendWhatsAppTemplate } = require('./whatsappService');
const { MAX_AUTO_FOLLOWUPS, FOLLOWUP_INTERVAL_DAYS, dailyLimits } = require('../config/outreachConfig');
const { startOfToday, daysFromNow } = require('../utils/time');

const AUTO_SEND_CHANNELS = ['whatsapp', 'email'];
const DAY_MS = 24 * 60 * 60 * 1000;

class OutreachError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function nextFollowUpDelay(followUpCount) {
  const idx = Math.min(followUpCount, FOLLOWUP_INTERVAL_DAYS.length - 1);
  return FOLLOWUP_INTERVAL_DAYS[idx];
}

/** After any outreach step: schedule the next follow-up or stop at the cap. */
function scheduleNextFollowUp(lead) {
  if ((lead.followUpCount || 0) >= MAX_AUTO_FOLLOWUPS) {
    lead.autoFollowUp = false;
    lead.nextFollowUpAt = null;
    lead.activity.push({
      type: 'system',
      channel: 'system',
      direction: 'internal',
      message: `Reached max automatic follow-ups (${MAX_AUTO_FOLLOWUPS}) with no reply. Needs manual attention.`,
      sentBy: 'system',
    });
  } else {
    // Only acted on while lead.autoFollowUp is true (the sweep filters on it)
    lead.nextFollowUpAt = daysFromNow(nextFollowUpDelay(lead.followUpCount || 0));
  }
}

/** Did they message us on WhatsApp in the last 24h? (then free text is allowed) */
function withinWhatsAppWindow(lead, now = Date.now()) {
  return (lead.activity || []).some(
    (a) => a.channel === 'whatsapp' && a.direction === 'inbound' && a.createdAt && now - new Date(a.createdAt).getTime() < DAY_MS
  );
}

async function sentToday(ownerId, channel) {
  return OutreachEvent.countDocuments({ owner: ownerId, channel, createdAt: { $gte: startOfToday() } });
}

async function remainingToday(ownerId, channel) {
  const limit = dailyLimits()[channel];
  if (limit === undefined) return Infinity;
  return Math.max(0, limit - (await sentToday(ownerId, channel)));
}

function displayName(lead) {
  return lead.businessName || lead.name || 'there';
}

/** Plain, still-personal message used when the AI isn't available. */
function fallbackMessage(lead, type, senderName) {
  const who = displayName(lead);
  const noSite = !lead.website;
  if (type === 'follow_up') {
    return `Hi ${who}, just following up on my earlier message. If a ${noSite ? 'simple website' : 'better website or WhatsApp automation'} could help ${who} get more customers, I'd be happy to show you a quick free demo. If not, no worries at all!\n\n- ${senderName}`;
  }
  return `Hi ${who}, I came across ${who}${lead.address ? ` in ${lead.address.split(',').slice(-3, -1).join(',').trim() || 'your area'}` : ''} on Google${noSite ? " and noticed you don't have a website yet" : ''}. We help local businesses get more customers with ${noSite ? 'simple, affordable websites' : 'better websites and WhatsApp automation'}. Would you like to see a quick free demo made for ${who}?\n\n- ${senderName}`;
}

/** AI draft with a plain fallback, so automation keeps working without an API key. */
async function draftOrFallback({ lead, type, channel, senderName }) {
  try {
    return { message: await draftOutreachMessage({ lead, type, channel, senderBusinessName: senderName }), ai: true };
  } catch (err) {
    return { message: fallbackMessage(lead, type, senderName), ai: false, aiError: err.message };
  }
}

async function ensureEmailChecked(lead) {
  const stale = !lead.emailCheckedAt || Date.now() - new Date(lead.emailCheckedAt).getTime() > 30 * DAY_MS;
  if (lead.emailStatus === 'unknown' || !lead.emailStatus || stale) {
    const r = await verifyEmail(lead.email);
    lead.emailStatus = r.status;
    lead.emailCheckedAt = new Date();
    lead.activity.push({
      type: 'system',
      channel: 'system',
      direction: 'internal',
      message: `Email check for ${lead.email}: ${r.status} - ${r.reason}`,
      sentBy: 'system',
    });
  }
  return lead.emailStatus;
}

/**
 * Send (email/WhatsApp) or log (Instagram/Facebook/LinkedIn - sent by hand)
 * an outreach message, then log it and schedule the next follow-up.
 *
 * @param {object} p
 * @param {object} p.lead - Lead document
 * @param {*} p.ownerId
 * @param {string} p.channel
 * @param {string} p.message - the text (for WhatsApp cold messages the approved template is sent instead)
 * @param {'first_touch'|'follow_up'} [p.type]
 * @param {string} [p.templateName] - force a WhatsApp template
 * @param {string[]} [p.templateParams]
 * @param {string} [p.sentBy] - 'user' | 'ai'
 * @param {boolean} [p.auto] - sent by the system (enforces daily limits + stricter email rules)
 * @param {string} [p.senderName]
 * @returns {Promise<{lead: object, sentAutomatically: boolean, logged: string}>}
 */
async function sendOutreach({
  lead,
  ownerId,
  channel,
  message,
  type = 'first_touch',
  templateName,
  templateParams,
  sentBy = 'user',
  auto = false,
  senderName = '',
}) {
  if (lead.doNotContact) throw new OutreachError('This lead has opted out - nothing will be sent', 'OPTED_OUT', 409);
  if (!channel) throw new OutreachError('channel is required', 'BAD_REQUEST');

  if (AUTO_SEND_CHANNELS.includes(channel) && (await remainingToday(ownerId, channel)) <= 0) {
    const limit = dailyLimits()[channel];
    throw new OutreachError(`Daily ${channel} limit reached (${limit}). It resets at midnight.`, 'LIMIT', 429);
  }

  let logged = message;
  let sentAutomatically = false;

  if (channel === 'email') {
    if (!lead.email) throw new OutreachError('Lead has no email address', 'NO_EMAIL');
    if (!message) throw new OutreachError('message is required', 'BAD_REQUEST');
    const status = await ensureEmailChecked(lead);
    if (status === 'invalid') {
      await lead.save();
      throw new OutreachError(`Email ${lead.email} looks invalid - not sending (it would bounce)`, 'EMAIL_INVALID');
    }
    if (status === 'risky' && auto) {
      await lead.save();
      throw new OutreachError(`Email ${lead.email} couldn't be verified - skipped by automation`, 'EMAIL_RISKY');
    }
    const base = `Quick question for ${displayName(lead)}`;
    await sendColdEmail({ lead, subject: type === 'follow_up' ? `Re: ${base}` : base, message });
    sentAutomatically = true;
  } else if (channel === 'whatsapp') {
    if (!lead.phone) throw new OutreachError('Lead has no phone number', 'NO_PHONE');
    if (!templateName && withinWhatsAppWindow(lead)) {
      if (!message) throw new OutreachError('message is required', 'BAD_REQUEST');
      await sendWhatsAppText({ to: lead.phone, message });
    } else {
      // Outside the 24h window Meta only allows approved templates
      const name =
        templateName ||
        (type === 'follow_up' ? process.env.WHATSAPP_FOLLOWUP_TEMPLATE : process.env.WHATSAPP_OUTREACH_TEMPLATE) ||
        process.env.WHATSAPP_OUTREACH_TEMPLATE;
      if (!name) {
        throw new OutreachError(
          'WhatsApp only allows approved templates for first messages. Create one in Meta Business Manager and set WHATSAPP_OUTREACH_TEMPLATE (and optionally WHATSAPP_FOLLOWUP_TEMPLATE).',
          'NO_TEMPLATE'
        );
      }
      const params =
        templateParams && templateParams.length
          ? templateParams
          : process.env.WHATSAPP_TEMPLATE_USES_NAME === 'false'
            ? []
            : [displayName(lead)];
      await sendWhatsAppTemplate({
        to: lead.phone,
        templateName: name,
        languageCode: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
        bodyParams: params,
      });
      logged = `[WhatsApp template "${name}"${params.length ? ` · ${params.join(', ')}` : ''}]`;
    }
    sentAutomatically = true;
  } else if (!message) {
    throw new OutreachError('message is required', 'BAD_REQUEST');
  }
  // instagram / facebook / linkedin / manual: you sent it by hand - we log it.

  lead.activity.push({ type: 'message', channel, direction: 'outbound', message: logged, sentBy });
  lead.lastContactedAt = new Date();
  lead.lastContactedChannel = channel;
  if (!(lead.contactedChannels || []).includes(channel)) lead.contactedChannels = [...(lead.contactedChannels || []), channel];
  if (type === 'follow_up') lead.followUpCount = (lead.followUpCount || 0) + 1;
  if (lead.stage === 'new') lead.stage = 'contacted';
  if (type === 'first_touch' && lead.autoFollowUp === false && !lead.followUpCount) lead.autoFollowUp = true;
  scheduleNextFollowUp(lead);

  await lead.save();
  await OutreachEvent.create({ owner: ownerId, lead: lead._id, channel, type, auto });

  return { lead, sentAutomatically, logged };
}

module.exports = {
  sendOutreach,
  draftOrFallback,
  fallbackMessage,
  remainingToday,
  sentToday,
  withinWhatsAppWindow,
  scheduleNextFollowUp,
  OutreachError,
  AUTO_SEND_CHANNELS,
};
