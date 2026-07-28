# Xerelle

Nigerian platform helping livestream personalities monetize the overwhelming
volume of fan attention they already receive — paid, prioritised chat access,
built with the same hand-coded + Cloudflare stack as Savixa.

## Stack

- **Hosting/compute:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **File storage:** Cloudflare R2 (photos, videos, ID/liveness documents)
- **Sessions:** Cloudflare KV (not yet wired up — see "Still to build" below)
- **Payments:** Paystack (subscriptions), Monnify optional alternative
- **ID verification:** not yet integrated — pick a vendor (Smile Identity /
  Youverify) and wire their API + webhook into `src/routes/models/verify.js`

## Setup

```bash
npm install

# Create the D1 database and update wrangler.toml with the real database_id
wrangler d1 create xerelle-db

# Create the R2 bucket
wrangler r2 bucket create xerelle-media

# Create the KV namespace (for sessions, once auth is wired up)
wrangler kv:namespace create SESSIONS

# Run the schema migration
npm run db:migrate:local   # for local dev
npm run db:migrate         # for production, once you're ready

# Set your Paystack secret key (get this from your Paystack dashboard)
wrangler secret put PAYSTACK_SECRET_KEY

# Run locally
npm run dev
```

## What's built (MVP core loop)

- `POST /api/models/register` — model account creation
- `POST /api/models/verify` — submit ID + liveness documents
- `GET /api/models/:username` — public landing page data (teaser photo, price)
- `POST /api/subscribers/register` — subscriber account creation
- `POST /api/checkout/start` — initiate a subscription payment via Paystack
- `POST /api/payments/webhook/paystack` — confirms payment, activates subscription
- `POST /api/messages/send` — send a chat message (enforces the one-free-trial-message rule and subscription paywall)
- `GET /api/messages/:subscriberId/:modelId` — fetch a chat thread

## What's deliberately NOT built yet — build in this order

1. **Auth/session middleware** — every route above trusts whatever IDs are
   passed in the request body, which is fine for local testing but is not
   secure. Add proper session tokens (KV-backed) and auth checks before
   any real user touches this.
2. **Frontend** — the `public/` directory is empty. Build the actual pages
   using the mockups as your visual reference.
3. **Verification vendor integration** — `verify.js` stores documents but
   doesn't call any vendor API yet. Pick one and wire it in.
4. **PPV unlocks** — needs its own checkout flow (same pattern as
   subscription checkout) plus the `ppv_items`/`ppv_unlocks` tables
   (already in schema.sql).
5. **Milestone bonus + referral bonus logic** — the schema tracks these
   (`milestone_bonus_progress`, `referral_bonus_ledger`) but nothing
   populates them yet. This needs a scheduled job (Cron Trigger) that
   checks 7-day retention on confirmed transactions and updates the
   ledgers accordingly. Keep the milestone bonus feature-flagged off
   until you hit your chosen platform milestone.
6. **Stories** — schema exists (`stories` table with `expires_at`), needs
   upload + feed query routes.
7. **Tipping** — same pattern as PPV checkout, 80/20 split instead of 65/35.
8. **Video call bookings** — schema exists; needs the actual WebRTC
   integration (Twilio Video / Agora / Daily.co) for the call itself —
   the booking/payment logic can be built Cloudflare-native, the video
   streaming cannot.
9. **Real-time chat** — messages currently work via polling
   (`GET /api/messages/...`). For real-time delivery, migrate to
   Cloudflare Durable Objects + WebSockets once the polling version
   is proven.
10. **Explicit content (v2)** — entirely separate module, only build if/when
    legal review comes back positive. See `Xerelle-Legal-Overview.docx`.

## Database

See `schema.sql` for the full schema and inline comments explaining each
table's purpose, especially around the bonus/referral logic which has
non-obvious rules (7-day retention windows, all-or-nothing withdrawal
thresholds, etc.) — those comments summarize the business rules so you
don't have to re-derive them from the original planning conversation.
