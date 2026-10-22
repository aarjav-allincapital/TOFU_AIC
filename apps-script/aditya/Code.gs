/**
 * All In Capital — Inbox ingest agent (Aditya)
 * =============================================
 * Runs on adityasingh@allincapital.vc. Does NOT replace or edit the live kb@
 * agent. kb@ still owns sheet Actions (Yes / No / loop-in) and founder replies.
 *
 * This script only:
 *   - Classifies unprocessed threads in Aditya's inbox (including backlog)
 *   - Founders → append to the shared sheet with Owner="aditya", Channel="direct"
 *   - Intern / vendor → auto-pass from Aditya's mailbox, then archive
 *   - Banker / deal-flow / co-invest / investor-relationship collabs → ignore
 *     (label only, no reply, no sheet, no digest)
 *   - Brand collaboration → reply with the team contact, then archive
 *   - Newsletter → label silently
 *   - Other → queue for Aditya's daily digest
 *
 * Paste this file into Aditya's Apps Script. Keys stay in Script Properties,
 * never in this file:
 *   ANTHROPIC_API_KEY, FOUNDER_SHEET_ID, SYNC_SECRET
 * DIGEST_RECIPIENT can still be overridden in Script Properties if you want.
 */

var ANTHROPIC_API_KEY =
  PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY") || "";
var FOUNDER_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty("FOUNDER_SHEET_ID") || "";

const CONFIG = {
  // ── Identity / ownership ────────────────────────────────────────────────
  /** This agent's owner tag, written to the sheet's Owner column (S). */
  OWNER: "aditya",
  /** This inbox never handles SuperDM — every founder here is a direct pitch. */
  CHANNEL: "direct",
  /** Who gets this agent's daily digest. Falls back to the running account. */
  DIGEST_RECIPIENT_DEFAULT: "adityasingh@allincapital.vc",

  ANTHROPIC_API_KEY: ANTHROPIC_API_KEY,
  FOUNDER_SHEET_ID: FOUNDER_SHEET_ID,
  /** Portal URL — used to flag Request Info follow-ups on the dashboard. */
  PORTAL_URL: "https://tofu-aic.vercel.app",
  /**
   * Gmail search that matches founder replies to the portal's "Request Info"
   * email (sent via Resend with subject "Re: Your pitch — All In Capital").
   * Those replies arrive as NEW threads — Gmail can't thread them onto the
   * founder's original pitch — so we find them by subject, never by label.
   */
  REQUEST_INFO_REPLY_QUERY:
    'subject:"Your pitch" -from:me -in:trash -in:spam -in:draft',
  /**
   * Same SYNC_SECRET as Vercel. Prefer Script Properties key SYNC_SECRET so
   * this file doesn't need the value pasted in.
   */
  SYNC_SECRET: "",

  // ── Claude ──────────────────────────────────────────────────────────────
  MODEL: "claude-haiku-4-5",
  ANTHROPIC_VERSION: "2023-06-01",
  MAX_TOKENS: 900,
  /** Below this confidence a thread is flagged for human eyes in the digest. */
  LOW_CONFIDENCE: 0.6,

  // ── Sheet ───────────────────────────────────────────────────────────────
  SHEET_NAME: "Founders",
  /** Dedup window — skip a founder whose email already appeared within N days. */
  DEDUP_DAYS: 7,

  // ── Auto-pass routing (banker / intern / vendor in Aditya's inbox) ──────
  REPLY_TO: "response@allincapital.vc",
  /** Empty = send as adityasingh@ (the running account). No Send-As alias needed. */
  TEAM_FROM_ALIAS: "",
  /** Optional intern form. Leave empty to skip the extra paragraph. */
  INTERN_FORM_URL: "https://forms.gle/figJjRyVKNpCBPd39",

  // ── Labels ──────────────────────────────────────────────────────────────
  LABELS: {
    PROCESSED: "agent/processed",
    FOUNDER: "agent/founder",
    BANKER: "agent/banker",
    INTERN: "agent/intern",
    VENDOR: "agent/vendor",
    COLLABORATION: "agent/collaboration",
    IGNORED: "agent/ignored",
    NEWSLETTER: "agent/newsletter",
    ACTIONED: "agent/actioned",
    NEEDS_REVIEW: "agent/needs-review",
    DIGEST_QUEUE: "agent/digest-queue",
    DIGEST_SENT: "agent/digest-sent",
  },

  // ── Ingest window ───────────────────────────────────────────────────────
  /**
   * How far back to reach for unprocessed threads. 0 = the ENTIRE inbox backlog
   * (every past mail, same as kb@). The `agent/processed` label makes this
   * idempotent, and MAX_THREADS_PER_RUN caps each run so a large backlog drains
   * gradually over successive hourly runs instead of hitting quotas at once.
   */
  INBOX_LOOKBACK_DAYS: 0,
  MAX_THREADS_PER_RUN: 50,

  // ── Archive sweeps ──────────────────────────────────────────────────────
  STALE_FOLLOWUP_HOURS: 24,
  PAPERMARK_HOURS: 48,
};

/** Column indices (1-based, for getRange/setValue). Matches sheet A–T. */
const COL = {
  DATE_RECEIVED: 1, // A
  NAME: 2, // B
  COMPANY: 3, // C
  SECTOR: 4, // D
  WEBSITE: 5, // E
  DECK_LINK: 6, // F
  BLURB: 7, // G
  SUMMARY: 8, // H
  SENDER_EMAIL: 9, // I
  THREAD_ID: 10, // J
  ACTION: 11, // K
  ACTION_DATE: 12, // L
  STATUS: 13, // M
  LINKEDIN: 14, // N
  ELITE_SCHOOL: 15, // O
  RATING: 17, // Q (P unused)
  WORTH: 18, // R
  OWNER: 19, // S
  CHANNEL: 20, // T
  _WIDTH: 20,
};

// ────────────────────────────────────────────────────────────────────────────
// Entry points (wire these to triggers — see PREREQUISITES.md)
// ────────────────────────────────────────────────────────────────────────────

/** Hourly: classify unprocessed inbox threads, then run archive sweeps. */
function processInbox() {
  ensureLabelsExist_();
  const labels = getLabels_();

  // INBOX_LOOKBACK_DAYS === 0 → no date bound, i.e. drain the whole backlog.
  const window = CONFIG.INBOX_LOOKBACK_DAYS > 0
    ? `newer_than:${CONFIG.INBOX_LOOKBACK_DAYS}d `
    : "";
  const query =
    `in:inbox ${window}` +
    `-label:${CONFIG.LABELS.PROCESSED} ` +
    `-from:me`;
  // Flag Request Info replies FIRST. They arrive as new threads; this labels
  // them processed so the classifier below never mistakes one for a new pitch.
  catchFounderReplies_();

  const threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN);
  Logger.log(
    "processInbox query=\"" + query + "\" threads=" + threads.length +
    (threads.length === 0
      ? " — nothing left unprocessed. If Aditya's TOFU is still stuck, run repairAdityaIngest."
      : "")
  );

  for (let i = 0; i < threads.length; i++) {
    try {
      processThread_(threads[i], labels);
    } catch (err) {
      Logger.log("processThread_ error: " + err);
    }
  }

  archiveStaleFollowups_();
  archivePapermark_();
}

/**
 * Same button people keep hitting instead of processInbox / repairAdityaIngest.
 * Does NOT send Yes/No/loop-in (kb@ still owns those). Writes missing
 * Owner=aditya rows so Aditya's TOFU moves past the last stuck card.
 */
function processSheetActions() {
  Logger.log("processSheetActions → repairAdityaIngest (not kb@ sheet Actions)");
  repairAdityaIngest();
}

/** Daily 9am IST: send Aditya his digest, scoped to his own dealflow. */
function sendDailyDigest() {
  const recipient =
    getProp_("DIGEST_RECIPIENT") || CONFIG.DIGEST_RECIPIENT_DEFAULT;
  const html = buildDigestHTML_();
  GmailApp.sendEmail(recipient, "All In — your daily deal digest", "", {
    htmlBody: html,
    name: "All In Capital Agent",
  });
  markDigestQueueSent_();
}

