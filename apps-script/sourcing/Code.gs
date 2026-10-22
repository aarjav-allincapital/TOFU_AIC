/**
 * All In Capital — Deal Sourcing (Mitra)
 *
 * Completely separate from the inbound Founders sheet.
 * Run this on the Google account that should own sourcing (not kb@ ingest).
 *
 * 1. Paste this file into a new Apps Script project (or Extensions → Apps Script
 *    on a blank spreadsheet).
 * 2. Run setupSourcingWorkbook — creates / formats the workbook.
 * 3. Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 4. Put the Sheet ID + Web App URL in TOFU as SOURCING_SHEET_ID and
 *    SOURCING_APPS_SCRIPT_URL.
 *
 * Mitra writes (or you paste) numbered founder blocks into the Mitra tab.
 * This script parses them into Sourced columns and rebuilds the Cards tab.
 */

var CONFIG = {
  SECRET_TOKEN: "",
  MITRA_TAB: "Mitra",
  SOURCED_TAB: "Sourced",
  CARDS_TAB: "Cards",
  SETUP_TAB: "Setup",
  /**
   * Optional Gmail ingest on this account. Leave empty to skip.
   * Example: 'from:mitra.run OR subject:"deal sourcing" newer_than:21d'
   */
  GMAIL_QUERY: "",
  PROCESSED_LABEL: "agent/sourcing-processed",
};

var SOURCED_HEADERS = [
  "Added at",
  "#",
  "Founder",
  "Company",
  "Company note",
  "LinkedIn",
  "Domain",
  "Stage & founding timeline",
  "Funding",
  "Pedigree",
  "Raw",
  "Status",
  "Notes",
];

var STATUSES = ["New", "Watching", "Outreach", "Passed"];

var EXAMPLE_MITRA =
  "1. Pradyumna Vyshnav | Stealth Startup (Uncharted AI)\n" +
  "Profile URL: LinkedIn Profile\n" +
  "Domain / What they are building: Space Robotics & Autonomous Resource Discovery\n" +
  "Stage & Founding Timeline: Stealth / Just Started Building (Incubating via ARTPARK / Antler DeepTech residency)\n" +
  "Funding Status: Strictly Unfunded / Zero VC raised (pre-seed incubation)\n" +
  "Pedigree & Traction / Verification: Aerospace background, AIAA Outstanding Paper Award recipient, KARI Student Scholar, ISRO semi-finalist. Building dual-use autonomous robotic systems for terrestrial extreme environments and planetary exploration.";

var HEADER_RE = /^\s*(\d+)\.\s*(.+?)\s*\|\s*(.+?)\s*$/;

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("Deal Sourcing")
      .addItem("Process Mitra dump", "processMitraTab")
      .addItem("Rebuild card view", "rebuildCards")
      .addItem("Seed example founder", "seedExample")
      .addSeparator()
      .addItem("Install hourly trigger", "installTriggers")
      .addToUi();
  } catch (err) {
    // Standalone projects have no UI until bound to the sheet.
  }
}

/**
 * Creates the sourcing workbook (or formats the active one) and seeds
 * the example Mitra block so you can verify cards immediately.
 */
function setupSourcingWorkbook() {
  var ss = getOrCreateSpreadsheet_();
  PropertiesService.getScriptProperties().setProperty(
    "SOURCING_SHEET_ID",
    ss.getId(),
  );
  ensureTabs_(ss);
  seedExampleIfEmpty_(ss);
  processMitraTab();
  Logger.log("Sourcing sheet URL: " + ss.getUrl());
  Logger.log("Sourcing sheet ID: " + ss.getId());
  return { sheetId: ss.getId(), url: ss.getUrl() };
}

function processMitraTab() {
  var ss = getSpreadsheet_();
  var mitra = ss.getSheetByName(CONFIG.MITRA_TAB);
  var blob = collectMitraBlob_(mitra);
  if (!blob.trim()) {
    Logger.log("Mitra tab is empty.");
    return { upserted: 0 };
  }
  var result = ingestText_(blob);
  rebuildCards();
  Logger.log("Upserted " + result.upserted + " sourced founders.");
  return result;
}

