# AI CRM — Backend (Phase 1–6)

Node.js + Express + MongoDB backend. Phase 1 is the CRM core (auth + leads +
pipeline + stats). Phase 2 adds the Outreach Agent: AI-drafted messages,
automatic sending over WhatsApp/Email, and a daily follow-up scheduler.
Phase 3 adds the Content Agent: AI-written social posts from your brand
profile, publishing to Facebook + Instagram (LinkedIn = copy-paste), a
scheduler, daily auto-generation and likes/comments tracking that feeds back
into what the AI writes next. Phase 4 adds the Unified Inbox: Instagram +
Facebook DMs and comments and WhatsApp messages arrive via Meta webhooks, AI
reads each one, creates or updates the lead automatically (including jumping
straight to "Interested" / "Demo Requested"), emails you about hot ones, and
lets you reply from the CRM. Phase 5 adds the Lead Finder: search Google
(official Places API) for local businesses, rank them by how much they need
you (no website = top), and import the best ones into the pipeline.
Phase 6 makes it run by itself every day: the Auto-Finder brings in ~50
fresh leads (any country, rotating areas), CSV import for lists you already
have, daily auto-outreach (verified cold email from your own mailbox +
WhatsApp templates) within safe daily limits, an Instagram/Facebook send
list for the messages Meta doesn't allow bots to send, one-click
unsubscribe, and do-not-contact that every channel respects.

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- `MONGO_URI` — from MongoDB Atlas (Database > Connect > Drivers). Free M0 cluster is enough for now.
- `JWT_SECRET` — any long random string (e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `CLIENT_URL` — your frontend URL (http://localhost:3000 for local dev)

**Phase 2 (Outreach Agent) — all optional, add when you're ready to test them:**
- `ANTHROPIC_API_KEY` — from console.anthropic.com. Needed for AI-drafted messages.
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — from resend.com. Only for alert emails to **you** (demo requests etc.). Resend doesn't allow cold outreach, so emails to leads go through your own mailbox (`COLD_EMAIL_SMTP_*`, see "Daily outreach engine").
- `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` — from Meta for Developers, your App's WhatsApp product. Needed to send WhatsApp messages.
- `ENABLE_AUTO_FOLLOWUP` — leave `false` until the above are set up and tested manually. Flip to `true` to turn on the daily automatic follow-up sweep.

You don't need any of these to run Phase 1 (leads, pipeline, login). The
server won't crash without them — outreach endpoints will just return a
clear error ("ANTHROPIC_API_KEY is not set...") until you add the keys.

Run it:

```bash
npm run dev     # local development, auto-restarts on changes
npm start       # production
```

Server starts on `http://localhost:5000`. Health check: `GET /api/health`.

## API Reference

### Auth
| Method | Route | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password, businessName }` | Creates account, returns JWT |
| POST | `/api/auth/login` | `{ email, password }` | Returns JWT |
| GET | `/api/auth/me` | — | Requires `Authorization: Bearer <token>` |

### Leads
All routes below require `Authorization: Bearer <token>`.

| Method | Route | Body / Query | Notes |
|---|---|---|---|
| POST | `/api/leads` | `{ name, businessName, phone, email, instagramHandle, source, stage, dealValue, tags }` | Create a lead |
| GET | `/api/leads?stage=&source=&search=` | — | List/filter leads |
| GET | `/api/leads/pipeline` | — | Leads grouped by stage — feeds the kanban board |
| GET | `/api/leads/stats` | — | Dashboard numbers: total, per-stage counts, conversion rate, follow-ups due |
| GET | `/api/leads/:id` | — | Single lead with full activity timeline |
| PUT | `/api/leads/:id` | any updatable field | Edit lead details |
| PATCH | `/api/leads/:id/stage` | `{ stage, lostReason? }` | Move lead through pipeline |
| POST | `/api/leads/:id/activity` | `{ type, channel, direction, message, sentBy }` | Log a note or message (this is the hook Phase 2's outreach agent will call) |
| DELETE | `/api/leads/:id` | — | Remove a lead |

### Pipeline stages
`new → contacted → replied → interested → demo_requested → converted / lost`

### Outreach (Phase 2)
All routes below require `Authorization: Bearer <token>`.

| Method | Route | Body | Notes |
|---|---|---|---|
| POST | `/api/outreach/:id/draft` | `{ channel, type }` | `channel`: whatsapp\|email\|instagram\|facebook\|linkedin. `type`: first_touch\|follow_up. Returns an AI-drafted message - does NOT send or log anything |
| POST | `/api/outreach/:id/send` | `{ channel, message, type, templateName?, templateParams? }` | Sends the message (WhatsApp/Email are sent for real via API; other channels are logged only - copy-paste and send by hand). Logs the activity, advances stage if it was "new", and schedules the next automatic follow-up |

**How the follow-up sequence works:**
1. First outreach sent (draft → send) → lead moves to "contacted", `nextFollowUpAt` set 3 days out.
2. If no reply by then, the daily scheduler (`ENABLE_AUTO_FOLLOWUP=true`) sends a follow-up automatically (5 days later, then 7 days), incrementing `followUpCount`.
3. After 3 follow-ups with no reply, `autoFollowUp` turns off and the lead needs manual attention (logged as a system note).
4. As soon as you log an **inbound** activity (`POST /api/leads/:id/activity` with `direction: "inbound"`) — meaning the lead actually replied — `autoFollowUp` stops immediately and the stage moves to "replied", so the bot never talks over a real reply.
5. Tune the cap/intervals in `src/config/outreachConfig.js`.

**WhatsApp caveat:** Meta only allows free-form text messages within a
24-hour window after the lead has messaged *you* first. A cold first-touch
message needs an approved message template (`templateName` + `templateParams`
in the `/send` body) - submit one in Meta Business Manager before relying on
WhatsApp for first contact. Follow-ups to someone who already replied within
24h can use plain text.

### Daily outreach engine (Phase 6)

| Method | Route | Notes |
|---|---|---|
| GET | `/api/outreach/today` | Today's numbers: sent vs limit per channel, new leads today, leads still waiting for a first message, and the Instagram/Facebook send lists |
| POST | `/api/outreach/run-daily` | Run auto-outreach now (same as the `outreach` cron job) |
| GET/POST | `/api/unsubscribe/:token` | Public. The link in every cold email; POST = one-click unsubscribe from Gmail/Outlook. Sets `doNotContact` |

**What happens every morning (`/api/cron/daily`):**
1. **Prospecting** - the Auto-Finder runs your saved searches (business type
   + list of areas + country). It searches the next area in the list,
   finds contacts on their websites, and keeps going to the next area until
   it has enough good prospects (score ≥ `AUTO_FINDER_MIN_SCORE`), then
   imports up to `AUTO_FINDER_DAILY_TARGET` (default 50) as leads. Never
   more than `AUTO_FINDER_MAX_CALLS_PER_RUN` Google calls per run, and the
   monthly cap still applies. Next day starts from the next area.
2. **Outreach** - every lead still in "New" that was never contacted gets
   one first message: a **verified email** if it has one, otherwise a
   **WhatsApp template**. Stops at `COLD_EMAIL_DAILY_LIMIT` (25) and
   `WHATSAPP_DAILY_LIMIT` (20). Leads with neither are left for the
   Instagram/Facebook send list.
3. **Follow-ups** (3 / 5 / 7 days) - email follow-ups are AI-written replies
   ("Re: ..."); WhatsApp follow-ups use `WHATSAPP_FOLLOWUP_TEMPLATE` unless the
   lead messaged you within 24h (then plain text). Instagram/Facebook/LinkedIn
   follow-ups are saved as drafts for you.
4. Daily AI post + likes/comments sync (Phase 3).

**Cold email (your own mailbox)** - `src/services/coldEmailService.js`:
- Sends through SMTP with nodemailer: Zoho Mail (`smtp.zoho.in`, 465) or
  Google Workspace (`smtp.gmail.com`, 465, app password). Use a separate
  domain/mailbox for outreach if you can, and warm it up (start at 10/day).
- Every email gets a plain-text body, your postal address
  (`COLD_EMAIL_POSTAL_ADDRESS`), an unsubscribe link and
  `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` headers.
- **Verification** before sending (`src/services/emailVerifier.js`): syntax,
  disposable domains, the domain's MX records (free, built in); optionally
  ZeroBounce (`EMAIL_VERIFY_PROVIDER=zerobounce`). Invalid → never emailed
  (falls back to WhatsApp). "Risky" (catch-all/unknown) → skipped by the
  automatic run, you can still send by hand. Result saved as `emailStatus`.

**WhatsApp** - Meta only allows free text within 24h after the lead
messaged you. Everything else uses approved templates:
- `WHATSAPP_OUTREACH_TEMPLATE` (first message) and
  `WHATSAPP_FOLLOWUP_TEMPLATE`, language `WHATSAPP_TEMPLATE_LANG` (e.g.
  `en`). If `WHATSAPP_TEMPLATE_USES_NAME=true` the business name is sent as
  `{{1}}`. Create them in WhatsApp Manager → Message templates, category
  **Marketing**. Without a template, WhatsApp is skipped (never sent as free text).
- A new WhatsApp Business number can message 250 new people/day; keep it
  lower while it builds a quality rating.

**Instagram / Facebook** - Meta doesn't allow automated DMs to people who
never messaged you, so the Today page gives you a send list (up to
`INSTAGRAM_DAILY_TARGET` / `FACEBOOK_DAILY_TARGET`, default 20 each): AI
draft → Copy & open profile → paste → **Mark sent**. Once they reply, the
Inbox takes over automatically.

**Opt-out** - "not interested" in any reply, the unsubscribe link, or the
toggle on the lead page sets `doNotContact`. Every send path (manual,
automatic, follow-ups) refuses to message those leads (409).

**Limits** are counted per calendar day in your timezone
(`APP_TZ_OFFSET_MINUTES`, 330 = India) and include messages you send by hand.

**Laws, briefly** - US (CAN-SPAM): real address + working unsubscribe =
OK. UK/EU: B2B cold email to business addresses is generally OK with an
easy opt-out, stricter for sole traders. Canada (CASL): needs consent - the
Auto-Finder warns when you pick Canada. India: no specific cold-email law,
but WhatsApp spam reports get numbers banned. Not legal advice.

### Content Agent (Phase 3)
All routes require `Authorization: Bearer <token>`.

| Method | Route | Body | Notes |
|---|---|---|---|
| GET / PUT | `/api/content/brand` | brand fields | Brand profile the AI writes from + automation settings (`autoGenerate`, `autoPublish`, `postingHour`) |
| POST | `/api/content/generate` | `{ topic?, platforms? }` | AI writes a post (caption, hashtags, image idea) and saves it as a draft |
| GET | `/api/content?status=` | — | List posts |
| POST | `/api/content` | post fields | Create a post by hand |
| PUT / DELETE | `/api/content/:id` | post fields | Edit (not after publishing) / delete from CRM |
| POST | `/api/content/:id/schedule` | `{ scheduledAt? }` | No date = your next posting slot |
| POST | `/api/content/:id/unschedule` | — | Back to draft |
| POST | `/api/content/:id/publish` | — | Publish now. On a partly-failed post it retries only the failed platforms - never double-posts |
| POST | `/api/content/:id/metrics` | — | Refresh likes/comments |

**How it runs (with `ENABLE_CONTENT_AGENT=true`):**
- Every 10 min: publishes scheduled posts that are due (each post is claimed atomically, so it can't go out twice).
- Daily 08:30: for brands with `autoGenerate` on, writes one new post. With `autoPublish` on it's scheduled for your posting hour - except posts targeting Instagram without an image, which stay drafts (the AI gives an image idea; you make the image and paste its public URL).
- Daily: syncs likes/comments for the last 14 days. The AI is shown your top 5 posts by engagement (likes + 2x comments) and your last 15 topics, so it learns what works and doesn't repeat itself.

**Getting Meta credentials (one-time):**
1. Facebook Page + Instagram Business/Creator account, linked to each other.
2. developers.facebook.com → create an App (Business type) → add Facebook Login for Business + Instagram Graph API.
3. Graph API Explorer → User token with `pages_show_list, pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish` → exchange for a long-lived token → call `/me/accounts` to get your **Page id** and **Page access token** (long-lived Page tokens don't expire).
4. Call `/{page-id}?fields=instagram_business_account` → that id is `META_IG_USER_ID`.
5. Put the three values in `.env`, make a Facebook-only test post on the Content page, hit "Publish now". Once that works, add Instagram, then set `ENABLE_CONTENT_AGENT=true`.

Instagram image URLs must be public JPG/PNG links (Cloudinary, Imgur, etc.). Google Drive share links don't work.

### Unified Inbox (Phase 4)

| Method | Route | Notes |
|---|---|---|
| GET | `/api/webhooks/meta` | Public. Meta's verify handshake (checks `META_WEBHOOK_VERIFY_TOKEN`) |
| POST | `/api/webhooks/meta` | Public, **signature-checked** with `META_APP_SECRET`. Receives FB Page DMs + comments, Instagram DMs + comments, WhatsApp messages |
| GET | `/api/inbox/conversations?filter=open\|unread\|leads\|archived\|all&platform=` | Conversation list |
| GET | `/api/inbox/unread-count` | Navbar badge |
| GET | `/api/inbox/conversations/:id` | Messages (marks read) |
| POST | `/api/inbox/conversations/:id/draft` | AI reply draft (not sent) |
| POST | `/api/inbox/conversations/:id/reply` | `{ text }` - sends on the right platform (DM, public comment reply, or WhatsApp) |
| POST | `/api/inbox/conversations/:id/lead` | Make this conversation a lead by hand |
| PATCH | `/api/inbox/conversations/:id` | `{ status: "archived" \| "open" }` |
| POST | `/api/inbox/simulate` | Dev only: fake an incoming message to try everything without Meta |

**What happens to every incoming message:**
1. Duplicates dropped (Meta retries webhooks) - each message id is stored once.
2. Added to that person's conversation (one per person, per platform, per DMs/comments).
3. AI (Haiku) classifies it: demo_requested / interested / question / not_interested / spam / casual. No API key or AI down → a Hinglish-aware keyword fallback.
4. **Already a lead** (matched by Instagram/Facebook id, or WhatsApp number vs. the lead's phone): message goes on their timeline, automatic follow-ups stop, stage moves forward (e.g. contacted → interested) - never backwards. "Not interested" stops follow-ups and suggests marking Lost.
5. **Not a lead yet**: if the AI thinks they could become a client, a lead is created (at Interested / Demo Requested when that's what they asked). Casual comments like "nice post 🔥" stay in the inbox only - one click makes them a lead if you disagree.
6. New lead or demo request → email alert to you (`NOTIFY_EMAIL`, needs Resend).

**Replies** respect Meta's rules: DMs and WhatsApp only within 24h of their last message (the API returns a clear error otherwise); comment replies post publicly under their latest comment.

**Connecting Meta webhooks (one-time):**
1. Deploy the backend (webhooks need a public HTTPS URL - Render works; for local testing use `ngrok http 5000`).
2. Meta App → Webhooks: callback URL `https://YOUR-BACKEND/api/webhooks/meta`, verify token = your `META_WEBHOOK_VERIFY_TOKEN`.
3. Subscribe: **Page** → `messages`, `feed`; **Instagram** → `messages`, `comments`; **WhatsApp Business Account** → `messages`.
4. Add permissions to your token: `pages_messaging`, `instagram_manage_messages`, `instagram_manage_comments`, `pages_manage_engagement` (plus the Phase 3 ones), and subscribe your Page to the app (`POST /{page-id}/subscribed_apps`).
5. Set `META_APP_SECRET`. Send your Page a DM from another account - it should show up in the Inbox within seconds.

While your Meta App is in Development mode, only people with a role on the app (admins/testers) trigger webhooks. Switch it to Live (needs App Review for the messaging permissions) to receive messages from everyone.

### Lead Finder (Phase 5)

| Method | Route | Notes |
|---|---|---|
| POST | `/api/finder/search` | `{ query, pages?, regionCode? }` - e.g. "beauty parlour in Salt Lake Kolkata", 1-3 pages of 20; `regionCode` = 2-letter country (IN, US, GB...) |
| GET | `/api/finder/prospects?status=new\|imported\|dismissed\|all&noWebsite=true&minScore=50&search=` | Saved results |
| GET | `/api/finder/usage` | Google calls used this month vs your cap |
| POST | `/api/finder/import` | `{ ids: [...] }` - create leads (max 100 per call) |
| POST | `/api/finder/enrich` | `{ ids: [...] }` (max 25) - "Find contacts": scrape each business's own website |
| POST | `/api/finder/prospects/:id/dismiss` / `restore` | Hide / un-hide |
| POST | `/api/finder/import-csv` | `{ rows: [...] }` (max 2000) - bring your own list. Columns (any case): name/business, phone, email, website, instagram, facebook, address, category/type, city, rating, reviews. Rows are deduped and scored like Google results |
| GET | `/api/finder/auto` | Auto-Finder status: saved searches, today's imports vs target, settings |
| POST | `/api/finder/auto/searches` | `{ businessType, areas: [...], country }` - e.g. "dentist", ["Austin TX","Dallas TX"], "US" |
| PUT / DELETE | `/api/finder/auto/searches/:id` | Edit (incl. `active`) / remove |
| POST | `/api/finder/auto/run` | Run the Auto-Finder now |

**Prospect score (0-100)**, deterministic so you can see why:
no website +40 (or social/listing page only +30) · phone listed +15 ·
10-200 reviews +20 (200+ +10, 1-9 +5) · rating 4★+ +15 · closed = 0.

**Rules:** repeat searches never duplicate (Google place id), dismissed stays
dismissed, businesses whose phone already matches a lead are marked imported
and linked, imports are idempotent. Imported leads get `source: google_maps`,
phone, address, website, category tag and a timeline note with rating,
Maps link and score reasons - and the AI Outreach draft now uses website
status ("no website" → natural reason to reach out; has one → pitch
improvements) without pretending to be a customer.

**Find contacts (website scraper)** - `src/services/websiteScraper.js`,
built on **cheerio** (HTML parsing) + **robots-parser**:
- Reads only the business's **own website** (the one Google lists) - never
  Google Maps, Justdial or other directories.
- Homepage + up to 2 contact/about pages, 10s timeout, 2 MB cap, a short
  pause between pages, honest User-Agent, and it skips sites whose
  robots.txt says no.
- Extracts: emails (mailto links, plain text, and Cloudflare-hidden
  addresses; junk like example.com/image names filtered), extra phone
  numbers, and Instagram / Facebook / WhatsApp / LinkedIn / YouTube profile
  links (share buttons and single posts ignored).
- When Google's "website" is itself an Instagram/Facebook/WhatsApp link, the
  social profile is recorded at search time - no scraping needed.
- Import copies the first email and the Instagram handle onto the lead (so
  Email and Instagram outreach work straight away). Enriching a prospect
  that's already a lead fills in the lead's missing email/Instagram.
- JavaScript-only sites (some Wix builders) may show nothing to a simple
  HTML reader - those just come back as "No contacts found".

**Cost:** uses Google Places API (New) Text Search with phone + website +
rating fields (Enterprise SKU). Each call returns up to 20 businesses.
Google gives a monthly free allowance per SKU (1,000 Enterprise calls at
the time of writing - check your region's pricing page); after that it's
roughly $35 per 1,000 calls. `PLACES_MONTHLY_REQUEST_LIMIT` (default 900)
hard-stops searches before you'd be charged.

**Setup:** Google Cloud Console → new project → enable **Places API (New)**
→ enable billing (card needed, free allowance still applies) → Credentials →
API key → restrict it to Places API → put it in `GOOGLE_PLACES_API_KEY`.

**Messaging these businesses:** they never contacted you, so keep it
respectful - one personalized message, honour "not interested" (the Inbox
already stops follow-ups when someone says it), and for cold WhatsApp use an
approved template (Meta requires it and blocks numbers that get reported as spam).

## Running free: Render free + UptimeRobot + cron-job.org

Render's free web service sleeps after 15 minutes without traffic, gets
750 free hours/month per workspace (enough for ONE always-on service), and
may be restarted at any time. So the built-in timers (node-cron) can miss a
run. Instead, let free external services wake the server and trigger jobs:

**1. Keep it awake - UptimeRobot (free)**
- New monitor → HTTP(s) → URL `https://YOUR-BACKEND.onrender.com/api/health`
- Interval: 5 minutes

**2. Trigger jobs - cron-job.org (free)**
Set `CRON_SECRET` in Render's environment variables first, then create:

| Job | URL | Schedule (timezone Asia/Kolkata) |
|---|---|---|
| Daily bundle: find leads → first messages → follow-ups → AI post → likes/comments sync | `https://YOUR-BACKEND.onrender.com/api/cron/daily?key=YOUR_CRON_SECRET` | Every day 09:30 |
| Publish scheduled posts | `https://YOUR-BACKEND.onrender.com/api/cron/publish?key=YOUR_CRON_SECRET` | Every 15 minutes |

Individual jobs also exist: `prospecting`, `outreach`, `followups`, `daily-content`, `metrics`.
(Want messages spread through the day? Add `outreach` again at 14:00 - it
never goes over the daily limits.)

**3. Check it's working**
Open `https://YOUR-BACKEND.onrender.com/api/cron/status?key=YOUR_CRON_SECRET` -
shows each job's last run (ok/failed, when, result). Add `&wait=1` to any job
URL to run it in the browser and see the result immediately.

**How it behaves**
- Calls reply `202` right away and the job runs in the background (cron
  services give up after ~30s; AI jobs can take longer). Outcome is in
  `/api/cron/status`.
- The same job never runs twice at once (409 if you try) - also true if the
  built-in timers are on too, so both modes can be enabled safely.
- Running a job twice in a day is harmless: follow-ups only go to leads that
  are due, and the daily AI post is created once per day.
- Wrong/missing key → 401. `CRON_SECRET` empty → the URLs are switched off.
  Rate-limited to 30 calls/minute. The key is masked in request logs.
- Leave `ENABLE_AUTO_FOLLOWUP` / `ENABLE_CONTENT_AGENT` as `false` on free
  hosting (external triggers don't need them). On a paid always-on instance
  you can switch to the built-in timers instead.

Render itself says free instances aren't meant for production - fine to
start; move to Starter ($7/month) when this is bringing in clients.

## What's already verified
- Model validation (required fields, enum stages, Phase 2 fields) — tested
- Password hashing + comparison (bcrypt) — tested
- JWT generation + verification — tested
- Full route wiring (Express app loads clean, no missing imports) — tested
- Outreach controller logic (draft vs send, auto-send channels vs manual-log
  channels, stage auto-advance, follow-up scheduling math, cap enforcement) —
  tested with mocked AI/email/WhatsApp services, no real API keys needed
- Follow-up scheduler sweep (finds due leads, sends/drafts, reschedules,
  stops at the cap) — tested with mocked services
- Inbound-reply handling (pauses auto follow-up, advances stage) — tested
- Content Agent (58 checks, Meta + Claude mocked): models, posting-time math
  across IST midnight, Facebook text vs photo publishing, Instagram
  container → wait → publish flow and errors, partial failures with
  no-duplicate retries, LinkedIn manual handling, metrics sync, AI JSON
  parsing, publish sweep, daily generation rules, and controller guards
- Unified Inbox (71 checks): webhook signature verification over raw bytes
  (forged/missing/tampered rejected), Meta verify handshake, payload parsing
  for all 5 sources (echoes, read receipts, statuses, our own comments,
  edits/reactions dropped), duplicate webhook deliveries ignored, lead
  matching by platform id and by phone in any format, auto lead creation
  vs. casual comments, stage advance rules (never backwards, never out of
  converted/lost), not-interested handling, owner alerts, replies on every
  platform, 24h window, manual lead creation, AI classify + fallback on
  outage, AI reply drafts. Earlier phases re-run - all passing.
- Lead Finder (31 checks, Google mocked): scoring rules, Places request
  (endpoint, key, field mask, India bias, 20/page, pagination stops when
  Google runs out), normalization, save + sort, no duplicates on repeat
  search, dismissed preserved, existing-lead detection by phone, monthly cap
  (blocks before calling Google, trims pages to remaining quota), import
  (lead fields, timeline note, idempotent, links instead of duplicating,
  other users' ids ignored), AI website context. All earlier tests re-run.
- Contact scraper (29 checks, web mocked): email/phone/social extraction
  incl. Cloudflare-protected emails and junk filtering, share/post links
  ignored, contact-page discovery limited to the same site, 3-page cap,
  robots.txt respected (disallowed pages never fetched), social links never
  crawled, clear errors for dead/non-HTML sites, enrichment counts, phone
  de-duplication, email + Instagram flowing into imported and existing leads.
- Cron-trigger URLs (18 checks, real HTTP): disabled without CRON_SECRET,
  401 on missing/wrong key, key via ?key / x-cron-secret / Bearer, unknown
  job 404, wait=1 result vs 202 background run, overlap lock (409) shared
  with the internal timers, run history ok/failed, "daily" bundle continues
  past a failing step, POST accepted, key masked in logs.

- Phase 6 unit tests: email verifier, cold email headers/footer, daily
  limits + timezone, outreach rules (opt-out, invalid/risky email, template
  vs 24h text), daily outreach picking, Auto-Finder area rotation + target,
  CSV parsing - all passing, earlier phases re-run.
- **Full end-to-end run (85 checks)** of the real server against a
  Mongo-compatible database (FerretDB) with stand-ins for Claude, Google
  Places, Meta Graph, a business website and an SMTP mailbox: sign up,
  leads, content publish to FB + IG + metrics, Google search + scoring +
  dedupe, website contacts, CSV import, Auto-Finder stopping at its target,
  Today page, auto-outreach stopping at the email/WhatsApp limits, real
  emails received with unsubscribe link + headers, invalid email → WhatsApp,
  template parameters, 429 on limits, IG "mark sent", unsubscribe
  (GET + one-click POST) → blocked everywhere, follow-ups via cron ("Re:"
  email, follow-up template), signed webhooks, IG DM → demo lead + alert,
  duplicates ignored, AI reply, WhatsApp reply → interested, free text
  inside 24h, "not interested" → do not contact, casual comment ignored,
  cron daily bundle + status. Server log clean.
- **Browser walkthrough (25 checks, Playwright)** of the real frontend on
  that server, desktop + phone width.

Not tested against your real accounts (Anthropic, Google, Meta, your
mailbox) - those need your keys. Test each once by hand from the lead page
before turning on the daily cron.

## Deploying
- **Render** (recommended, free tier available): New Web Service → connect
  this repo/folder → Build command `npm install` → Start command `npm start`
  → add the same env vars from `.env`.
- Don't deploy this on Vercel — it's a persistent Express server (needed for
  webhooks and cron jobs in later phases), not serverless functions.

## Next (not built yet)
1. Multi-business mode — separate Meta/WhatsApp credentials per account, if
   you ever run this for clients
2. LinkedIn — draft-only forever (no safe auto-post/auto-DM API for personal profiles)
