const cron = require('node-cron');
const { runJob } = require('./jobRunner');
const Lead = require('../models/Lead');
const {
  sendOutreach,
  draftOrFallback,
  remainingToday,
  withinWhatsAppWindow,
  scheduleNextFollowUp,
  OutreachError,
  AUTO_SEND_CHANNELS,
} = require('../services/outreachService');
const { EXCLUDED_STAGES } = require('../config/outreachConfig');
const { daysFromNow } = require('../utils/time');

// Errors that mean "can't auto-send this one" -> leave a draft for a human instead
const DRAFT_INSTEAD = new Set(['NO_TEMPLATE', 'NO_EMAIL', 'NO_PHONE', 'EMAIL_INVALID', 'EMAIL_RISKY']);

/**
 * Finds every lead whose follow-up is due and sends the next one:
 * - email -> from your own mailbox (verified addresses only)
 * - WhatsApp -> free text if they messaged in the last 24h, otherwise your
 *   approved follow-up template
 * - Instagram / Facebook / anything that can't be auto-sent -> an AI draft
 *   is left on the lead's timeline for you to send by hand
 * Daily limits apply; over the limit, the follow-up moves to tomorrow.
 * Opted-out leads are never touched.
 */
async function runFollowUpSweep() {
  const dueLeads = await Lead.find({
    autoFollowUp: true,
    doNotContact: { $ne: true },
    nextFollowUpAt: { $lte: new Date() },
    stage: { $nin: EXCLUDED_STAGES },
  }).populate('owner', 'name businessName');

  const results = { processed: 0, sent: 0, drafted: 0, postponed: 0, stopped: 0, failed: 0 };

  for (const lead of dueLeads) {
    results.processed += 1;
    const ownerId = lead.owner?._id || lead.owner;
    const senderName = lead.owner?.businessName || lead.owner?.name || '';
    const channel = lead.lastContactedChannel || (lead.email ? 'email' : 'whatsapp');

    try {
      if (AUTO_SEND_CHANNELS.includes(channel)) {
        if ((await remainingToday(ownerId, channel)) <= 0) {
          lead.nextFollowUpAt = daysFromNow(1);
          await lead.save();
          results.postponed += 1;
          continue;
        }

        // WhatsApp outside the 24h window sends a template - no AI text needed
        const needsText = channel === 'email' || withinWhatsAppWindow(lead);
        const { message } = needsText
          ? await draftOrFallback({ lead, type: 'follow_up', channel, senderName })
          : { message: '' };

        try {
          await sendOutreach({ lead, ownerId, channel, message, type: 'follow_up', sentBy: 'ai', auto: true, senderName });
          results.sent += 1;
          if (!lead.autoFollowUp) results.stopped += 1;
          continue;
        } catch (err) {
          if (!(err instanceof OutreachError) || !DRAFT_INSTEAD.has(err.code)) throw err;
          // fall through to leaving a draft
        }
      }

      const { message } = await draftOrFallback({ lead, type: 'follow_up', channel, senderName });
      lead.activity.push({
        type: 'message',
        channel,
        direction: 'outbound',
        message: `[Draft ready - send manually] ${message}`,
        sentBy: 'ai',
      });
      lead.followUpCount = (lead.followUpCount || 0) + 1;
      scheduleNextFollowUp(lead);
      await lead.save();
      results.drafted += 1;
      if (!lead.autoFollowUp) results.stopped += 1;
    } catch (err) {
      results.failed += 1;
      console.error(`Follow-up sweep failed for lead ${lead._id}: ${err.message}`);
      // Don't retry immediately - push it out a day so a misconfigured key
      // doesn't retry-loop every run.
      lead.nextFollowUpAt = daysFromNow(1);
      await lead.save().catch(() => {});
    }
  }

  return results;
}

/**
 * Starts the recurring cron job. Call once from server.js after DB connects.
 * Schedule is a plain daily check by default - plenty for outreach volumes
 * a single person/agency sends. Override with FOLLOWUP_CRON in .env if needed.
 */
function startFollowUpScheduler() {
  const schedule = process.env.FOLLOWUP_CRON || '0 10 * * *'; // 10:00 AM server time, daily

  cron.schedule(schedule, async () => {
    try {
      await runJob('followups', runFollowUpSweep, { source: 'internal' });
    } catch {
      // already logged + recorded by runJob (or skipped because it's running)
    }
  });

  console.log(`[follow-up scheduler] scheduled with cron "${schedule}"`);
}

module.exports = { startFollowUpScheduler, runFollowUpSweep };