function seedExample() {
  var ss = getSpreadsheet_();
  ensureTabs_(ss);
  appendMitraDump_(ss, EXAMPLE_MITRA);
  return processMitraTab();
}

function rebuildCards() {
  var ss = getSpreadsheet_();
  var sourced = ss.getSheetByName(CONFIG.SOURCED_TAB);
  var cards = ss.getSheetByName(CONFIG.CARDS_TAB);
  if (!sourced || !cards) return;
  cards.clear();
  cards.setHiddenGridlines(true);
  cards.setTabColor("111827");
  cards.getRange("A1:K1").setBackground("#f9fafb");

  var last = sourced.getLastRow();
  if (last < 2) {
    cards.getRange("B2").setValue("No sourced founders yet.").setFontColor("#6b7280");
    return;
  }

  var rows = sourced.getRange(2, 1, last - 1, SOURCED_HEADERS.length).getDisplayValues();
  var records = [];
  rows.forEach(function (row) {
    var rec = sourcedRowToRecord_(row);
    if (rec) records.push(rec);
  });

  var cardH = 11;
  var colsPerRow = 2;
  var startRows = [3, 3];
  var startCols = [2, 7];

  records.forEach(function (rec, i) {
    var colSlot = i % colsPerRow;
    var rowSlot = Math.floor(i / colsPerRow);
    var r = startRows[colSlot] + rowSlot * cardH;
    var c = startCols[colSlot];
    writeCard_(cards, r, c, rec);
  });

  cards.setColumnWidth(1, 24);
  cards.setColumnWidth(2, 220);
  cards.setColumnWidth(3, 220);
  cards.setColumnWidth(4, 140);
  cards.setColumnWidth(5, 16);
  cards.setColumnWidth(6, 24);
  cards.setColumnWidth(7, 220);
  cards.setColumnWidth(8, 220);
  cards.setColumnWidth(9, 140);
  cards.getRange("B2:D2")
    .merge()
    .setValue("Deal sourcing")
    .setFontWeight("bold")
    .setFontSize(16)
    .setFontColor("#111827");
  cards.getRange("G2:I2")
    .merge()
    .setValue(records.length + " founders · same fields as TOFU cards")
    .setFontColor("#6b7280")
    .setFontSize(10);
}

function doGet(e) {
  try {
    if (!authorize_(e)) {
      return jsonResponse_({ error: "Unauthorized" });
    }
    try {
      var mitra = getSpreadsheet_().getSheetByName(CONFIG.MITRA_TAB);
      var blob = collectMitraBlob_(mitra);
      if (blob && blob.trim()) ingestText_(blob);
    } catch (ingestErr) {
      Logger.log("doGet Mitra ingest skipped: " + ingestErr);
    }
    return jsonResponse_(getSourcingPayload_());
  } catch (err) {
    return jsonResponse_({
      error: "Failed to read sourcing sheet",
      detail: String(err),
    });
  }
}

function doPost(e) {
  try {
    if (!authorize_(e)) {
      return jsonResponse_({ error: "Unauthorized" });
    }
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        body = { text: e.postData.contents };
      }
    }
    var text = String(body.text || body.dump || "");
    if (!text.trim()) {
      return jsonResponse_({ error: "Missing text" });
    }
    appendMitraDump_(getSpreadsheet_(), text);
    var result = ingestText_(text);
    rebuildCards();
    return jsonResponse_({ ok: true, upserted: result.upserted, count: result.count });
  } catch (err) {
    return jsonResponse_({ error: "Ingest failed", detail: String(err) });
  }
}

