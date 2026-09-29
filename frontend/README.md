# AI CRM — Frontend

Next.js 16 + TypeScript + Tailwind dashboard for the lead pipeline. Talks to
the `backend` folder's API.

## Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local
```

Edit `.env.local` — set `NEXT_PUBLIC_API_URL` to wherever the backend is
running (e.g. `http://localhost:5000/api` locally, or your Render URL + `/api`
once deployed).

Run it:

```bash
npm run dev
```

Opens on `http://localhost:3000`. Make sure the backend is running first.

## Pages

- `/dashboard/today` — **start here every day.** Counters: new leads today,
  leads waiting for a first message, email / WhatsApp sent vs limit
  (automatic), Instagram / Facebook sent vs target (by hand). "Run
  auto-outreach now". Instagram + Facebook send lists: first message already drafted (✨ Better with AI optional) →
  Copy & open (copies the message, opens their profile) → Mark sent

- `/register`, `/login` — create an account / log in (JWT stored in a cookie)
- `/dashboard` — stat cards (total leads, conversion rate, follow-ups due)
  plus a drag-and-drop pipeline board (New → Contacted → Replied →
  Interested → Demo Requested → Converted / Lost)
- `/dashboard/leads/[id]` — a lead's full profile:
  - contact info, stage dropdown, follow-up status (count / on-off / next date)
  - **AI Outreach panel** — pick a channel + message type, click "Draft with
    AI" to get a Claude-written message, edit it, then send (WhatsApp/Email
    send for real; other channels log it for you to send by hand)
  - a form to log activity manually (notes or messages sent/received on any
    channel) — logging an **inbound** message here is what tells the backend
    the lead replied, which stops the automatic follow-up sequence
  - the full activity timeline
- `/dashboard/content` — Content Agent: brand & automation settings, AI
  "Generate" (optional topic, pick platforms), and a post list with
  Drafts/Scheduled/Published/Failed filters. Per post: edit caption,
  hashtags, image URL (with preview), copy the AI image idea, Publish now,
  Schedule (date/time or next slot), Unschedule, Retry failed, Copy for
  LinkedIn, and likes/comments per platform
- `/dashboard/inbox` — Unified Inbox: conversation list (All / Unread / Leads
  / Archived) with platform, AI intent label and unread count; thread view
  with reply box, "Draft with AI", "Make lead" / link to the lead, archive,
  and a 24-hour-window warning when a platform won't allow a reply. Polls
  every 15s. "Send a test message" fakes an incoming DM/comment (dev only)
- Navbar shows an unread badge on Inbox
- `/dashboard/finder` — Lead Finder: business type + area (quick chips for
  common types and Kolkata areas), 20/40/60 results, monthly usage bar,
  results ranked by score with website badge (No website / Social page only
  / Has website), rating, phone, address, reasons and Maps link. Tabs: To
  review / Imported / Dismissed; filters: no proper website, min score, text.
  Select many → "Find contacts" (scans their own websites for email,
  Instagram, WhatsApp, extra phones) and/or "Add to pipeline", or per row;
  found contacts show as chips; imported rows link to the lead
- Finder extras: **Daily Auto-Finder** panel (saved searches: business type
  + areas + country, on/off, Run now, today's imports vs target; warns about
  consent rules for Canada) and **Import CSV** (your own list, any common
  column names)
- Lead page shows website (or "No website"), address, email check result
  (verified / risky / invalid), Instagram + Facebook links, and an
  "Opted out" banner with "Allow contact again" when the lead unsubscribed
  or said not interested - the AI Outreach panel blocks sending for them
- On phones the menu goes on its own row so all 5 tabs fit

Dragging a card between columns calls `PATCH /api/leads/:id/stage`
immediately (optimistic UI — updates on screen instantly, syncs to the
server in the background).

## Verified
- `npx tsc --noEmit` — no type errors
- `npx eslint src` — no lint errors or warnings
- `npm run build` — production build succeeds, all routes compile
- Browser walkthrough (Playwright, 25 checks) against the real backend:
  login errors, pipeline, add lead, Today counters + draft + mark sent,
  Finder search + Auto-Finder + CSV button, Inbox AI draft → send, Content
  generate, lead page opt-out banner, every page at phone width with no
  sideways scrolling, no browser errors

## Deploying
Deploy this folder to **Vercel** (free Hobby tier is fine to start). Set the
`NEXT_PUBLIC_API_URL` environment variable in the Vercel project settings to
your deployed backend's URL.
