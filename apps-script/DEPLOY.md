# Apps Script — Live Deal Fetch API

This script exposes your Google Sheet as a **live JSON API** for the Deal Portal dashboard.

## Setup

1. Open the Founders Google Sheet (the workbook ID you will set as `SHEET_ID`)
2. **Extensions → Apps Script**
3. Delete any placeholder code and paste the contents of `Code.gs`
4. Set `CONFIG.SHEET_NAME` if your data tab is not `Founders` (otherwise it uses the first tab)
5. (Optional) Set `CONFIG.SECRET_TOKEN` for a simple shared secret

Deploy as Web App:

1. **Deploy → New deployment** → Web app
2. Execute as: **Me**
3. Who has access: **Anyone** (public) *or* **Anyone at allincapital.vc** (workspace)

If you use the workspace URL (`script.google.com/a/macros/allincapital.vc/...`), users must be **signed into Google as allincapital.vc** in the browser — the dashboard fetches Apps Script from the client with that session.

If the server cannot authenticate (sign-in HTML), the dashboard falls back to the public Sheet `gviz` endpoint automatically.

## Connect the dashboard

Create `.env.local` in the project root:

```bash
APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
# Optional, if you set SECRET_TOKEN in Code.gs:
APPS_SCRIPT_TOKEN=your-secret-here
```

Restart the dev server (`npm run dev`).

The dashboard will:

1. **Prefer** `APPS_SCRIPT_URL` (live Apps Script API)
2. **Fall back** to the public Sheet `gviz` endpoint if the URL is not set

## Test the endpoint

```bash
curl "https://script.google.com/macros/s/YOUR_ID/exec"
```

You should get JSON with `deals`, `count`, `fetchedAt`, and `source: "apps-script"`.

## Column mapping

| Col | Field         |
| --- | ------------- |
| A   | Date Received |
| B   | Name          |
| C   | Company       |
| D   | Sector        |
| E   | Website       |
| F   | Deck Link     |
| G   | Blurb         |
| H   | Summary       |
| I   | Sender Email  |
| J   | Thread ID     |
| K   | Action        |
| L   | Action Date   |
| M   | Status        |
| N   | LinkedIn      |
| O   | Elite School  |
| Q   | Rating        |
| R   | Worth?        |

This matches the email-ingest Apps Script that writes inbound founder emails into the sheet.