function ingestFromGmail() {
  var query = (CONFIG.GMAIL_QUERY || "").trim();
  if (!query) {
    Logger.log("GMAIL_QUERY is empty — skip.");
    return { ingested: 0 };
  }
  var label = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  var threads = GmailApp.search(query + " -label:" + CONFIG.PROCESSED_LABEL, 0, 30);
  var n = 0;
  threads.forEach(function (thread) {
    var body = "";
    thread.getMessages().forEach(function (msg) {
      body += "\n" + (msg.getPlainBody() || msg.getBody() || "");
    });
    var parsed = parseMitraBlocks_(body);
    if (parsed.length === 0) {
      thread.addLabel(label);
      return;
    }
    appendMitraDump_(getSpreadsheet_(), parsed.map(function (p) { return p.raw; }).join("\n\n"));
    ingestText_(body);
    thread.addLabel(label);
    n += parsed.length;
  });
  if (n > 0) rebuildCards();
  return { ingested: n };
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === "processMitraTab" || fn === "ingestFromGmail") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("processMitraTab").timeBased().everyHours(1).create();
  if ((CONFIG.GMAIL_QUERY || "").trim()) {
    ScriptApp.newTrigger("ingestFromGmail").timeBased().everyHours(1).create();
  }
  Logger.log("Hourly processMitraTab installed.");
}

function getSourcingPayload_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(CONFIG.SOURCED_TAB);
  var sourced = [];
  if (sheet && sheet.getLastRow() >= 2) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, SOURCED_HEADERS.length).getDisplayValues();
    values.forEach(function (row, i) {
      var rec = sourcedRowToRecord_(row);
      if (!rec) return;
      rec.rowIndex = i + 2;
      rec.addedAtMs = parseDateMs_(row[0]);
      sourced.push(rec);
    });
  }
  sourced.sort(function (a, b) {
    return (b.rowIndex || 0) - (a.rowIndex || 0);
  });
  return {
    sourced: sourced,
    count: sourced.length,
    fetchedAt: new Date().toISOString(),
    configured: true,
    sheetUrl: ss.getUrl(),
    source: "apps-script",
  };
}

function ingestText_(text) {
  var parsed = parseMitraBlocks_(text);
  if (parsed.length === 0) return { upserted: 0, count: 0 };
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(CONFIG.SOURCED_TAB);
  var existing = indexSourced_(sheet);
  var upserted = 0;
  parsed.forEach(function (item) {
    var key = founderKey_(item.founder, item.company);
    var now = new Date();
    var row = [
      now,
      item.sourceIndex,
      item.founder,
      item.company,
      item.companyNote,
      item.linkedin,
      item.domain,
      item.stageTimeline,
      item.funding,
      item.pedigree,
      item.raw,
      "New",
      "",
    ];
    if (existing[key]) {
      var rowNum = existing[key];
      var current = sheet.getRange(rowNum, 1, 1, SOURCED_HEADERS.length).getValues()[0];
      row[0] = current[0] || now;
      row[11] = current[11] || "New";
      row[12] = current[12] || "";
      sheet.getRange(rowNum, 1, 1, SOURCED_HEADERS.length).setValues([row]);
    } else {
      sheet.appendRow(row);
      existing[key] = sheet.getLastRow();
    }
    upserted += 1;
  });
  return { upserted: upserted, count: sheet.getLastRow() - 1 };
}