// ────────────────────────────────────────────────────────────────────────────
// Thread routing
// ────────────────────────────────────────────────────────────────────────────

function processThread_(thread, labels) {
  // Never re-handle a thread we've already labeled.
  const existing = thread.getLabels().map(function (l) { return l.getName(); });
  if (existing.indexOf(CONFIG.LABELS.PROCESSED) !== -1) return;

  const messages = thread.getMessages();
  const lastMsg = messages[messages.length - 1];
  const subject = thread.getFirstMessageSubject() || "";
  const from = lastMsg.getFrom() || "";
  const replyTo = lastMsg.getReplyTo() || "";
  const senderEmail = parseEmailAddress_(replyTo || from);
  const body = lastMsg.getPlainBody() || "";

  // Follow-up only if THIS inbox already has the founder on TOFU.
  // Matching kb@'s sheet (blank Owner) must NOT skip ingest — that was why
  // processInbox "ran" but Aditya's dashboard stayed parked on the last card.
  var existingAdityaRow = findOwnedFounderRow_(senderEmail, CONFIG.OWNER);
  if (existingAdityaRow > 0 && !isInternalSender_(senderEmail)) {
    var replyKey = "infoReplyMsg:" + thread.getId() + ":" + lastMsg.getId();
    var replyProps = PropertiesService.getScriptProperties();
    if (!replyProps.getProperty(replyKey) || replyProps.getProperty(replyKey) === "1") {
      var posted = notifyInfoReply_(senderEmail, subject, body, existingAdityaRow);
      if (posted && posted.ok) replyProps.setProperty(replyKey, "ok");
    }
    thread.addLabel(labels[CONFIG.LABELS.FOUNDER]);
    thread.addLabel(labels[CONFIG.LABELS.PROCESSED]);
    Logger.log("Aditya follow-up — row " + existingAdityaRow + ": " + senderEmail);
    return;
  }

  const result = classifyEmail_(subject, from, body);
  var bucket = (result && result.bucket) || "other";
  const confidence = (result && typeof result.confidence === "number")
    ? result.confidence
    : 0;

  // Comms / PR / media partnership outreach is collaboration,
  // not a vendor auto-pass — even if the sender is an agency.
  if (
    (bucket === "vendor" || bucket === "other") &&
    isBrandCollaboration_(subject, from, body) &&
    !isInvestorRelations_(subject, body)
  ) {
    Logger.log("Reclassified " + bucket + " → collaboration: " + subject);
    bucket = "collaboration";
  }

  switch (bucket) {
    case "founder_direct":
    case "founder_superdm":
      handleFounder_(thread, lastMsg, subject, senderEmail, result);
      break;

    case "banker":
      // Bankers / deal-flow intros: never reply, never sheet, never digest.
      ignoreThread_(thread, labels, CONFIG.LABELS.BANKER);
      break;

    case "intern":
      sendPassReply_(thread, lastMsg, "intern");
      thread.addLabel(labels[CONFIG.LABELS.INTERN]);
      thread.moveToArchive();
      break;

    case "vendor":
      sendPassReply_(thread, lastMsg, "vendor");
      thread.addLabel(labels[CONFIG.LABELS.VENDOR]);
      thread.moveToArchive();
      break;

    case "collaboration":
      // Brand/marketing collab only. Anything deal-flow / co-invest is ignored.
      if (isInvestorRelations_(subject, body)) {
        ignoreThread_(thread, labels, CONFIG.LABELS.IGNORED);
        break;
      }
      sendCollaborationReply_(thread, lastMsg);
      thread.addLabel(labels[CONFIG.LABELS.COLLABORATION]);
      thread.moveToArchive();
      break;

    case "newsletter":
      thread.addLabel(labels[CONFIG.LABELS.NEWSLETTER]);
      break;

    case "other":
    default:
      if (isInvestorRelations_(subject, body)) {
        ignoreThread_(thread, labels, CONFIG.LABELS.IGNORED);
        break;
      }
      var founderRow = findFounderRowAnytime_(senderEmail);
      if (founderRow > 0) {
        notifyInfoReply_(senderEmail, subject, body, founderRow);
      }
      queueForDigest_(thread, subject, result);
      break;
  }

  if (confidence < CONFIG.LOW_CONFIDENCE && bucket !== "newsletter") {
    thread.addLabel(labels[CONFIG.LABELS.NEEDS_REVIEW]);
  }

  thread.addLabel(labels[CONFIG.LABELS.PROCESSED]);
}

// ────────────────────────────────────────────────────────────────────────────
// Founder handling
// ────────────────────────────────────────────────────────────────────────────

function handleFounder_(thread, lastMsg, subject, senderEmail, result) {
  var existingRow = findOwnedFounderRow_(senderEmail, CONFIG.OWNER);
  if (existingRow > 0) {
    var dupKey = "infoReplyMsg:" + thread.getId() + ":" + lastMsg.getId();
    var dupProps = PropertiesService.getScriptProperties();
    if (!dupProps.getProperty(dupKey) || dupProps.getProperty(dupKey) === "1") {
      var dupPosted = notifyInfoReply_(senderEmail, subject, lastMsg.getPlainBody() || "", existingRow);
      if (dupPosted && dupPosted.ok) dupProps.setProperty(dupKey, "ok");
    }
    Logger.log("Duplicate Aditya founder — row " + existingRow + ": " + senderEmail);
    thread.addLabel(getLabels_()[CONFIG.LABELS.FOUNDER]);
    return;
  }

  appendFounderRow_(thread, senderEmail, result);
  thread.addLabel(getLabels_()[CONFIG.LABELS.FOUNDER]);
}

/** Write a new Founders-sheet row stamped Owner=aditya. */
function appendFounderRow_(thread, senderEmail, result) {
  const sheet = getDataSheet_();
  const f = result || {};
  const now = new Date();

  const rowValues = new Array(COL._WIDTH).fill("");
  rowValues[COL.DATE_RECEIVED - 1] = formatDateTime_(now);
  rowValues[COL.NAME - 1] = clean_(f.name);
  rowValues[COL.COMPANY - 1] = clean_(f.company);
  rowValues[COL.SECTOR - 1] = clean_(f.sector);
  rowValues[COL.WEBSITE - 1] = clean_(f.website);
  rowValues[COL.DECK_LINK - 1] = clean_(f.deck_link);
  rowValues[COL.BLURB - 1] = clean_(f.blurb);
  rowValues[COL.SUMMARY - 1] = clean_(f.summary);
  rowValues[COL.SENDER_EMAIL - 1] = senderEmail;
  rowValues[COL.THREAD_ID - 1] = thread.getId();
  rowValues[COL.LINKEDIN - 1] = clean_(f.linkedin);
  rowValues[COL.ELITE_SCHOOL - 1] = clean_(f.elite_school);
  rowValues[COL.OWNER - 1] = CONFIG.OWNER;
  rowValues[COL.CHANNEL - 1] = CONFIG.CHANNEL;

  sheet.appendRow(rowValues);
  var newRow = sheet.getLastRow();
  Logger.log(
    "appendFounderRow_ row=" + newRow + " " + senderEmail + " " + clean_(f.company)
  );
  return newRow;
}

/**
 * Returns the 1-based sheet row of the most recent match within the dedup
 * window, or 0 if no match. Replaces the old boolean isDuplicateFounder_.
 */
function findExistingFounderRow_(senderEmail) {
  const email = String(senderEmail || "").trim().toLowerCase();
  if (!email) return 0;

  const sheet = getDataSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const numRows = lastRow - 1;
  const emails = sheet.getRange(2, COL.SENDER_EMAIL, numRows, 1).getValues();
  const dates = sheet.getRange(2, COL.DATE_RECEIVED, numRows, 1).getValues();
  const cutoff = Date.now() - CONFIG.DEDUP_DAYS * 86400 * 1000;

  for (let i = emails.length - 1; i >= 0; i--) {
    const e = String(emails[i][0] || "").trim().toLowerCase();
    if (e !== email) continue;
    const ms = parseDateMs_(dates[i][0]);
    if (ms == null || ms >= cutoff) return i + 2; // 1-based row (header is row 1)
  }
  return 0;
}

/**
 * 1-based sheet row of this sender already stamped with Owner=tag, or 0.
 * Used so Aditya's ingest is not skipped just because kb@ already logged them.
 */
