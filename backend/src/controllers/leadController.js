const asyncHandler = require('express-async-handler');
const Lead = require('../models/Lead');
const { applyInboundReply } = require('../services/leadService');

// @desc    Create a new lead
// @route   POST /api/leads
// @access  Private
const createLead = asyncHandler(async (req, res) => {
  const {
    name,
    businessName,
    phone,
    email,
    instagramHandle,
    website,
    address,
    source,
    stage,
    dealValue,
    tags,
  } = req.body;

  if (!name) {
    res.status(400);
    throw new Error('Lead name is required');
  }

  const lead = await Lead.create({
    owner: req.user._id,
    name,
    businessName,
    phone,
    email,
    instagramHandle,
    website,
    address,
    source,
    stage,
    dealValue,
    tags,
    activity: [
      {
        type: 'system',
        channel: 'system',
        direction: 'internal',
        message: 'Lead created',
        sentBy: 'system',
      },
    ],
  });

  res.status(201).json({ success: true, data: lead });
});

// @desc    Get all leads for the logged-in user (with filters)
// @route   GET /api/leads?stage=new&source=instagram_dm&search=riya
// @access  Private
const getLeads = asyncHandler(async (req, res) => {
  const { stage, source, search } = req.query;

  const query = { owner: req.user._id };
  if (stage) query.stage = stage;
  if (source) query.source = source;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { businessName: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const leads = await Lead.find(query).sort({ updatedAt: -1 });
  res.json({ success: true, count: leads.length, data: leads });
});

// @desc    Get leads grouped by pipeline stage (for the kanban board)
// @route   GET /api/leads/pipeline
// @access  Private
const getPipeline = asyncHandler(async (req, res) => {
  const stages = [
    'new',
    'contacted',
    'replied',
    'interested',
    'demo_requested',
    'converted',
    'lost',
  ];

  const leads = await Lead.find({ owner: req.user._id }).sort({ updatedAt: -1 });

  const pipeline = stages.reduce((acc, stage) => {
    acc[stage] = leads.filter((lead) => lead.stage === stage);
    return acc;
  }, {});

  res.json({ success: true, data: pipeline });
});

// @desc    Get dashboard stats (counts, conversion rate, follow-ups due)
// @route   GET /api/leads/stats
// @access  Private
const getStats = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;

  const stageCounts = await Lead.aggregate([
    { $match: { owner: ownerId } },
    { $group: { _id: '$stage', count: { $sum: 1 } } },
  ]);

  const counts = stageCounts.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const totalLeads = await Lead.countDocuments({ owner: ownerId });
  const converted = counts.converted || 0;
  const conversionRate = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : 0;

  const followUpsDueToday = await Lead.countDocuments({
    owner: ownerId,
    nextFollowUpAt: { $lte: new Date() },
    stage: { $nin: ['converted', 'lost'] },
  });

  res.json({
    success: true,
    data: {
      totalLeads,
      stageCounts: counts,
      conversionRate: Number(conversionRate),
      followUpsDueToday,
    },
  });
});

// @desc    Get a single lead
// @route   GET /api/leads/:id
// @access  Private
const getLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, owner: req.user._id });

  if (!lead) {
    res.status(404);
    throw new Error('Lead not found');
  }

  res.json({ success: true, data: lead });
});

// @desc    Update a lead's details
// @route   PUT /api/leads/:id
// @access  Private
const updateLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, owner: req.user._id });

  if (!lead) {
    res.status(404);
    throw new Error('Lead not found');
  }

  const allowedFields = [
    'name',
    'businessName',
    'phone',
    'email',
    'instagramHandle',
    'website',
    'address',
    'facebookUrl',
    'doNotContact',
    'autoFollowUp',
    'source',
    'dealValue',
    'tags',
    'nextFollowUpAt',
    'lostReason',
  ];

  const previousEmail = lead.email;
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      lead[field] = req.body[field];
    }
  });
  // New address -> must be re-verified before automation emails it
  if (lead.email !== previousEmail) {
    lead.emailStatus = 'unknown';
    lead.emailCheckedAt = null;
  }

  await lead.save();
  res.json({ success: true, data: lead });
});

// @desc    Move a lead to a different pipeline stage
// @route   PATCH /api/leads/:id/stage
// @access  Private
const updateLeadStage = asyncHandler(async (req, res) => {
  const { stage, lostReason } = req.body;
  const validStages = [
    'new',
    'contacted',
    'replied',
    'interested',
    'demo_requested',
    'converted',
    'lost',
  ];

  if (!validStages.includes(stage)) {
    res.status(400);
    throw new Error(`Stage must be one of: ${validStages.join(', ')}`);
  }

  const lead = await Lead.findOne({ _id: req.params.id, owner: req.user._id });
  if (!lead) {
    res.status(404);
    throw new Error('Lead not found');
  }

  const previousStage = lead.stage;
  lead.stage = stage;
  if (stage === 'lost' && lostReason) lead.lostReason = lostReason;

  lead.activity.push({
    type: 'stage_change',
    channel: 'system',
    direction: 'internal',
    message: `Stage changed: ${previousStage} -> ${stage}`,
    sentBy: 'user',
  });

  await lead.save();
  res.json({ success: true, data: lead });
});

// @desc    Add a note or logged message to a lead's timeline
// @route   POST /api/leads/:id/activity
// @access  Private
const addActivity = asyncHandler(async (req, res) => {
  const { type, channel, direction, message, sentBy } = req.body;

  if (!message) {
    res.status(400);
    throw new Error('Activity message is required');
  }

  const lead = await Lead.findOne({ _id: req.params.id, owner: req.user._id });
  if (!lead) {
    res.status(404);
    throw new Error('Lead not found');
  }

  lead.activity.push({
    type: type || 'note',
    channel: channel || 'manual',
    direction: direction || 'internal',
    message,
    sentBy: sentBy || 'user',
  });

  if (direction === 'outbound') {
    lead.lastContactedAt = new Date();
  }

  // A reply means the automatic follow-up sequence has done its job -
  // stop it and let the lead move forward under a human's attention.
  if (direction === 'inbound') {
    applyInboundReply(lead, 'replied');
  }

  await lead.save();
  res.status(201).json({ success: true, data: lead });
});

// @desc    Delete a lead
// @route   DELETE /api/leads/:id
// @access  Private
const deleteLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOneAndDelete({ _id: req.params.id, owner: req.user._id });

  if (!lead) {
    res.status(404);
    throw new Error('Lead not found');
  }

  res.json({ success: true, data: {} });
});

module.exports = {
  createLead,
  getLeads,
  getPipeline,
  getStats,
  getLead,
  updateLead,
  updateLeadStage,
  addActivity,
  deleteLead,
};
