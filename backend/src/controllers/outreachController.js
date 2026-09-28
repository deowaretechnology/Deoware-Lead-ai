const asyncHandler = require('express-async-handler');
const Lead = require('../models/Lead');
const { draftOutreachMessage } = require('../services/aiService');
const { sendOutreach, OutreachError } = require('../services/outreachService');
const { runDailyOutreach, todaySummary } = require('../services/dailyOutreachService');
const { runJob, JobBusyError } = require('../jobs/jobRunner');

// @desc    Ask Claude to draft an outreach/follow-up message (does NOT send or log it)
// @route   POST /api/outreach/:id/draft
// @access  Private
const draftMessage = asyncHandler(async (req, res) => {
  const { channel = 'whatsapp', type = 'first_touch' } = req.body;

  const lead = await Lead.findOne({ _id: req.params.id, owner: req.user._id });
  if (!lead) {
    res.status(404);
    throw new Error('Lead not found');
  }

  const message = await draftOutreachMessage({
    lead,
    type,
    channel,
    senderBusinessName: req.user.businessName || req.user.name,
  });

  res.json({ success: true, data: { message, channel, type } });
});

// @desc    Send (email/WhatsApp) or log (Instagram/Facebook/LinkedIn) an outreach message
// @route   POST /api/outreach/:id/send   { channel, message, type?, templateName?, templateParams? }
// @access  Private
const sendMessage = asyncHandler(async (req, res) => {
  const { channel, message, type = 'first_touch', templateName, templateParams } = req.body;

  if (!channel) {
    res.status(400);
    throw new Error('channel is required');
  }

  const lead = await Lead.findOne({ _id: req.params.id, owner: req.user._id });
  if (!lead) {
    res.status(404);
    throw new Error('Lead not found');
  }

  try {
    const out = await sendOutreach({
      lead,
      ownerId: req.user._id,
      channel,
      message,
      type,
      templateName,
      templateParams,
      sentBy: req.body.sentBy === 'user' ? 'user' : 'ai',
      auto: false,
      senderName: req.user.businessName || req.user.name,
    });
    res.status(201).json({ success: true, data: out.lead, sentAutomatically: out.sentAutomatically });
  } catch (err) {
    if (err instanceof OutreachError) res.status(err.statusCode);
    throw err;
  }
});

// @desc    Today's outreach numbers + Instagram/Facebook send lists
// @route   GET /api/outreach/today
const today = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await todaySummary(req.user._id) });
});

// @desc    Run today's auto-outreach now (same as the daily job, for this account)
// @route   POST /api/outreach/run-daily
const runDailyNow = asyncHandler(async (req, res) => {
  try {
    const { result } = await runJob('outreach', () => runDailyOutreach({ ownerId: req.user._id }), { source: 'external' });
    res.json({ success: true, data: result[String(req.user._id)] || {} });
  } catch (err) {
    if (err instanceof JobBusyError) res.status(409);
    throw err;
  }
});

module.exports = { draftMessage, sendMessage, today, runDailyNow };
