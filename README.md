# AI CRM — Phase 1–6

The foundation of the AI-powered CRM + growth engine:
- **Phase 1**: lead pipeline, auth, activity timeline
- **Phase 2**: AI-drafted outreach (Claude), auto-send over WhatsApp/Email,
  and a daily follow-up scheduler that stops the moment a lead actually replies
- **Phase 3**: Content Agent - AI writes posts from your brand profile,
  publishes/schedules to Facebook + Instagram (LinkedIn = one-click copy),
  can run daily on autopilot, and learns from your best-performing posts
- **Phase 4**: Unified Inbox - Instagram/Facebook DMs + comments and WhatsApp
  messages in one place; AI turns interested people into leads automatically,
  moves existing leads forward from what they say, alerts you on demo
  requests, and you reply from the CRM
- **Phase 5**: Lead Finder - search Google for businesses by type + area,
  ranked by how much they need you (no website first), one click into the pipeline
- **Phase 6**: runs itself daily - Auto-Finder (~50 leads/day, any country,
  rotating areas), CSV import, auto first messages by verified cold email
  (your own mailbox) + WhatsApp templates within daily limits, a Today page
  with the Instagram/Facebook send list, one-click unsubscribe and
  do-not-contact everywhere

## Folders
- `backend/` — Node.js + Express + MongoDB API (see `backend/README.md`)
- `frontend/` — Next.js + Tailwind dashboard (see `frontend/README.md`)

## Fastest way to get this running

1. **Database**: Create a free MongoDB Atlas cluster (M0) → get the connection string.
2. **Backend**:
   ```bash
   cd backend
   npm install
   cp .env.example .env   # paste your MONGO_URI, set a JWT_SECRET
   npm run dev
   ```
3. **Frontend** (in a new terminal):
   ```bash
   cd frontend
   npm install
   cp .env.local.example .env.local
   npm run dev
   ```
4. Open `http://localhost:3000` → Create account → start adding leads.

## Your daily routine (~15 minutes)
1. Open **Today** - the morning job has already found new leads and sent
   the first emails / WhatsApp messages.
2. Work the Instagram + Facebook send lists: Draft → Copy & open → paste in
   the app → Mark sent (Meta doesn't let bots cold-DM, so this part is yours).
3. Open **Inbox** - reply to anyone who answered, book demos.

## What you can do
- Sign up / log in
- Add leads manually (name, business, phone, email, source)
- Drag leads across the pipeline: New → Contacted → Replied → Interested →
  Demo Requested → Converted / Lost
- Click into a lead → **AI Outreach** panel → pick a channel, get a
  personalized draft from Claude, edit it, send:
  - WhatsApp + Email actually send (once you've added those API keys)
  - Instagram/Facebook/LinkedIn get drafted and logged, you copy-paste and send by hand
- If there's no reply, the daily scheduler automatically follows up 3 times
  (3 / 5 / 7 days apart) using AI-written messages, then stops and flags the
  lead for you
- The moment you log a reply from the lead, auto follow-up stops immediately
  — it never talks over a real conversation
- See stats: total leads, conversion rate, follow-ups due today
- **Content** tab: fill in brand settings once → Generate → edit → add an
  image URL → Publish now / Schedule / Next slot. Turn on daily auto-posts
  once you're happy with the quality
- **Inbox** tab: every DM/comment lands here with an AI label ("Wants demo",
  "Interested"...). Hot ones are already leads. Reply by hand or with "Draft
  with AI". Before Meta is connected, use "Send a test message" to try it
- **Finder** tab: pick a business type + area → Find → tick the high-score
  ones (green, "No website") → "Find contacts" for the ones with a site
  (pulls email / Instagram / WhatsApp from their own website) → Add to
  pipeline → open each lead → AI Outreach

## The full loop
**Outbound:** Finder pulls businesses without websites → you import the best
→ AI writes a personal first message → follow-ups if they go quiet.
**Inbound:** Content Agent posts daily → people comment/DM → Inbox catches
it and makes them a lead.
**Both meet in the pipeline:** replies land in the Inbox, AI moves the stage
→ demo requested → you get an email → you build the demo → converted.

## Hosting for ₹0 to start
Backend on Render free + UptimeRobot pinging `/api/health` every 5 min (keeps
it awake) + cron-job.org calling the secret job URLs (runs the daily work
even after a sleep/restart). Frontend on Vercel, database on MongoDB Atlas
M0. Step-by-step in `backend/README.md` → "Running free".

## Keys you'll need (add one at a time, test each by hand)
| For | Env vars | Cost |
|---|---|---|
| AI messages + posts | `ANTHROPIC_API_KEY` | pay-as-you-go, a few $/month at this volume |
| Finding businesses | `GOOGLE_PLACES_API_KEY` | free up to ~1,000 searches/month (capped at 900) |
| Cold email | `COLD_EMAIL_SMTP_*`, `COLD_EMAIL_FROM`, `COLD_EMAIL_POSTAL_ADDRESS` | paid mailbox - Zoho Mail or Google Workspace (check current pricing) |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, approved templates | Meta charges per marketing template message (check current rate for your country) |
| FB/IG posting + inbox | `META_*` (see backend README) | free |
| Alerts to you | `RESEND_API_KEY` | free tier |
| Daily jobs | `CRON_SECRET` | free (cron-job.org) |

Full list with explanations: `backend/.env.example`.

## Tested
Unit tests for every phase, an 85-check end-to-end run of the real backend
(stand-ins for Claude, Google, Meta, a website and a mailbox) and a 25-check
browser walkthrough on desktop + phone. Details in the two folder READMEs.
Real accounts still need a one-time manual test with your own keys.

## What's next
1. **Multi-business mode** — only if you start running this for clients
2. **LinkedIn** — stays draft-only (no safe auto-post/auto-DM API for
   personal profiles)

Each phase is an addition on top of the same `Lead` model — nothing here
needs to be rebuilt.