function parseMitraBlocks_(text) {
  var lines = String(text || "").replace(/\r/g, "").split("\n");
  var starts = [];
  for (var i = 0; i < lines.length; i++) {
    if (HEADER_RE.test(lines[i])) starts.push(i);
  }
  var out = [];
  for (var s = 0; s < starts.length; s++) {
    var from = starts[s];
    var to = s + 1 < starts.length ? starts[s + 1] : lines.length;
    var block = lines.slice(from, to);
    var header = block[0].match(HEADER_RE);
    if (!header) continue;
    var fields = {
      linkedin: "",
      domain: "",
      stageTimeline: "",
      funding: "",
      pedigree: "",
    };
    var current = "";
    for (var j = 1; j < block.length; j++) {
      var line = block[j];
      var m;
      if ((m = line.match(/^profile\s*url\s*:\s*(.*)$/i))) {
        fields.linkedin = m[1].trim();
        current = "linkedin";
      } else if (
        (m = line.match(
          /^(?:domain(?:\s*\/\s*what they are building)?|what they are building)\s*:\s*(.*)$/i,
        ))
      ) {
        fields.domain = m[1].trim();
        current = "domain";
      } else if ((m = line.match(/^stage(?:\s*&\s*founding timeline)?\s*:\s*(.*)$/i))) {
        fields.stageTimeline = m[1].trim();
        current = "stageTimeline";
      } else if ((m = line.match(/^funding status\s*:\s*(.*)$/i))) {
        fields.funding = m[1].trim();
        current = "funding";
      } else if (
        (m = line.match(
          /^pedigree(?:\s*&\s*traction(?:\s*\/\s*verification)?)?\s*:\s*(.*)$/i,
        ))
      ) {
        fields.pedigree = m[1].trim();
        current = "pedigree";
      } else if (current && line.trim()) {
        fields[current] = (fields[current] + " " + line.trim()).trim();
      }
    }
    var split = splitCompany_(header[3]);
    out.push({
      sourceIndex: header[1],
      founder: header[2].trim(),
      company: split.company,
      companyNote: split.companyNote,
      linkedin: cleanLinkedin_(fields.linkedin),
      domain: fields.domain,
      stageTimeline: fields.stageTimeline,
      funding: fields.funding,
      pedigree: fields.pedigree,
      raw: block.join("\n").trim(),
    });
  }
  return out;
}

function splitCompany_(right) {
  var m = String(right || "").trim().match(/^(.*?)\s*\((.+)\)\s*$/);
  if (m) return { company: m[2].trim(), companyNote: m[1].trim() };
  return { company: String(right || "").trim(), companyNote: "" };
}

function cleanLinkedin_(value) {
  var v = String(value || "").trim();
  if (!v || /^linkedin profile$/i.test(v)) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/linkedin\.com\//i.test(v)) return "https://" + v.replace(/^https?:\/\//i, "");
  return v;
}

function sourcedRowToRecord_(row) {
  var founder = String(row[2] || "").trim();
  var company = String(row[3] || "").trim();
  var domain = String(row[6] || "").trim();
  var raw = String(row[10] || "").trim();
  if (!founder && !company && !domain && !raw) return null;
  return {
    addedAt: String(row[0] || "").trim() || null,
    sourceIndex: String(row[1] || "").trim(),
    founder: founder,
    company: company,
    companyNote: String(row[4] || "").trim(),
    linkedin: String(row[5] || "").trim(),
    domain: domain,
    stageTimeline: String(row[7] || "").trim(),
    funding: String(row[8] || "").trim(),
    pedigree: String(row[9] || "").trim(),
    raw: raw,
    status: normalizeStatus_(row[11]),
    notes: String(row[12] || "").trim(),
  };
}

function writeCard_(sheet, r, c, rec) {
  var range = sheet.getRange(r, c, 9, 3);
  range.setBackground("#ffffff");
  range.setBorder(true, true, true, true, false, false, "#e5e7eb", SpreadsheetApp.BorderStyle.SOLID);
  range.setWrap(true);
  range.setVerticalAlignment("top");
  range.setFontFamily("Arial");
  range.setFontColor("#111827");

  sheet.getRange(r, c, 1, 2).merge().setValue(rec.company || "Untitled").setFontWeight("bold").setFontSize(12);
  sheet.getRange(r, c + 2).setValue(rec.status || "New").setFontSize(9).setFontColor(statusColor_(rec.status)).setHorizontalAlignment("right").setFontWeight("bold");
  sheet.getRange(r + 1, c, 1, 3).merge().setValue(joinParts_(rec.founder, rec.companyNote)).setFontSize(10).setFontColor("#6b7280");
  sheet.getRange(r + 2, c, 1, 3).merge().setValue(rec.domain || "").setFontSize(10);
  sheet.getRange(r + 3, c, 1, 3).merge().setValue(labelLine_("Stage", rec.stageTimeline)).setFontSize(9).setFontColor("#6b7280");
  sheet.getRange(r + 4, c, 1, 3).merge().setValue(labelLine_("Funding", rec.funding)).setFontSize(9).setFontColor("#6b7280");
  sheet.getRange(r + 5, c, 2, 3).merge().setValue(rec.pedigree || "").setFontSize(9).setFontColor("#4b5563");
  var li = rec.linkedin
    ? '=HYPERLINK("' + rec.linkedin.replace(/"/g, "") + '","LinkedIn profile")'
    : "LinkedIn — not provided";
  sheet.getRange(r + 7, c, 1, 3).merge().setValue(li).setFontSize(9).setFontColor("#2563eb");
  sheet.getRange(r + 8, c, 1, 3).merge().setValue(rec.addedAt ? "Added " + rec.addedAt : "").setFontSize(8).setFontColor("#9ca3af");
  sheet.setRowHeight(r + 5, 36);
  sheet.setRowHeight(r + 6, 36);
}