function findOwnedFounderRow_(senderEmail, ownerTag) {
  const email = String(senderEmail || "").trim().toLowerCase();
  const want = String(ownerTag || "").trim().toLowerCase();
  if (!email || !want) return 0;

  const sheet = getDataSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const numRows = lastRow - 1;
  const emails = sheet.getRange(2, COL.SENDER_EMAIL, numRows, 1).getValues();
  const owners = sheet.getRange(2, COL.OWNER, numRows, 1).getValues();

  for (let i = emails.length - 1; i >= 0; i--) {
    const e = String(emails[i][0] || "").trim().toLowerCase();
    if (e !== email) continue;
    const o = String(owners[i][0] || "").trim().toLowerCase();
    if (o === want) return i + 2;
  }
  return 0;
}

/**
 * Like findExistingFounderRow_ but with NO date cutoff. Founders often reply to
 * a "Request Info" email long after the dedup window, so reply-recognition must
 * find their row whenever it was created — the window only guards NEW-row dedup.
 * Returns the 1-based sheet row of the most recent match, or 0 if none.
 */
function findFounderRowAnytime_(senderEmail) {
  const email = String(senderEmail || "").trim().toLowerCase();
  if (!email) return 0;

  const sheet = getDataSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const numRows = lastRow - 1;
  const emails = sheet.getRange(2, COL.SENDER_EMAIL, numRows, 1).getValues();

  for (let i = emails.length - 1; i >= 0; i--) {
    const e = String(emails[i][0] || "").trim().toLowerCase();
    if (e === email) return i + 2; // 1-based row (header is row 1)
  }
  return 0;
}

/**
 * If the given row has a blank Owner column, stamp it with this agent's
 * OWNER and CHANNEL so the deal shows in Aditya's scoped dashboard.
 */
function claimRowIfUnowned_(sheetRow) {
  const sheet = getDataSheet_();
  const current = String(sheet.getRange(sheetRow, COL.OWNER).getValue() || "").trim();
  if (current) return; // already owned — don't overwrite
  sheet.getRange(sheetRow, COL.OWNER).setValue(CONFIG.OWNER);
  sheet.getRange(sheetRow, COL.CHANNEL).setValue(CONFIG.CHANNEL);
}

/**
 * Tell the portal a known sender wrote back. No-ops unless that deal is in
 * the Request Info bucket. Secret from Script Properties (SYNC_SECRET).
 */
