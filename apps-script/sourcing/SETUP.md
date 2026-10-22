# Deal Sourcing workbook (Mitra) — other Google account

This is **not** the inbound Founders sheet. Do not paste this into kb@’s or
Aditya’s ingest scripts. Run it on the Google account that should own
sourcing.

Code: [`Code.gs`](./Code.gs).

---

## What you get

| Tab | Role |
|---|---|
| **Mitra** | Paste / agent dump. Numbered founder blocks in the exact Mitra format. |
| **Sourced** | One row per founder (parsed fields + status). TOFU reads this. |
| **Cards** | Same information laid out as cards, matching the portal. |
| **Setup** | Short instructions + the example dump. |

Mitra format this script parses:

```
1. Pradyumna Vyshnav | Stealth Startup (Uncharted AI)
Profile URL: LinkedIn Profile
Domain / What they are building: Space Robotics & Autonomous Resource Discovery
Stage & Founding Timeline: Stealth / Just Started Building (Incubating via ARTPARK / Antler DeepTech residency)
Funding Status: Strictly Unfunded / Zero VC raised (pre-seed incubation)
Pedigree & Traction / Verification: Aerospace background, …
```

`Stealth Startup (Uncharted AI)` becomes company **Uncharted AI** with note
Stealth Startup. `Profile URL: LinkedIn Profile` is stored empty until a real
URL is present.

---

## Create the sheet (other account)

1. Sign in as the sourcing Google account (not the inbound ingest account).
2. https://script.google.com/new → name it **All In — Deal Sourcing**.
3. Paste [`Code.gs`](./Code.gs). Delete any placeholder `myFunction`.
4. Run **`setupSourcingWorkbook`**. Authorize Sheets (and Gmail only if you
   later set `CONFIG.GMAIL_QUERY`).
5. Execution log prints the **Sheet URL** and **Sheet ID**.

If you prefer a sheet you already opened: **Extensions → Apps Script** on that
blank spreadsheet, paste the same file, then run `setupSourcingWorkbook`. It
formats the active workbook instead of creating a new one.

`setupSourcingWorkbook` seeds the Pradyumna example so Cards + TOFU have one
row to verify immediately.

---

## Deploy the live JSON API

1. **Deploy → New deployment → Web app**
2. Execute as: **Me**
3. Who has access: **Anyone**
4. Copy the Web App URL.

Optional shared secret: set `CONFIG.SECRET_TOKEN` (or Script Property
`SECRET_TOKEN`) and the same value as `SOURCING_APPS_SCRIPT_TOKEN` in TOFU.

Share the sheet with the TOFU operator as Viewer. For the gviz fallback, also
**Anyone with the link → Viewer**.

---

## Connect TOFU

In `.env.local` (never the inbound `SHEET_ID`):

```bash
SOURCING_SHEET_ID=the_id_from_the_execution_log
SOURCING_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
# Optional, if you set SECRET_TOKEN in Code.gs:
SOURCING_APPS_SCRIPT_TOKEN=
```

Restart `npm run dev`. Left sidebar → **Deal sourcing**.

---

## How Mitra writes

Point Mitra at this workbook, **Mitra** tab:

- One dump per row in column B (full numbered list), or
- Line-by-line in column B (the script joins them), or
- `POST` the Web App URL with `{ "text": "1. Name | Company\n…" }`

Then run **Deal Sourcing → Process Mitra dump**, or wait for the hourly
trigger (`installTriggers`).

Existing founder + company rows are updated in place; **Status** and **Notes**
are preserved.

---

## Triggers (optional)

| Function | Event |
|---|---|
| `processMitraTab` | Hourly |
| `ingestFromGmail` | Hourly, only if `CONFIG.GMAIL_QUERY` is set |

Gmail ingest is off by default so this account does not scan unrelated mail.