function labelLine_(label, value) {
  if (!value) return "";
  return label + ": " + value;
}

function joinParts_(a, b) {
  if (a && b) return a + " · " + b;
  return a || b || "";
}

function statusColor_(status) {
  var v = String(status || "New");
  if (v === "Watching") return "#b45309";
  if (v === "Outreach") return "#047857";
  if (v === "Passed") return "#6b7280";
  return "#1d4ed8";
}

function normalizeStatus_(raw) {
  var v = String(raw || "").trim().toLowerCase();
  if (v === "watching") return "Watching";
  if (v === "outreach" || v === "reached out") return "Outreach";
  if (v === "passed" || v === "pass") return "Passed";
  return "New";
}

function indexSourced_(sheet) {
  var map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  var values = sheet.getRange(2, 3, sheet.getLastRow() - 1, 2).getDisplayValues();
  values.forEach(function (row, i) {
    var key = founderKey_(row[0], row[1]);
    if (key !== "|") map[key] = i + 2;
  });
  return map;
}

function founderKey_(founder, company) {
  return String(founder || "").trim().toLowerCase() + "|" + String(company || "").trim().toLowerCase();
}

function appendMitraDump_(ss, text) {
  var mitra = ss.getSheetByName(CONFIG.MITRA_TAB);
  mitra.appendRow([new Date(), String(text || "").trim()]);
}

function seedExampleIfEmpty_(ss) {
  var mitra = ss.getSheetByName(CONFIG.MITRA_TAB);
  if (mitra.getLastRow() >= 2) return;
  appendMitraDump_(ss, EXAMPLE_MITRA);
}

function collectMitraBlob_(mitra) {
  if (!mitra || mitra.getLastRow() < 1) return "";
  var last = mitra.getLastRow();
  var width = Math.max(mitra.getLastColumn(), 1);
  var headerA = String(mitra.getRange(1, 1).getValue() || "").trim();
  var headerB = width >= 2 ? String(mitra.getRange(1, 2).getValue() || "").trim() : "";
  var start = 1;
  if (/^added at$/i.test(headerA) || /^mitra dump$/i.test(headerB)) start = 2;
  if (last < start) return "";
  var values = mitra.getRange(start, 1, last - start + 1, width).getDisplayValues();
  return values
    .map(function (row) {
      var parts = [];
      for (var c = 0; c < row.length; c++) {
        var cell = String(row[c] || "").trim();
        if (!cell) continue;
        if (c === 0 && looksLikeDateCell_(cell) && row.length > 1) continue;
        parts.push(cell);
      }
      return parts.join("\n");
    })
    .filter(function (block) {
      return block.trim() !== "";
    })
    .join("\n");
}

