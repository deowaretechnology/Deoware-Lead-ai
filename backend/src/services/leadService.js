// Shared lead rules used by the manual activity log (Phase 1/2) and the
// Unified Inbox (Phase 4), so both behave exactly the same.

const STAGE_ORDER = ['new', 'contacted', 'replied', 'interested', 'demo_requested', 'converted'];

/**
 * A lead replied. Stop automatic follow-ups (the sequence has done its job)
 * and move the stage forward - never backwards, and never out of
 * converted/lost.
 *
 * @param {object} lead - Lead document
 * @param {'replied'|'interested'|'demo_requested'} [targetStage='replied'] -
 *   how far the reply justifies moving (the Inbox's AI can say
 *   "interested" or "demo_requested"; a manual log just means "replied")
 * @returns {boolean} whether the stage changed
 */
function applyInboundReply(lead, targetStage = 'replied') {
  lead.autoFollowUp = false;
  lead.nextFollowUpAt = null;

  if (['converted', 'lost'].includes(lead.stage)) return false;

  const current = STAGE_ORDER.indexOf(lead.stage);
  const target = STAGE_ORDER.indexOf(targetStage);
  if (target > current) {
    const previous = lead.stage;
    lead.stage = targetStage;
    lead.activity.push({
      type: 'stage_change',
      channel: 'system',
      direction: 'internal',
      message: `Stage changed: ${previous} -> ${targetStage} (from their reply)`,
      sentBy: 'system',
    });
    return true;
  }
  return false;
}

module.exports = { applyInboundReply, STAGE_ORDER };
