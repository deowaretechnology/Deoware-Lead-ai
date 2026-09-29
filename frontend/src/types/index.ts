export type LeadStage =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'demo_requested'
  | 'converted'
  | 'lost';

export type LeadSource =
  | 'manual'
  | 'instagram_dm'
  | 'instagram_comment'
  | 'whatsapp'
  | 'facebook'
  | 'facebook_comment'
  | 'google_maps'
  | 'linkedin'
  | 'website'
  | 'referral'
  | 'other';

export interface Activity {
  _id: string;
  type: 'note' | 'message' | 'stage_change' | 'system';
  channel: 'whatsapp' | 'email' | 'instagram' | 'facebook' | 'linkedin' | 'manual' | 'system';
  direction: 'outbound' | 'inbound' | 'internal';
  message: string;
  sentBy: string;
  createdAt: string;
}

export interface Lead {
  _id: string;
  owner: string;
  name: string;
  businessName: string;
  phone: string;
  email: string;
  instagramHandle: string;
  website: string;
  address: string;
  facebookUrl: string;
  doNotContact: boolean;
  emailStatus: 'unknown' | 'valid' | 'risky' | 'invalid';
  contactedChannels: string[];
  source: LeadSource;
  stage: LeadStage;
  dealValue: number;
  tags: string[];
  activity: Activity[];
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  lastContactedChannel: Activity['channel'] | null;
  followUpCount: number;
  autoFollowUp: boolean;
  lostReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  businessName: string;
  role: 'owner' | 'agent';
}

export interface Stats {
  totalLeads: number;
  stageCounts: Record<string, number>;
  conversionRate: number;
  followUpsDueToday: number;
}

