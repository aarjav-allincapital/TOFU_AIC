# Aditya's inbox ingest — setup

This script runs **only** on `adityasingh@allincapital.vc`. It pulls deals from
his inbox into the **same Founders sheet** the live system already uses.

**Do not change kb@'s Apps Script.** That agent stays as-is. Yes / No / loop-in
replies, calendar links, and founder pass copy continue to come from the current
system (kb@ + portal). This script does not send those.

Code: [`Code.gs`](./Code.gs).

---

## What it does

| Mail in Aditya's inbox | This script |
|---|---|
| Founder pitch | Writes a row on the shared sheet (`Owner=aditya`, `Channel=direct`) |
| Intern / vendor | Auto-pass from Aditya's mailbox, archive |
| Banker / deal-flow / co-invest collab | **Ignore** — label only, no reply |
| Brand collaboration | Team-email reply, archive |
| Newsletter | Label only |
| Everything else | Queue for Aditya's digest |

Past mail is included (`INBOX_LOOKBACK_DAYS = 0`). It processes 50 threads per
run so a backlog drains over a few hourly cycles. Run `processInbox` manually
a few times first if you want it to catch up faster.

When the team later picks an Action on that sheet row, **kb@ / the portal**
send the founder reply — same as today.

Aditya's portal login already filters to `owner=aditya`. Kushal / Aarjav /
Simran still see everyone.

---

## Sheet (one additive change)

On the shared "Email Agent Deal Flow" sheet, add headers if they are not there:

- **S → `Owner`**
- **T → `Channel`**

Leave existing rows blank. The portal treats blank as KB. Do not change kb@'s
script to write these columns.

Share the sheet with **adityasingh@allincapital.vc** as **Editor**.

---

## Create the Apps Script project (Aditya's Google account)

1. Sign in as **adityasingh@allincapital.vc**.
2. https://script.google.com/new → name it "All In — Aditya Ingest".
3. Paste [`Code.gs`](./Code.gs).
4. Project Settings → Time zone → `(GMT+05:30) India Standard Time`.

### Script Properties

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | same Claude key kb@ uses, or a new one |
| `FOUNDER_SHEET_ID` | The Founders workbook ID (same value as `SHEET_ID` in `.env.local`) |
| `DIGEST_RECIPIENT` | `adityasingh@allincapital.vc` (optional) |
| `SYNC_SECRET` | **Required for Request Info replies.** Same value as Vercel `SYNC_SECRET`. Without this, founder replies after Request Info never show on TOFU. |

---

## Triggers (only these two)

| Function | Event | Interval |
|---|---|---|
| `processInbox` | Time-driven | Every **1 hour** |
| `sendDailyDigest` | Time-driven | **9am–10am** IST |

Do **not** add `processSheetActions`. It is a no-op on purpose so this script
cannot double-send founder replies.

Authorize Gmail + Sheets + external requests when prompted.

---

## Stuck dashboard (last card never changes)

`processInbox` ignores mail already labeled `agent/processed`. If an earlier run
labeled threads without writing `Owner=aditya`, running it again does nothing
and TOFU stays on the last card (e.g. Yugality).

1. Re-paste this `Code.gs` into Aditya's Apps Script (Save).
2. Function dropdown → **`repairAdityaIngest`** → Run.
3. Open **Executions** → logs should include `appendFounderRow_ row=…` and a
   final `repairAdityaIngest DONE appended=N`.
4. Refresh TOFU as adityasingh@ — new cards appear above that last one.

Safe to re-run; it skips senders already stamped `Owner=aditya`. It does **not**
send intern/vendor auto-pass mail.

Then add the hourly `processInbox` trigger if it is missing.

---

## Test

1. Run `testClassifyOne` → Logs show JSON (Claude key works).
2. Run `processInbox` → a founder in Aditya's inbox appears on the sheet with
   `Owner=aditya`; intern/vendor get an auto-pass; banker/deal-flow is ignored.
3. Log into the portal as adityasingh@ → that deal is in his view.

Then add the two triggers.

---

## Request Info replies → TOFU

The portal sends the Request Info email via Resend (reply-to
`adityasingh@`), so a founder's reply lands in this inbox as a **new thread**
with subject `Re: Your pitch — All In Capital`. The script finds those by
subject (`CONFIG.REQUEST_INFO_REPLY_QUERY`) every hour and POSTs the founder's
actual reply text to TOFU, where it shows in the top tray and as the "Replied
mail" dropdown on the deal.

**After updating `Code.gs`, re-paste it into the Apps Script editor** — the
script does not auto-update from this repo.

### One-time backfill of replies already in the inbox

1. In the editor, pick **`backfillFounderReplies`** in the function dropdown → **Run**.
2. Check **Executions** → logs print one line per reply
   (`[backfill/subject] posted <email> row=<n>`) and a final `DONE` summary.
3. Refresh TOFU — every Request Info deal with a reply now shows it.

Safe to re-run; it only posts replies it hasn't posted before. If it stops at
the 6-minute limit, run it again and it resumes.