function notifyInfoReply_(senderEmail, subject, body, rowIndex) {
  const portal = String(CONFIG.PORTAL_URL || "").replace(/\/$/, "");
  const secret = String(getProp_("SYNC_SECRET") || "").trim();
  if (!portal) {
    Logger.log("notifyInfoReply_ skipped — PORTAL_URL empty");
    return { ok: false, reason: "no_portal" };
  }
  if (!secret) {
    Logger.log("notifyInfoReply_ skipped — set Script Property SYNC_SECRET to the same value as Vercel");
    return { ok: false, reason: "no_secret" };
  }
  if (!senderEmail) {
    Logger.log("notifyInfoReply_ skipped — no sender");
    return { ok: false, reason: "no_sender" };
  }

  // The portal's "Replied mail" dropdown must show what the founder ACTUALLY
  // wrote, so the note IS the de-quoted reply text. A one-line Claude summary
  // goes on top when available; the raw body is the last-resort fallback.
  var reply = extractLatestReply_(body);
  var summary = reply ? summarizeReply_(reply) : "";
  var note = reply
    ? (summary ? summary + "\n\n" + reply : reply)
    : (summary || String(body || "").slice(0, 1500));

  try {
    var payload = {
      senderEmail: senderEmail,
      subject: subject || "",
      note: String(note || "").slice(0, 3500),
    };
    if (rowIndex && Number(rowIndex) > 0) payload.rowIndex = Number(rowIndex);
    var res = UrlFetchApp.fetch(portal + "/api/deals/info-reply", {
      method: "post",
      contentType: "application/json",
      headers: { "x-sync-secret": secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    var text = res.getContentText() || "";
    var parsed = {};
    try { parsed = JSON.parse(text); } catch (e) { parsed = {}; }
    var ok = code === 200 && parsed && parsed.ok === true;
    Logger.log(
      "notifyInfoReply_ " + senderEmail + " HTTP " + code +
      (ok ? " ok row=" + parsed.rowIndex : " FAIL " + (parsed.reason || text.slice(0, 160))) +
      " · note=" + String(note || "").slice(0, 80)
    );
    return {
      ok: ok,
      reason: ok ? "ok" : (parsed.reason || parsed.error || ("http_" + code)),
      rowIndex: parsed.rowIndex || rowIndex || 0,
    };
  } catch (err) {
    Logger.log("notifyInfoReply_ error: " + err);
    return { ok: false, reason: String(err) };
  }
}

/**
 * Return only the NEW text a founder typed, dropping the quoted original
 * ("On <date> ... wrote:", ">" lines, signatures after "--").
 */
function extractLatestReply_(body) {
  var text = String(body || "").replace(/\r/g, "");

  // Cut at the FIRST quote header, wherever it is. Gmail wraps long
  // "On <date>, <name> <email>\nwrote:" headers across two lines, so a
  // per-line "^On .+wrote:$" test never matches — this whole-text regex does.
  var cutters = [
    /(^|\n)\s*On\s[^\n]{5,300}?(\n[^\n]{0,200}?)?\bwrote:\s*\n?/,        // Gmail / Apple Mail
    /(^|\n)\s*-{2,}\s*Original Message\s*-{2,}/i,                      // Outlook classic
    /(^|\n)\s*-{2,}\s*Forwarded message\s*-{2,}/i,                     // Gmail forward
    /\n\s*From:\s[^\n]*@[^\n]*\n\s*(Sent|Date|To):/i,                  // Outlook header block
    /\n\s*_{10,}\s*\n/,                                                // Outlook separator
    /(^|\n)\s*Le\s[^\n]{5,200}?\sa\s[eé]crit\s*:/i,                    // French clients
  ];
  var cut = text.length;
  for (var c = 0; c < cutters.length; c++) {
    var m = text.match(cutters[c]);
    if (m && m.index != null && m.index > 0 && m.index < cut) cut = m.index;
  }
  text = text.slice(0, cut);

  // Drop any remaining ">"-quoted lines and trailing signature.
  var lines = text.split("\n");
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    if (/^\s*>/.test(lines[i])) continue;
    out.push(lines[i]);
  }
  var cleaned = out.join("\n").trim();
  cleaned = cleaned.replace(/\n--\s*\n[\s\S]*$/, "").trim();
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.slice(0, 3000);
}

/**
 * One-line summary of what the founder wrote back. Uses Claude; returns ""
 * on any failure so callers fall back to the raw reply.
 */
function summarizeReply_(replyText) {
  var text = String(replyText || "").trim();
  if (!text) return "";
  if (!ANTHROPIC_API_KEY) return "";
  var prompt =
    "A founder replied to our 'Request Info' email. Summarize ONLY what they " +
    "said in 1-2 sentences for a VC dashboard: what they shared (deck, team, " +
    "stage, traction, links) and any ask. No preamble, no greeting.\n\n" +
    "REPLY:\n" + text.slice(0, 4000);
  try {
    var res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      contentType: "application/json",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": CONFIG.ANTHROPIC_VERSION,
      },
      payload: JSON.stringify({
        model: CONFIG.MODEL,
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      Logger.log("summarizeReply_ HTTP " + res.getResponseCode());
      return "";
    }
    var data = JSON.parse(res.getContentText());
    var t = data && data.content && data.content[0] ? data.content[0].text : "";
    return String(t || "").trim();
  } catch (err) {
    Logger.log("summarizeReply_ error: " + err);
    return "";
  }
}

/**
 * DIAGNOSTIC — run this from the editor to test the whole reply pipe for one
 * founder. Edit the email below, press Run, and read the Logs.
 */
function testInfoReplyForSender() {
  var email = "fenil@tuningengines.com"; // ← change to the founder you're testing
  var row = findExistingFounderRow_(email);
  Logger.log("Sheet row for " + email + ": " + row + (row ? "" : " (not found on sheet)"));
  Logger.log("SYNC_SECRET set: " + (getProp_("SYNC_SECRET") ? "yes" : "NO — set it in Script Properties"));
  var threads = GmailApp.search("from:" + email + " newer_than:60d", 0, 3);
  if (!threads.length) {
    Logger.log("No recent mail found from " + email);
    return;
  }
  var msgs = threads[0].getMessages();
  var last = msgs[msgs.length - 1];
  notifyInfoReply_(email, last.getSubject() || "", last.getPlainBody() || "", row);
}

/**
 * Replies land on the ORIGINAL processed thread (agent/processed), so the
 * normal inbox query never sees them. Scan founder threads for a new inbound
 * last-message and flag Request Info deals on the portal.
 */
function catchFounderReplies_() {
  // 1) Direct replies to the portal's Request Info email. These are NEW
  //    threads (sent via Resend, so Gmail can't thread them) — the primary path.
  scanForFounderReplies_(CONFIG.REQUEST_INFO_REPLY_QUERY + " newer_than:30d", 60, "catch/subject", true);
  // 2) Follow-ups landing on an already-labeled founder thread.
  scanForFounderReplies_(
    "label:" + CONFIG.LABELS.FOUNDER + " -from:me newer_than:21d",
    40,
    "catch/label"
  );
}

/**
 * Shared scanner: for each thread matching `query`, find the founder's LATEST
 * inbound message (the last message may be our own outgoing reply), and flag
 * it to the portal once. Dedup via Script Properties keyed by thread+message.
 * Also stamps the founder/processed labels so the hourly inbox scan never
 * re-classifies a Request Info reply as a brand-new pitch.
 * Returns { scanned, posted, skipped }.
 */
function scanForFounderReplies_(query, maxThreads, tag, retryMarked) {
  const props = PropertiesService.getScriptProperties();
  const labels = getLabels_();
  const PAGE = 50;
  let start = 0;
  let scanned = 0, posted = 0, skipped = 0, failed = 0;

  while (start < maxThreads) {
    const threads = GmailApp.search(query, start, Math.min(PAGE, maxThreads - start));
    if (!threads.length) break;

    for (let i = 0; i < threads.length; i++) {
      scanned++;
      try {
        const thread = threads[i];
        const messages = thread.getMessages();

        let founderMsg = null;
        let senderEmail = "";
        for (let m = messages.length - 1; m >= 0; m--) {
          const email = parseEmailAddress_(
            messages[m].getReplyTo() || messages[m].getFrom() || ""
          );
          if (email && !isInternalSender_(email)) {
            founderMsg = messages[m];
            senderEmail = email;
            break;
          }
        }
        if (!founderMsg) continue;

        const key = "infoReplyMsg:" + thread.getId() + ":" + founderMsg.getId();
        const prev = props.getProperty(key);
        // "ok" = portal actually wrote. Old runs stamped "1" even on 401 /
        // not_request_info, which is why backfill looked done but TOFU stayed empty.
        // retryMarked (subject backfill) re-posts those.
        if (prev === "ok" || (prev === "1" && !retryMarked)) { skipped++; continue; }

        const existingRow = findFounderRowAnytime_(senderEmail);
        if (existingRow > 0) claimRowIfUnowned_(existingRow);
        const result = notifyInfoReply_(
          senderEmail,
          thread.getFirstMessageSubject() || founderMsg.getSubject() || "",
          founderMsg.getPlainBody() || "",
          existingRow
        );
        // Always label so processInbox doesn't ingest the reply as a new pitch.
        try {
          thread.addLabel(labels[CONFIG.LABELS.FOUNDER]);
          thread.addLabel(labels[CONFIG.LABELS.PROCESSED]);
        } catch (e) { /* label races are non-fatal */ }
        if (result && result.ok) {
          props.setProperty(key, "ok");
          posted++;
          Logger.log("[" + tag + "] posted " + senderEmail + " row=" + (result.rowIndex || existingRow));
        } else {
          failed++;
          Logger.log("[" + tag + "] FAIL " + senderEmail + " row=" + existingRow + " reason=" + ((result && result.reason) || "unknown"));
        }
      } catch (err) {
        failed++;
        Logger.log("[" + tag + "] error: " + err);
      }
    }

    if (threads.length < PAGE) break;
    start += PAGE;
  }
  return { scanned: scanned, posted: posted, skipped: skipped, failed: failed };
}

/**
 * ONE-SHOT BACKFILL — run manually from the Apps Script editor.
 *
 * Finds EVERY founder reply to the Request Info email (no date window) plus
 * follow-ups on founder-labeled threads, and flags each to the portal. Skips
 * anything already posted (same dedup keys as the hourly catcher), so
 * re-running only picks up what's new. Non-Request-Info deals are harmless
 * no-ops — the portal only records replies for that bucket.
 *
 * Safe to run repeatedly. If it hits the ~6-min execution limit, run it again;
 * the dedup keys make it resume where it left off.
 */
function backfillFounderReplies() {
  ensureLabelsExist_();
  const secretOn = String(getProp_("SYNC_SECRET") || "").trim() ? "yes" : "NO — set Script Property SYNC_SECRET";
  Logger.log("backfillFounderReplies start · SYNC_SECRET=" + secretOn + " · portal=" + CONFIG.PORTAL_URL);
  // retryMarked=true on the subject scan so earlier failed posts (key="1") get a real write.
  const a = scanForFounderReplies_(CONFIG.REQUEST_INFO_REPLY_QUERY, 500, "backfill/subject", true);
  const b = scanForFounderReplies_("label:" + CONFIG.LABELS.FOUNDER + " -from:me", 1000, "backfill/label", false);
  Logger.log(
    "backfillFounderReplies DONE — subject: scanned=" + a.scanned + " posted=" + a.posted + " skipped=" + a.skipped + " failed=" + a.failed +
    " | label: scanned=" + b.scanned + " posted=" + b.posted + " skipped=" + b.skipped + " failed=" + b.failed
  );
}

function isInternalSender_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return true;
  if (e.indexOf("@allincapital.vc") !== -1) return true;
  if (e === "vcadityasingh@gmail.com") return true;
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-pass replies (intern / vendor only) — Aditya's inbox only. Banker is ignored.
// ────────────────────────────────────────────────────────────────────────────

function sendPassReply_(thread, lastMsg, kind) {
  const html = templateAutoPass_(kind);
  const options = {
    htmlBody: html,
    name: "All In Capital",
    replyTo: CONFIG.REPLY_TO,
  };
  if (CONFIG.TEAM_FROM_ALIAS) options.from = CONFIG.TEAM_FROM_ALIAS;
  try {
    thread.reply("", options);
  } catch (err) {
    Logger.log("sendPassReply_ error: " + err);
  }
}

/**
 * Collaboration / partnership inbound → reply with the team email only.
 * Replies to the sender only (no CC), from the running account (adityasingh@).
 */
function sendCollaborationReply_(thread, lastMsg) {
  const html = templateCollaboration_();
  const options = {
    htmlBody: html,
    name: "All In Capital",
    replyTo: CONFIG.REPLY_TO,
  };
  if (CONFIG.TEAM_FROM_ALIAS) options.from = CONFIG.TEAM_FROM_ALIAS;
  try {
    thread.reply("", options);
  } catch (err) {
    Logger.log("sendCollaborationReply_ error: " + err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Digest
// ────────────────────────────────────────────────────────────────────────────

function queueForDigest_(thread, subject, result) {
  const labels = getLabels_();
  thread.addLabel(labels[CONFIG.LABELS.DIGEST_QUEUE]);
  const desc = (result && result.summary) ? result.summary : subject;
  // Persist a one-line description keyed by thread id.
  const props = PropertiesService.getScriptProperties();
  props.setProperty("digest:" + thread.getId(), String(desc).slice(0, 240));
}

function buildDigestHTML_() {
  const stats = getDailyStats_();
  const awaiting = getAwaitingActionRows_();
  const sheetUrl =
    "https://docs.google.com/spreadsheets/d/" + FOUNDER_SHEET_ID + "/edit";

  const parts = [];
  parts.push('<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;max-width:640px;">');
  parts.push('<h2 style="margin:0 0 4px;">Your daily deal digest</h2>');
  parts.push('<p style="color:#6b7280;margin:0 0 18px;">' + formatDateIST_(new Date()) + '</p>');

  if (awaiting.length > 0) {
    parts.push('<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;margin-bottom:16px;">');
    parts.push('<strong>⚠️ Awaiting your action (' + awaiting.length + ')</strong>');
    parts.push('<div style="margin-top:6px;">' + awaiting.map(function (a) {
      return '· ' + escapeHtml_(a.company || a.name || a.email);
    }).join('<br/>') + '</div>');
    parts.push('<div style="margin-top:8px;"><a href="' + sheetUrl + '">Open the sheet →</a></div>');
    parts.push('</div>');
  }

  parts.push('<h3 style="margin:16px 0 6px;">Today at a glance</h3>');
  parts.push('<ul style="margin:0 0 12px;padding-left:18px;">');
  parts.push('<li>Founders logged: <strong>' + stats.founders + '</strong></li>');
  parts.push('<li>Auto-passed (intern/vendor): <strong>' + stats.autopassed + '</strong></li>');
  parts.push('</ul>');

  if (stats.needsReview.length > 0) {
    parts.push('<h3 style="margin:16px 0 6px;">Needs your eyes</h3>');
    parts.push('<ul style="margin:0 0 12px;padding-left:18px;">');
    stats.needsReview.forEach(function (s) {
      parts.push('<li>' + escapeHtml_(s) + '</li>');
    });
    parts.push('</ul>');
  }

  const other = getDigestQueueDescriptions_();
  if (other.length > 0) {
    parts.push('<h3 style="margin:16px 0 6px;">Other (FYI)</h3>');
    parts.push('<ul style="margin:0 0 12px;padding-left:18px;">');
    other.forEach(function (o) {
      parts.push('<li>' + escapeHtml_(o) + '</li>');
    });
    parts.push('</ul>');
  }

  parts.push('</div>');
  return parts.join('');
}

function getDailyStats_() {
  const labels = getLabels_();
  const founders = countThreadsWithLabelSince_(CONFIG.LABELS.FOUNDER, 1);
  const autopassed =
    countThreadsWithLabelSince_(CONFIG.LABELS.INTERN, 1) +
    countThreadsWithLabelSince_(CONFIG.LABELS.VENDOR, 1);

  const needsReview = [];
  const nr = GmailApp.search("label:" + CONFIG.LABELS.NEEDS_REVIEW + " newer_than:1d", 0, 15);
  nr.forEach(function (t) {
    needsReview.push(t.getFirstMessageSubject() || "(no subject)");
  });

  return { founders: founders, autopassed: autopassed, needsReview: needsReview };
}

/** Founder rows this agent owns that have been unactioned for >48h. */
function getAwaitingActionRows_() {
  const sheet = getDataSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const numRows = lastRow - 1;
  const values = sheet.getRange(2, 1, numRows, COL._WIDTH).getValues();
  const cutoff = Date.now() - 48 * 3600 * 1000;

  const out = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const owner = String(row[COL.OWNER - 1] || "").trim().toLowerCase();
    if (owner !== CONFIG.OWNER) continue;
    const action = String(row[COL.ACTION - 1] || "").trim();
    if (action) continue; // already decided
    const ms = parseDateMs_(row[COL.DATE_RECEIVED - 1]);
    if (ms == null || ms > cutoff) continue; // still fresh
    out.push({
      company: String(row[COL.COMPANY - 1] || ""),
      name: String(row[COL.NAME - 1] || ""),
      email: String(row[COL.SENDER_EMAIL - 1] || ""),
    });
  }
  return out;
}

function getDigestQueueDescriptions_() {
  const threads = GmailApp.search("label:" + CONFIG.LABELS.DIGEST_QUEUE, 0, 30);
  const props = PropertiesService.getScriptProperties();
  return threads.map(function (t) {
    return props.getProperty("digest:" + t.getId()) || t.getFirstMessageSubject() || "(item)";
  });
}

function markDigestQueueSent_() {
  const labels = getLabels_();
  const threads = GmailApp.search("label:" + CONFIG.LABELS.DIGEST_QUEUE, 0, 100);
  threads.forEach(function (t) {
    t.removeLabel(labels[CONFIG.LABELS.DIGEST_QUEUE]);
    t.addLabel(labels[CONFIG.LABELS.DIGEST_SENT]);
    PropertiesService.getScriptProperties().deleteProperty("digest:" + t.getId());
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Archive sweeps
// ────────────────────────────────────────────────────────────────────────────

function archiveStaleFollowups_() {
  const hrs = CONFIG.STALE_FOLLOWUP_HOURS;
  const buckets = [CONFIG.LABELS.INTERN, CONFIG.LABELS.VENDOR, CONFIG.LABELS.COLLABORATION, CONFIG.LABELS.ACTIONED];
  const cutoff = Date.now() - hrs * 3600 * 1000;
  buckets.forEach(function (label) {
    const threads = GmailApp.search("label:" + label + " in:inbox", 0, 50);
    threads.forEach(function (t) {
      if (t.getLastMessageDate().getTime() < cutoff) t.moveToArchive();
    });
  });
}

function archivePapermark_() {
  const cutoff = Date.now() - CONFIG.PAPERMARK_HOURS * 3600 * 1000;
  const threads = GmailApp.search("from:papermark.io in:inbox", 0, 50);
  threads.forEach(function (t) {
    if (t.getLastMessageDate().getTime() < cutoff) t.moveToArchive();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Claude classify + extract
// ────────────────────────────────────────────────────────────────────────────

function classifyEmail_(subject, from, body) {
  const apiKey = ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const prompt = buildClassifierPrompt_(subject, from, body);
  const payload = {
    model: CONFIG.MODEL,
    max_tokens: CONFIG.MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  };

  let res;
  try {
    res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      contentType: "application/json",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": CONFIG.ANTHROPIC_VERSION,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (err) {
    Logger.log("Claude fetch failed: " + err);
    return { bucket: "other", confidence: 0 };
  }

  if (res.getResponseCode() !== 200) {
    Logger.log("Claude HTTP " + res.getResponseCode() + ": " + res.getContentText().slice(0, 300));
    return { bucket: "other", confidence: 0 };
  }

  try {
    const data = JSON.parse(res.getContentText());
    const text = data && data.content && data.content[0] ? data.content[0].text : "";
    return parseClassifierJson_(text);
  } catch (err) {
    Logger.log("Claude parse failed: " + err);
    return { bucket: "other", confidence: 0 };
  }
}

function parseClassifierJson_(text) {
  let t = String(text || "").trim();
  // Strip code fences if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) return { bucket: "other", confidence: 0 };
  try {
    const obj = JSON.parse(t.slice(start, end + 1));
    obj.bucket = String(obj.bucket || "other").toLowerCase();
    obj.confidence = typeof obj.confidence === "number" ? obj.confidence : 0;
    return obj;
  } catch (err) {
    return { bucket: "other", confidence: 0 };
  }
}

function buildClassifierPrompt_(subject, from, body) {
  return (
    CLASSIFIER_PROMPT +
    "\n\n---\nEMAIL TO CLASSIFY\n" +
    "Subject: " + subject + "\n" +
    "From: " + from + "\n" +
    "Body:\n" + String(body || "").slice(0, 6000) +
    "\n---\n\nReturn ONLY the JSON object."
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Email templates  (edit copy inline)
// ────────────────────────────────────────────────────────────────────────────

function wrap_(inner) {
  return (
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">' +
    inner +
    "</div>"
  );
}

function templateAutoPass_(kind) {
  const form = (CONFIG.INTERN_FORM_URL || "").trim();
  const extra = kind === "intern" && form
    ? "<p>If you'd like to be considered for future roles, please share your details here: " +
      '<a href="' + escapeHtml_(form) + '">' + escapeHtml_(form) + "</a>.</p>"
    : "";
  return wrap_(
    "<p>Hi,</p>" +
    "<p>Thanks for reaching out. We're not able to take this forward right now, but we appreciate you thinking of All In Capital.</p>" +
    extra +
    "<p>Best,<br/>All In Capital</p>"
  );
}

function templateCollaboration_() {
  return wrap_(
    "<p>Hi, thanks for reaching out. Please email us at " +
    '<a href="mailto:vcadityasingh@gmail.com">vcadityasingh@gmail.com</a>.</p>'
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────────────

function getProp_(key) {
  const fromProps = PropertiesService.getScriptProperties().getProperty(key);
  if (fromProps) return fromProps;
  if (CONFIG[key]) return String(CONFIG[key]);
  return "";
}

/**
 * Label and stop. No reply, no sheet row, no digest, no archive.
 * Leaves the thread in the inbox so Aditya can handle it himself.
 */
function ignoreThread_(thread, labels, labelName) {
  if (labelName && labels[labelName]) thread.addLabel(labels[labelName]);
  Logger.log("Ignored (no agent action): " + (thread.getFirstMessageSubject() || ""));
}

/**
 * Deterministic backstop: true if the email is a banker / deal-flow /
 * co-invest / investor-relationship outreach. Those must never get an
 * auto-reply from this agent.
 *
 * Do NOT use on founder_direct — founder pitches routinely mention fundraising.
 */
function isInvestorRelations_(subject, body) {
  const text = (String(subject || "") + " " + String(body || "")).toLowerCase();
  const patterns = [
    "deal flow", "dealflow", "deal-flow",
    "co-invest", "coinvest", "co invest",
    "syndicate", "spv",
    "capital advisory", "investor readiness",
    "fund of funds", "fund-to-fund",
    "share opportunities", "share relevant opportunities", "our pipeline",
    "investment thesis", "family office",
    "angel network", "scout program", "sourcing deals", "source deals",
    "investment opportunities", "deal-flow collaboration", "deal flow collaboration",
  ];
  for (var i = 0; i < patterns.length; i++) {
    if (text.indexOf(patterns[i]) !== -1) return true;
  }
  return false;
}

/**
 * Media / PR / comms / brand partnership — collaboration reply.
 * Catches agencies (e.g. ARKA Communication) that the classifier may call "vendor"
 * just because they work in PR.
 */
function isBrandCollaboration_(subject, from, body) {
  if (isInvestorRelations_(subject, body)) return false;
  const text = (
    String(subject || "") + " " +
    String(from || "") + " " +
    String(body || "")
  ).toLowerCase();

  const selling = [
    "retainer", "pricing", "our packages", "proposal attached",
    "subscribe to our", "buy our", "book a demo",
  ];
  for (var s = 0; s < selling.length; s++) {
    if (text.indexOf(selling[s]) !== -1) return false;
  }

  const agency = [
    "arka", "communication", "communications", "pr agency",
    "media house", "media agency", "comms",
  ];
  var looksAgency = false;
  for (var a = 0; a < agency.length; a++) {
    if (text.indexOf(agency[a]) !== -1) {
      looksAgency = true;
      break;
    }
  }

  const collab = [
    "collaboration", "collaborate", "partnership", "partner with",
    "media coverage", "press coverage", "brand partnership",
    "content collab", "media partnership", "cross-promotion",
    "co-host", "podcast", "feature all in",
  ];
  var looksCollab = false;
  for (var c = 0; c < collab.length; c++) {
    if (text.indexOf(collab[c]) !== -1) {
      looksCollab = true;
      break;
    }
  }

  const strongMedia = [
    "media coverage", "press coverage", "brand partnership",
    "content collab", "media partnership", "cross-promotion",
  ];
  var strong = false;
  for (var m = 0; m < strongMedia.length; m++) {
    if (text.indexOf(strongMedia[m]) !== -1) {
      strong = true;
      break;
    }
  }

  // Agency + collab language (ARKA Communication), or an explicit media/brand collab.
  return (looksAgency && looksCollab) || strong;
}

function tz_() {
  return Session.getScriptTimeZone() || "Asia/Kolkata";
}

function getDataSheet_() {
  const id = FOUNDER_SHEET_ID;
  if (!id) throw new Error("FOUNDER_SHEET_ID missing");
  const ss = SpreadsheetApp.openById(id);
  const named = ss.getSheetByName(CONFIG.SHEET_NAME);
  return named || ss.getSheets()[0];
}

function ensureLabelsExist_() {
  Object.keys(CONFIG.LABELS).forEach(function (k) {
    const name = CONFIG.LABELS[k];
    if (!GmailApp.getUserLabelByName(name)) GmailApp.createLabel(name);
  });
}

function getLabels_() {
  const map = {};
  Object.keys(CONFIG.LABELS).forEach(function (k) {
    const name = CONFIG.LABELS[k];
    map[name] = GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
  });
  return map;
}

function parseEmailAddress_(raw) {
  const s = String(raw || "");
  const m = s.match(/<([^>]+)>/);
  const email = (m ? m[1] : s).trim().toLowerCase();
  return email.indexOf("@") !== -1 ? email : "";
}

function countThreadsWithLabelSince_(label, days) {
  return GmailApp.search("label:" + label + " newer_than:" + days + "d", 0, 100).length;
}

function clean_(v) {
  return String(v == null ? "" : v)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, tz_(), "dd/MM/yyyy HH:mm:ss");
}

function formatDateIST_(date) {
  return Utilities.formatDate(date, tz_(), "EEEE, dd MMM yyyy");
}

function parseDateMs_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.getTime();
  if (typeof value === "number" && value > 0) {
    return Math.round((value - 25569) * 86400 * 1000);
  }
  const s = String(value || "").trim();
  // dd/MM/yyyy HH:mm:ss
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (m) {
    return new Date(
      Number(m[3]), Number(m[2]) - 1, Number(m[1]),
      Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)
    ).getTime();
  }
  const p = Date.parse(s);
  return isNaN(p) ? null : p;
}

function escapeHtml_(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ────────────────────────────────────────────────────────────────────────────
// Manual test helpers (Run these from the editor)
// ────────────────────────────────────────────────────────────────────────────

/**
 * ONE-TIME: scan all threads Aditya's agent labeled "agent/founder" and claim
 * their matching sheet rows if Owner is still blank. Run this once from the
 * editor to backfill deals that kb@ ingested before Aditya's agent existed.
 */
function reclaimUnownedDeals() {
  const sheet = getDataSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log("Sheet empty"); return; }
  const numRows = lastRow - 1;

  // Build a map: senderEmail → most recent row index (0-based)
  const emails = sheet.getRange(2, COL.SENDER_EMAIL, numRows, 1).getValues();
  const owners = sheet.getRange(2, COL.OWNER, numRows, 1).getValues();

  // Get all threads labeled agent/founder in Aditya's inbox
  var threads = [];
  var start = 0;
  while (true) {
    var batch = GmailApp.search("label:" + CONFIG.LABELS.FOUNDER, start, 100);
    if (batch.length === 0) break;
    threads = threads.concat(batch);
    start += batch.length;
    if (batch.length < 100) break;
  }
  Logger.log("Found " + threads.length + " threads with agent/founder label");

  // Collect sender emails from Aditya's labeled threads
  var adityaSenders = {};
  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();
    var msg = msgs[msgs.length - 1];
    var fromRaw = msg.getReplyTo() || msg.getFrom() || "";
    var sender = parseEmailAddress_(fromRaw);
    if (sender) adityaSenders[sender] = true;
  }
  Logger.log("Unique senders in Aditya's inbox: " + Object.keys(adityaSenders).length);

  // Claim unowned rows whose sender is in Aditya's inbox
  var claimed = 0;
  for (var i = 0; i < emails.length; i++) {
    var e = String(emails[i][0] || "").trim().toLowerCase();
    var o = String(owners[i][0] || "").trim();
    if (o) continue; // already owned
    if (!adityaSenders[e]) continue; // not in Aditya's inbox
    var row = i + 2;
    sheet.getRange(row, COL.OWNER).setValue(CONFIG.OWNER);
    sheet.getRange(row, COL.CHANNEL).setValue(CONFIG.CHANNEL);
    claimed++;
    Logger.log("Claimed row " + row + ": " + e);
  }
  Logger.log("Done — claimed " + claimed + " rows for owner=" + CONFIG.OWNER);
}

/**
 * ONE-TIME: re-process threads in Aditya's inbox that were labeled
 * agent/processed but never written (because dedup skipped them AND
 * the claim logic didn't exist). Removes the processed label so the
 * next processInbox run picks them up with the new claim-on-dedup logic.
 *
 * Run reclaimUnownedDeals INSTEAD — it's faster and doesn't re-classify.
 * Only use this if reclaimUnownedDeals missed some.
 */
function unlabelSkippedThreads() {
  var label = GmailApp.getUserLabelByName(CONFIG.LABELS.PROCESSED);
  var founderLabel = GmailApp.getUserLabelByName(CONFIG.LABELS.FOUNDER);
  if (!label || !founderLabel) { Logger.log("Labels not found"); return; }

  var threads = GmailApp.search(
    "label:" + CONFIG.LABELS.PROCESSED + " label:" + CONFIG.LABELS.FOUNDER, 0, 200
  );
  Logger.log("Found " + threads.length + " processed+founder threads");

  var sheet = getDataSheet_();
  var lastRow = sheet.getLastRow();
  var numRows = lastRow < 2 ? 0 : lastRow - 1;
  var ownerCol = numRows > 0 ? sheet.getRange(2, COL.OWNER, numRows, 1).getValues() : [];
  var emailCol = numRows > 0 ? sheet.getRange(2, COL.SENDER_EMAIL, numRows, 1).getValues() : [];

  var unlabeled = 0;
  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();
    var msg = msgs[msgs.length - 1];
    var sender = parseEmailAddress_(msg.getReplyTo() || msg.getFrom() || "");
    // Check if this sender's row is still unowned
    var unowned = false;
    for (var i = 0; i < emailCol.length; i++) {
      if (String(emailCol[i][0] || "").trim().toLowerCase() === sender &&
          !String(ownerCol[i][0] || "").trim()) {
        unowned = true;
        break;
      }
    }
    if (unowned) {
      threads[t].removeLabel(label);
      unlabeled++;
    }
  }
  Logger.log("Unlabeled " + unlabeled + " threads for reprocessing");
}

/**
 * FIX STUCK TOFU — run this from the editor after pasting this file.
 *
 * processInbox only looks at mail that is still unlabeled `agent/processed`.
 * Earlier runs labeled threads without writing Owner=aditya, so a later
 * processInbox is a no-op and Aditya's dashboard stays on the last card.
 *
 * This re-scans inbox + founder-labeled mail from the last 14 days (including
 * already-processed threads) and appends a new Owner=aditya row whenever this
 * inbox does not already have that founder. Does not send intern/vendor mail.
 */
function repairAdityaIngest() {
  ensureLabelsExist_();
  var labels = getLabels_();
  var seen = {};
  var appended = 0;
  var skippedOwned = 0;
  var skippedOther = 0;
  var errors = 0;

  function considerThread_(thread, tag) {
    try {
      var messages = thread.getMessages();
      if (!messages.length) return;
      var lastMsg = messages[messages.length - 1];
      var senderEmail = parseEmailAddress_(
        lastMsg.getReplyTo() || lastMsg.getFrom() || ""
      );
      if (!senderEmail || isInternalSender_(senderEmail)) {
        skippedOther++;
        return;
      }
      if (seen[senderEmail]) {
        skippedOwned++;
        return;
      }
      if (findOwnedFounderRow_(senderEmail, CONFIG.OWNER) > 0) {
        seen[senderEmail] = true;
        skippedOwned++;
        return;
      }

      var existingLabels = thread.getLabels().map(function (l) {
        return l.getName();
      });
      var isFounderLabel =
        existingLabels.indexOf(CONFIG.LABELS.FOUNDER) !== -1;
      var result = classifyEmail_(
        thread.getFirstMessageSubject() || "",
        lastMsg.getFrom() || "",
        lastMsg.getPlainBody() || ""
      );
      var bucket = (result && result.bucket) || "other";
      if (bucket !== "founder_direct" && bucket !== "founder_superdm") {
        if (isFounderLabel) {
          result = result || {};
          result.bucket = "founder_direct";
          if (!result.company) {
            result.company = thread.getFirstMessageSubject() || "";
          }
          bucket = "founder_direct";
        } else {
          skippedOther++;
          Logger.log(
            "[" + tag + "] skip bucket=" + bucket + " " + senderEmail + " · " +
            thread.getFirstMessageSubject()
          );
          return;
        }
      }

      appendFounderRow_(thread, senderEmail, result);
      seen[senderEmail] = true;
      thread.addLabel(labels[CONFIG.LABELS.FOUNDER]);
      thread.addLabel(labels[CONFIG.LABELS.PROCESSED]);
      appended++;
    } catch (err) {
      errors++;
      Logger.log("[" + tag + "] error: " + err);
    }
  }

  var founderThreads = GmailApp.search(
    "label:" + CONFIG.LABELS.FOUNDER + " -from:me newer_than:14d",
    0,
    100
  );
  Logger.log("repair founder-labeled threads=" + founderThreads.length);
  for (var f = 0; f < founderThreads.length; f++) {
    considerThread_(founderThreads[f], "founder");
  }

  var inboxThreads = GmailApp.search("in:inbox -from:me newer_than:14d", 0, 100);
  Logger.log("repair inbox threads=" + inboxThreads.length);
  for (var i = 0; i < inboxThreads.length; i++) {
    considerThread_(inboxThreads[i], "inbox");
  }

  Logger.log(
    "repairAdityaIngest DONE appended=" + appended +
    " skippedAlreadyOnAdityaTofu=" + skippedOwned +
    " skippedOther=" + skippedOther +
    " errors=" + errors
  );
}

function diagnoseMissedThreads() {
  // 1. Threads already processed
  var processed = GmailApp.search("label:" + CONFIG.LABELS.PROCESSED, 0, 200);
  Logger.log("=== PROCESSED THREADS (" + processed.length + ") ===");
  for (var p = 0; p < processed.length; p++) {
    var t = processed[p];
    var labels = t.getLabels().map(function(l) { return l.getName(); });
    var msgs = t.getMessages();
    var last = msgs[msgs.length - 1];
    var sender = parseEmailAddress_(last.getReplyTo() || last.getFrom() || "");
    var bucketLabel = "?";
    if (labels.indexOf(CONFIG.LABELS.FOUNDER) !== -1) bucketLabel = "FOUNDER";
    else if (labels.indexOf(CONFIG.LABELS.BANKER) !== -1) bucketLabel = "BANKER";
    else if (labels.indexOf(CONFIG.LABELS.IGNORED) !== -1) bucketLabel = "IGNORED";
    else if (labels.indexOf(CONFIG.LABELS.INTERN) !== -1) bucketLabel = "INTERN";
    else if (labels.indexOf(CONFIG.LABELS.VENDOR) !== -1) bucketLabel = "VENDOR";
    else if (labels.indexOf(CONFIG.LABELS.COLLABORATION) !== -1) bucketLabel = "COLLABORATION";
    else if (labels.indexOf(CONFIG.LABELS.NEWSLETTER) !== -1) bucketLabel = "NEWSLETTER";
    else if (labels.indexOf(CONFIG.LABELS.DIGEST_QUEUE) !== -1 ||
             labels.indexOf(CONFIG.LABELS.DIGEST_SENT) !== -1) bucketLabel = "OTHER/DIGEST";
    Logger.log("  [" + bucketLabel + "] " + t.getFirstMessageSubject() + " | " + sender);
  }

  // 2. Threads still unprocessed in inbox
  var query = "in:inbox -label:" + CONFIG.LABELS.PROCESSED + " -from:me";
  var unprocessed = GmailApp.search(query, 0, 100);
  Logger.log("\n=== UNPROCESSED IN INBOX (" + unprocessed.length + ") ===");
  for (var u = 0; u < unprocessed.length; u++) {
    var t2 = unprocessed[u];
    var msgs2 = t2.getMessages();
    var last2 = msgs2[msgs2.length - 1];
    var sender2 = parseEmailAddress_(last2.getReplyTo() || last2.getFrom() || "");
    Logger.log("  " + t2.getFirstMessageSubject() + " | " + sender2 + " | msgs:" + msgs2.length);
  }

  // 3. Check ALL mail (not just inbox) for unprocessed — catches archived ones
  var queryAll = "-label:" + CONFIG.LABELS.PROCESSED + " -from:me -in:sent -in:draft -in:trash newer_than:14d";
  var allUnprocessed = GmailApp.search(queryAll, 0, 100);
  var outsideInbox = [];
  for (var a = 0; a < allUnprocessed.length; a++) {
    var t3 = allUnprocessed[a];
    if (!t3.isInInbox()) {
      var msgs3 = t3.getMessages();
      var last3 = msgs3[msgs3.length - 1];
      var sender3 = parseEmailAddress_(last3.getReplyTo() || last3.getFrom() || "");
      outsideInbox.push(t3.getFirstMessageSubject() + " | " + sender3);
    }
  }
  if (outsideInbox.length > 0) {
    Logger.log("\n=== UNPROCESSED BUT NOT IN INBOX (archived/tabbed?) (" + outsideInbox.length + ") ===");
    outsideInbox.forEach(function(s) { Logger.log("  " + s); });
  }

  // 4. Threads that hit errors (processed but no bucket label)
  Logger.log("\n=== PROCESSED BUT NO BUCKET LABEL (possible errors) ===");
  for (var e = 0; e < processed.length; e++) {
    var te = processed[e];
    var lbls = te.getLabels().map(function(l) { return l.getName(); });
    var hasBucket = [CONFIG.LABELS.FOUNDER, CONFIG.LABELS.BANKER, CONFIG.LABELS.IGNORED, CONFIG.LABELS.INTERN,
                     CONFIG.LABELS.VENDOR, CONFIG.LABELS.COLLABORATION, CONFIG.LABELS.NEWSLETTER, CONFIG.LABELS.DIGEST_QUEUE,
                     CONFIG.LABELS.DIGEST_SENT].some(function(b) { return lbls.indexOf(b) !== -1; });
    if (!hasBucket) {
      var msgsE = te.getMessages();
      var lastE = msgsE[msgsE.length - 1];
      Logger.log("  " + te.getFirstMessageSubject() + " | " + parseEmailAddress_(lastE.getFrom() || ""));
    }
  }
}

function testClassifyOne() {
  const r = classifyEmail_(
    "Raising pre-seed for our AI tool",
    "Founder <founder@example.com>",
    "Hi, we're building an AI copilot for chip designers. Deck: https://example.com/deck. Raising $500k."
  );
  Logger.log(JSON.stringify(r, null, 2));
}

function testDigest() {
  Logger.log(buildDigestHTML_());
}

// ────────────────────────────────────────────────────────────────────────────
// Classifier prompt — add worked examples from real misclassifications here.
// ────────────────────────────────────────────────────────────────────────────

const CLASSIFIER_PROMPT =
`You are the inbound-email triage agent for All In Capital, an early-stage VC fund.
Classify ONE email into exactly one bucket and extract founder fields when relevant.

Return ONLY a JSON object with this shape:
{
  "bucket": "founder_direct | banker | intern | vendor | collaboration | newsletter | other",
  "confidence": 0.0-1.0,
  "name": "founder full name or ''",
  "company": "startup name or ''",
  "sector": "one-word sector or ''",
  "website": "url or ''",
  "deck_link": "deck url or ''",
  "blurb": "one-line what-they-do or ''",
  "summary": "2-3 sentence summary (for 'other', describe what the email is) or ''",
  "linkedin": "founder LinkedIn /in/ url or ''",
  "elite_school": "Yes if IIT/IIM/ISB/BITS/Harvard/Stanford/MIT/Oxford/Cambridge etc, else ''"
}

BUCKET RULES
- founder_direct: A founder pitching their OWN startup for investment. Extract all fields.
- banker: An investment banker / advisory / broker pitching a THIRD-PARTY company's round, OR anyone reaching out for a deal-flow / co-invest / syndicate / investor-relationship collaboration. The agent IGNORES this bucket (no reply).
- intern: Any job or internship applicant (student or experienced) looking for a role.
- vendor: A company selling a paid service or tool (dev shops, data products, recruiting retainers, SaaS demos, priced PR retainers). If they are asking to partner / feature / co-create rather than buy their service, that is collaboration, NOT vendor.
- collaboration: Brand, media, PR/comms, content, podcast, newsletter, event, or community partnership — including agencies like ARKA Communication proposing a collab, coverage, or intro to their partnerships person. NOT for deal-flow / co-invest / capital advisory.
- other: Legal, portfolio updates, warm intros, LP comms, personal, or anything that doesn't fit above. Put a one-line description in "summary".
- newsletter: Newsletters, mailing lists, and automated product notifications (Papermark, DocSend, Calendly, etc.).

CRITICAL: The word "collaboration" or "partnership" alone does NOT mean the collaboration bucket. If the email is about DEAL FLOW, INVESTING, CO-INVESTING, SYNDICATES, capital advisory, or sharing startups/opportunities between investors → it is "banker", never "collaboration" and never "other".

GUIDANCE
- A founder describing their industry ("we're in fintech for banks") is founder_direct, NOT banker.
- If unsure between founder_direct and banker, look at whether the sender IS the founder/operator.
- Set a low confidence (<0.6) when genuinely ambiguous.

EXAMPLES

Example 1
Subject: Raising our pre-seed — AI for radiologists
From: Priya <priya@scanwell.ai>
Body: We're building an AI copilot for radiologists in the US. Deck: https://scanwell.ai/deck. IIT Delhi grads.
Output: {"bucket":"founder_direct","confidence":0.95,"name":"Priya","company":"Scanwell","sector":"health","website":"https://scanwell.ai","deck_link":"https://scanwell.ai/deck","blurb":"AI copilot for radiologists","summary":"US-focused AI copilot for radiologists, from IIT Delhi founders, raising pre-seed.","linkedin":"","elite_school":"Yes"}

Example 2
Subject: Exclusive opportunity — Series A in logistics
From: Rahul <rahul@dealadvisory.com>
Body: We are advising a fast-growing logistics company raising their Series A and thought All In might be interested.
Output: {"bucket":"banker","confidence":0.9,"name":"","company":"","sector":"","website":"","deck_link":"","blurb":"","summary":"Advisory firm pitching a third-party logistics Series A.","linkedin":"","elite_school":""}

Example 3
Subject: Application for internship
From: Aditi <aditi@gmail.com>
Body: I'm a final-year student keen to intern with your investment team.
Output: {"bucket":"intern","confidence":0.96,"name":"","company":"","sector":"","website":"","deck_link":"","blurb":"","summary":"Student seeking an internship on the investment team.","linkedin":"","elite_school":""}

Example 4
Subject: Partnership / collaboration opportunity
From: Neha <neha@brandco.com>
Body: We'd love to explore a collaboration between our community and All In Capital — maybe a co-hosted event or cross-promotion.
Output: {"bucket":"collaboration","confidence":0.9,"name":"","company":"","sector":"","website":"","deck_link":"","blurb":"","summary":"Proposing a community collaboration / co-hosted event with All In Capital.","linkedin":"","elite_school":""}

Example 5
Subject: Potential Deal Flow Collaboration — ZTH x All In Capital
From: Sankalp <sankalp@zth.com>
Body: I'm Co-Founder at ZTH. We work with startups across fundraising, investor readiness and capital advisory. I'd be keen to explore a deal-flow collaboration where we share relevant opportunities from our pipeline that align with All In Capital's thesis. Open to a quick call next week?
Output: {"bucket":"banker","confidence":0.9,"name":"","company":"","sector":"","website":"","deck_link":"","blurb":"","summary":"Capital-advisory firm (ZTH) proposing an ongoing deal-flow-sharing relationship and requesting a call — ignore, no agent reply.","linkedin":"","elite_school":""}

Example 6
Subject: Collaboration — ARKA Communication x All In Capital
From: Rhea <rhea@arkacommunication.com>
Body: ARKA Communication here. We'd love to explore a collaboration — media coverage, content, or a brand partnership with All In Capital. Open to connecting with the right person on your team.
Output: {"bucket":"collaboration","confidence":0.92,"name":"","company":"","sector":"","website":"","deck_link":"","blurb":"","summary":"Comms/PR agency proposing a media or brand collaboration — route to partnerships, not a vendor pass.","linkedin":"","elite_school":""}
`;