function looksLikeDateCell_(value) {
  var s = String(value || "").trim();
  if (!s) return false;
  if (/^\d+\.\s+/.test(s)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return true;
  var t = Date.parse(s);
  return !isNaN(t) && /[\/\-:]/.test(s);
}

function ensureTabs_(ss) {
  var mitra = getOrCreateSheet_(ss, CONFIG.MITRA_TAB);
  ensureHeaderRow_(mitra, ["Added at", "Mitra dump"]);
  mitra.setColumnWidth(1, 160);
  mitra.setColumnWidth(2, 720);
  mitra.setFrozenRows(1);
  mitra.getRange("B2:B").setWrap(true);

  var sourced = getOrCreateSheet_(ss, CONFIG.SOURCED_TAB);
  ensureHeaderRow_(sourced, SOURCED_HEADERS);
  sourced.setFrozenRows(1);
  sourced.setFrozenColumns(4);
  sourced.getRange("A:A").setNumberFormat("yyyy-mm-dd hh:mm");
  sourced.getRange("J:K").setWrap(true);
  sourced.setColumnWidth(3, 180);
  sourced.setColumnWidth(4, 180);
  sourced.setColumnWidth(7, 260);
  sourced.setColumnWidth(10, 320);
  sourced.setColumnWidth(11, 280);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUSES, true)
    .setAllowInvalid(false)
    .build();
  sourced.getRange("L2:L").setDataValidation(rule);

  getOrCreateSheet_(ss, CONFIG.CARDS_TAB);

  var setup = getOrCreateSheet_(ss, CONFIG.SETUP_TAB);
  setup.clear();
  setup.setColumnWidth(1, 880);
  setup.getRange("A1").setValue("All In — Deal Sourcing (Mitra)").setFontWeight("bold").setFontSize(16);
  setup.getRange("A3").setValue(
    "This workbook is completely separate from inbound Founders.\n\n" +
      "How Mitra writes here\n" +
      "• Point Mitra / your agent at the Mitra tab.\n" +
      "• Paste (or append) numbered blocks in column B, one dump per row — or line-by-line in column B.\n" +
      "• Format:\n\n" +
      EXAMPLE_MITRA +
      "\n\n" +
      "What this script does\n" +
      "• Parses those blocks into Sourced (one founder per row).\n" +
      "• Rebuilds Cards so the sheet itself looks like TOFU cards.\n" +
      "• Serves JSON to TOFU via doGet (Deal sourcing in the left sidebar).\n\n" +
      "Menu: Deal Sourcing → Process Mitra dump. Hourly trigger recommended.\n" +
      "Status on Sourced (New / Watching / Outreach / Passed) is what TOFU shows on each card.",
  );
  setup.getRange("A3").setWrap(true).setVerticalAlignment("top");
  setup.setRowHeight(3, 420);

  hideDefaultSheet_(ss);
}

function ensureHeaderRow_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sheet.getRange(1, 1, 1, headers.length));
}

function getOrCreateSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  return ss.insertSheet(name);
}

function hideDefaultSheet_(ss) {
  var first = ss.getSheetByName("Sheet1") || ss.getSheetByName("Sheet 1");
  if (!first || ss.getSheets().length <= 1) return;
  if (first.getLastRow() <= 1) ss.deleteSheet(first);
}

function styleHeader_(range) {
  range
    .setFontWeight("bold")
    .setFontSize(10)
    .setBackground("#111827")
    .setFontColor("#ffffff");
}

function getOrCreateSpreadsheet_() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (err) {}
  var id = PropertiesService.getScriptProperties().getProperty("SOURCING_SHEET_ID");
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err2) {}
  }
  return SpreadsheetApp.create("All In — Deal Sourcing (Mitra)");
}

function getSpreadsheet_() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (err) {}
  var id = PropertiesService.getScriptProperties().getProperty("SOURCING_SHEET_ID");
  if (!id) {
    throw new Error("Run setupSourcingWorkbook first.");
  }
  return SpreadsheetApp.openById(id);
}

function authorize_(e) {
  var token = CONFIG.SECRET_TOKEN || PropertiesService.getScriptProperties().getProperty("SECRET_TOKEN") || "";
  if (!token) return true;
  var got = "";
  if (e && e.parameter && e.parameter.token) got = e.parameter.token;
  return got === token;
}

function getOrCreateLabel_(name) {
  var label = GmailApp.getUserLabelByName(name);
  return label || GmailApp.createLabel(name);
}

function parseDateMs_(value) {
  if (value instanceof Date) return value.getTime();
  var t = Date.parse(String(value || ""));
  return isNaN(t) ? 0 : t;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