export const STAGES: { key: LeadStage; label: string; color: string }[] = [
  { key: 'new', label: 'New', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  { key: 'contacted', label: 'Contacted', color: 'bg-blue-50 text-blue-700 border-blue-300' },
  { key: 'replied', label: 'Replied', color: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
  { key: 'interested', label: 'Interested', color: 'bg-amber-50 text-amber-700 border-amber-300' },
  { key: 'demo_requested', label: 'Demo Requested', color: 'bg-purple-50 text-purple-700 border-purple-300' },
  { key: 'converted', label: 'Converted', color: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  { key: 'lost', label: 'Lost', color: 'bg-rose-50 text-rose-700 border-rose-300' },
];

export const SOURCE_LABELS: Record<LeadSource, string> = {
  manual: 'Manual',
  instagram_dm: 'Instagram DM',
  instagram_comment: 'Instagram comment',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  facebook_comment: 'Facebook comment',
  google_maps: 'Google Maps',
  linkedin: 'LinkedIn',
  website: 'Website',
  referral: 'Referral',
  other: 'Other',
};

// ---------- Content Agent (Phase 3) ----------
export type Platform = 'facebook' | 'instagram' | 'linkedin';

export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partially_published'
  | 'failed';

export interface PlatformResult {
  status: 'pending' | 'published' | 'failed' | 'manual';
  postId: string;
  error: string;
  publishedAt: string | null;
  likes: number;
  comments: number;
}

export interface Post {
  _id: string;
  topic: string;
  pillar: string;
  caption: string;
  hashtags: string[];
  imageUrl: string;
  imagePrompt: string;
  platforms: Platform[];
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  results: Record<Platform, PlatformResult>;
  generatedBy: 'ai' | 'user';
  metricsUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrandProfile {
  _id: string;
  brandName: string;
  description: string;
  targetAudience: string;
  tone: string;
  language: string;
  contentPillars: string[];
  callToAction: string;
  defaultPlatforms: Platform[];
  autoGenerate: boolean;
  autoPublish: boolean;
  postingHour: number;
  timezoneOffsetMinutes: number;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

export const POST_STATUS_STYLES: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-50 text-blue-700' },
  publishing: { label: 'Publishing…', className: 'bg-amber-50 text-amber-700' },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-700' },
  partially_published: { label: 'Partly published', className: 'bg-amber-50 text-amber-700' },
  failed: { label: 'Failed', className: 'bg-rose-50 text-rose-700' },
};

// ---------- Unified Inbox (Phase 4) ----------
export type InboxPlatform = 'facebook' | 'instagram' | 'whatsapp';

export type Intent =
  | 'demo_requested'
  | 'interested'
  | 'question'
  | 'not_interested'
  | 'spam'
  | 'casual'
  | 'unknown';

export interface Conversation {
  _id: string;
  platform: InboxPlatform;
  channelType: 'dm' | 'comment';
  externalUserId: string;
  name: string;
  username: string;
  lead: { _id: string; name: string; stage: LeadStage } | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastInboundAt: string | null;
  unreadCount: number;
  intent: Intent;
  intentSummary: string;
  status: 'open' | 'archived';
}

export interface InboxMessage {
  _id: string;
  direction: 'inbound' | 'outbound';
  text: string;
  sentBy: string;
  createdAt: string;
}

export const INBOX_PLATFORM_STYLES: Record<InboxPlatform, { label: string; short: string; className: string }> = {
  instagram: { label: 'Instagram', short: 'IG', className: 'bg-pink-50 text-pink-700' },
  facebook: { label: 'Facebook', short: 'FB', className: 'bg-blue-50 text-blue-700' },
  whatsapp: { label: 'WhatsApp', short: 'WA', className: 'bg-emerald-50 text-emerald-700' },
};

export const INTENT_STYLES: Record<Intent, { label: string; className: string } | null> = {
  demo_requested: { label: 'Wants demo', className: 'bg-purple-100 text-purple-800' },
  interested: { label: 'Interested', className: 'bg-amber-100 text-amber-800' },
  question: { label: 'Question', className: 'bg-slate-100 text-slate-700' },
  not_interested: { label: 'Not interested', className: 'bg-rose-50 text-rose-700' },
  spam: { label: 'Spam', className: 'bg-slate-100 text-slate-400' },
  casual: null,
  unknown: null,
};

// ---------- Lead Finder (Phase 5) ----------
export interface Prospect {
  _id: string;
  placeId: string;
  name: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
  reviewCount: number;
  mapsUrl: string;
  emails: string[];
  extraPhones: string[];
  socials: { instagram: string; facebook: string; whatsapp: string; linkedin: string; youtube: string };
  enrichedAt: string | null;
  enrichError: string;
  score: number;
  scoreReasons: string[];
  searchQuery: string;
  status: 'new' | 'imported' | 'dismissed';
  lead: string | null;
  createdAt: string;
}

export interface FinderUsage {
  used: number;
  limit: number;
  remaining: number;
  month: string;
}

// ---------- Daily outreach + Auto-Finder ----------
export interface TodayLead {
  _id: string;
  name: string;
  businessName: string;
  instagramHandle: string;
  facebookUrl: string;
  tags: string[];
  address: string;
  website: string;
  draft: string;
}

export interface TodaySummary {
  limits: { email: number; whatsapp: number; instagram: number; facebook: number };
  sent: { email: number; whatsapp: number; instagram: number; facebook: number };
  ready: { email: boolean; whatsapp: boolean };
  newLeadsToday: number;
  awaitingFirstMessage: number;
  queues: { instagram: TodayLead[]; facebook: TodayLead[] };
}

export interface SavedSearch {
  _id: string;
  businessType: string;
  areas: string[];
  country: string;
  active: boolean;
  nextAreaIndex: number;
  lastRunAt: string | null;
  totalFound: number;
}

export interface AutoFinderStatus {
  settings: { dailyTarget: number; minScore: number; maxCallsPerRun: number; enrich: boolean };
  importedToday: number;
  searches: SavedSearch[];
  usage: FinderUsage;
}
