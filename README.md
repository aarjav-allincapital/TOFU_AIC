# TOFU

Inbound deal portal and deal-sourcing board. Google Sheets stay the system of record. This app reads them, signs the team in, and layers ratings, LinkedIn previews, and Tracxn company profiles on top.

Nothing in this repository is live data. Secrets, sheet contents, enrichment caches, and the All In Capital flag are kept off GitHub on purpose.

## What you need

- Node.js 20+
- A Google Sheet for inbound founders, plus the Apps Script in `apps-script/`
- A separate Google Sheet for deal sourcing (`apps-script/sourcing/`)
- A Supabase project
- A [Resend](https://resend.com) API key, so login codes can be emailed
- Optional: Attio, Tracxn, Bright Data, OpenAI

## 1. Install

```bash
git clone <this-repo>
cd TOFU_AIC
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Never commit that file. `.env.example` lists every variable and what it does. The minimum to boot the portal:

| Variable | Where it comes from |
| --- | --- |
| `SHEET_ID` | Founders workbook ID from the sheet URL |
| `APPS_SCRIPT_URL` | Web app URL after deploying `apps-script/Code.gs` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (server only) |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | Resend dashboard |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally |

Login is limited to `@allincapital.vc` addresses.

## 2. Database

In the Supabase SQL editor, run `supabase/schema.sql` once, then each `supabase/migrate-*.sql` once. They only add columns and tables. Order does not matter as long as `schema.sql` is first.

| File | Adds |
| --- | --- |
| `schema.sql` | `deals` mirror of the Founders sheet |
| `migrate-owner.sql` | owner / channel |
| `migrate-rating-bucket.sql` | rating and pipeline bucket |
| `migrate-reject-email.sql` | pass-email tracking |
| `migrate-info-reply.sql` | founder replies after Request Info |
| `migrate-linkedin-enrich.sql` | inbound LinkedIn snapshots |
| `migrate-deck-summary.sql` | deck summaries |
| `migrate-jev-rating.sql` | local rating fields |
| `migrate-sourcing-board.sql` | sourcing kanban stages |
| `migrate-sourcing-linkedin.sql` | sourcing LinkedIn snapshots |
| `migrate-sourcing-share.sql` | public share cards |
| `migrate-sourcing-tracxn.sql` | Tracxn company profiles |

Until `migrate-sourcing-tracxn.sql` is applied, Tracxn profiles are stored under a `tracxn:` prefix in `sourcing_linkedin`. Run the migration when you can; the app switches over on its own.

## 3. Apps Script

Inbound JSON API: [`apps-script/DEPLOY.md`](apps-script/DEPLOY.md).

Aditya's inbox agent: [`apps-script/aditya/PREREQUISITES.md`](apps-script/aditya/PREREQUISITES.md). Put `ANTHROPIC_API_KEY`, `FOUNDER_SHEET_ID`, and `SYNC_SECRET` in Script Properties. Do not paste them into `Code.gs`.

Deal sourcing workbook (a different Google account, never the Founders sheet): [`apps-script/sourcing/SETUP.md`](apps-script/sourcing/SETUP.md). Then set `SOURCING_SHEET_ID` and `SOURCING_APPS_SCRIPT_URL`.

## 4. Logo

The All In Capital flag is not in this repo. Drop your own file at `public/all-in-logo.png` on the machine or deploy that runs the app. The sidebar, team page, share cards, and Open Graph image read that path. Favicons in `public/` and `src/app/` are the TOFU mark and are included.

## 5. Run

```bash
npm run dev      # http://localhost:3000
npm run build && npm start
```

Sign in with an `@allincapital.vc` email. The code arrives from Resend.

## Optional integrations

All of these read keys from `.env.local` only.

- **Attio** — `ATTIO_API_KEY`. Deal Flow writes happen only when someone clicks Add to Attio.
- **Tracxn** — `TRACXN_API_KEY`. Sourcing looks up each company by website domain (1 credit per entity returned, misses are free) and caches the profile. `ENABLE_SOURCING_TRACXN=0` pauses lookups. Cards with no website can be looked up by hand from the sourcing modal.
- **LinkedIn** — `BRIGHTDATA_API_TOKEN`. Inbound scrapes stay off unless `ENABLE_LINKEDIN_BRIGHTDATA=1`. Sourcing previews fill in the background; `ENABLE_SOURCING_LINKEDIN=0` skips them.
- **Ratings** — `OPENAI_API_KEY` for the production rater. Jev stays on `next dev` and does not run in production.
- **Deck summaries** — set `ENABLE_DECK_SUMMARY=1` only after `migrate-deck-summary.sql`.

## What never gets committed

- `.env`, `.env.local`, and any other env file except `.env.example`
- `.data/` — local caches for LinkedIn, Tracxn, the sourcing board, and ratings
- `public/all-in-logo.png`
- Sheet rows, founder emails, or enrichment payloads

One-off scripts under `scripts/` talk to Supabase, Attio, or Resend using `.env.local`. They do not contain a data export. Do not point them at production unless that is the job you mean to run.

```bash
npm run sync:supabase   # mirror the sheet into Supabase
npm run sync:attio      # push selected deals to Attio
```
