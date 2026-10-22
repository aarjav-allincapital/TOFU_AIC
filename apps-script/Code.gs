/**
 * All In Capital — Deal Flow Live API
 *
 * Attach this script to your "Email Agent Deal Flow" Google Sheet:
 * Extensions → Apps Script → paste this file → Deploy → New deployment →
 *   Type: Web app
 *   Execute as: Me
 *   Who has access: Anyone (or Anyone with Google account)
 *
 * Copy the Web App URL into your dashboard env as APPS_SCRIPT_URL.
 *
 * Optional: set SECRET_TOKEN below and pass ?token=... on requests.
 */

const CONFIG = {
  /** Tab name — falls back to the first sheet if not found. */
  SHEET_NAME: "Founders",
  /**
   * Shared secret for writes (POST). Set the same value in the portal as
   * APPS_SCRIPT_TOKEN (or SYNC_SECRET). Leave empty only for local tests.
   */
  SECRET_TOKEN: "",
};

/** Column indices (0-based) — matches sheet layout A–R. */
const COL = {
  DATE_RECEIVED: 0, // A
  NAME: 1, // B
  COMPANY: 2, // C
  SECTOR: 3, // D
  WEBSITE: 4, // E
  DECK_LINK: 5, // F
  BLURB: 6, // G
  SUMMARY: 7, // H
  SENDER_EMAIL: 8, // I
  THREAD_ID: 9, // J
  ACTION: 10, // K
  ACTION_DATE: 11, // L
  STATUS: 12, // M
  LINKEDIN: 13, // N
  ELITE_SCHOOL: 14, // O
  RATING: 16, // Q (P is unused)
  WORTH: 17, // R
  OWNER: 18, // S — which inbox/agent ingested this row
  CHANNEL: 19, // T — direct | superdm
};

/**
 * Web App entry — GET returns live deal JSON for the dashboard.
 */
function doGet(e) {
  try {
    if (CONFIG.SECRET_TOKEN && e.parameter.token !== CONFIG.SECRET_TOKEN) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payload = getDealsPayload();
    return jsonResponse(payload);
  } catch (err) {
    return jsonResponse({
      error: "Failed to read deal sheet",
      detail: String(err),
    }, 500);
  }
}

/**
 * Same payload shape as the Next.js dashboard expects.
 */
function getDealsPayload() {
  const sheet = getDataSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return emptyPayload();
  }

  const numRows = lastRow - 1;
  const numCols = Math.max(sheet.getLastColumn(), 20);
  const values = sheet.getRange(2, 1, numRows, numCols).getValues();
  const displayValues = sheet.getRange(2, 1, numRows, numCols).getDisplayValues();

  const deals = [];

  values.forEach(function (row, i) {
    const deal = rowToDeal(row, displayValues[i], i + 2);
    if (deal) deals.push(deal);
  });

  deals.sort(function (a, b) {
    return (b.dateReceivedMs || 0) - (a.dateReceivedMs || 0);
  });

  return {
    deals: deals,
    count: deals.length,
    fetchedAt: new Date().toISOString(),
    source: "apps-script",
  };
}

function rowToDeal(row, displayRow, rowIndex) {
  const name = clean(displayRow[COL.NAME] || row[COL.NAME]);
  const company = clean(displayRow[COL.COMPANY] || row[COL.COMPANY]);
  const senderEmail = clean(
    displayRow[COL.SENDER_EMAIL] || row[COL.SENDER_EMAIL],
  );
  const blurb = clean(displayRow[COL.BLURB] || row[COL.BLURB]);

  if (!company && !name && !senderEmail && !blurb) return null;

  const dateCell = row[COL.DATE_RECEIVED];
  const dateDisplay = displayRow[COL.DATE_RECEIVED];
  const dateReceivedMs = parseDateMs(dateCell);
  const dateReceived =
    clean(dateDisplay) ||
    (dateCell instanceof Date
      ? formatDateTime(dateCell)
      : clean(String(dateCell || ""))) ||
    null;

  const threadId = clean(displayRow[COL.THREAD_ID] || row[COL.THREAD_ID]);

  return {
    id: "row-" + rowIndex,
    rowIndex: rowIndex,
    dateReceived: dateReceived,
    dateReceivedMs: dateReceivedMs,
    name: name,
    company: company,
    sector: clean(displayRow[COL.SECTOR] || row[COL.SECTOR]),
    website: clean(displayRow[COL.WEBSITE] || row[COL.WEBSITE]),
    deckLink: clean(displayRow[COL.DECK_LINK] || row[COL.DECK_LINK]),
    blurb: blurb,
    summary: clean(displayRow[COL.SUMMARY] || row[COL.SUMMARY]),
    senderEmail: senderEmail,
    threadId: threadId,
    action: clean(displayRow[COL.ACTION] || row[COL.ACTION]),
    actionDate: formatActionDate(row[COL.ACTION_DATE], displayRow[COL.ACTION_DATE]),
    status: clean(displayRow[COL.STATUS] || row[COL.STATUS]),
    linkedin: clean(displayRow[COL.LINKEDIN] || row[COL.LINKEDIN]),
    eliteSchool: clean(displayRow[COL.ELITE_SCHOOL] || row[COL.ELITE_SCHOOL]),
    rating: clean(displayRow[COL.RATING] || row[COL.RATING]),
    worth: clean(displayRow[COL.WORTH] || row[COL.WORTH]),
    owner: clean(displayRow[COL.OWNER] || row[COL.OWNER]),
    channel: clean(displayRow[COL.CHANNEL] || row[COL.CHANNEL]),
  };
}

function getDataSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const named = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (named) return named;
  return ss.getSheets()[0];
}

function clean(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function parseDateMs(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === "number" && value > 0) {
  // Sheets serial date
    const ms = (value - 25569) * 86400 * 1000;
    return Math.round(ms);
  }
  return null;
}

function formatDateTime(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "dd/MM/yyyy HH:mm:ss",
  );
}

function formatActionDate(value, display) {
  const d = clean(display);
  if (d) return d;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "dd/MM/yyyy",
    );
  }
  return clean(String(value || "")) || null;
}

function emptyPayload() {
  return {
    deals: [],
    count: 0,
    fetchedAt: new Date().toISOString(),
    source: "apps-script",
  };
}

function jsonResponse(obj, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  // Apps Script Web Apps cannot set arbitrary status codes; include status in body if needed.
  if (statusCode && statusCode !== 200) {
    obj._status = statusCode;
  }
  return output;
}

/**
 * Manual test in the Apps Script editor: Run → testGetDeals
 */
function testGetDeals() {
  const payload = getDealsPayload();
  Logger.log("Deals: " + payload.count);
  if (payload.deals.length) Logger.log(payload.deals[0]);
}
