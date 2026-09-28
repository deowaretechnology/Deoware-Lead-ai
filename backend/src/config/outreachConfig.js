// Central place to tune the outreach agent's behaviour without hunting
// through controllers/jobs.
module.exports = {
  // How many automatic follow-ups to send before giving up and flagging
  // the lead for manual attention.
  MAX_AUTO_FOLLOWUPS: 3,

  // Days to wait before each follow-up. Index 0 = after the 1st message,
  // index 1 = after the 1st follow-up, etc. Last value repeats if
  // MAX_AUTO_FOLLOWUPS is increased later.
  FOLLOWUP_INTERVAL_DAYS: [3, 5, 7],

  // Claude model used for drafting outreach + follow-up messages.
  // Haiku is plenty for short, templated messages and is far cheaper
  // than Sonnet/Opus for this high-volume, low-complexity job.
  AI_MODEL: process.env.CLAUDE_OUTREACH_MODEL || 'claude-haiku-4-5-20251001',

  // Stages the scheduler should never touch. Automatic follow-ups only make
  // sense for leads that haven't engaged yet (new/contacted) - once someone
  // has replied or moved further, spamming "just following up" is
  // counterproductive, so those stages are excluded here.
  EXCLUDED_STAGES: ['replied', 'interested', 'demo_requested', 'converted', 'lost'],

  // Daily limits (reset at your midnight - see APP_TZ_OFFSET_MINUTES).
  // Automatic channels (email, WhatsApp) are hard caps covering first
  // messages AND follow-ups. Instagram/Facebook are targets for the Today
  // send list (you send those by hand - Meta doesn't allow automated cold DMs).
  dailyLimits() {
    const n = (key, def) => {
      const v = Number(process.env[key]);
      return Number.isFinite(v) && v >= 0 ? v : def;
    };
    return {
      email: n('COLD_EMAIL_DAILY_LIMIT', 25),
      whatsapp: n('WHATSAPP_DAILY_LIMIT', 20),
      instagram: n('INSTAGRAM_DAILY_TARGET', 20),
      facebook: n('FACEBOOK_DAILY_TARGET', 20),
    };
  },
};
