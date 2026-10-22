import { normalizeLinkedInProfileUrl } from "@/lib/linkedin/url";
import { extractFounderLinks } from "./links";
import type { SourcedFounder, SourcingStatus } from "./types";

const HEADER_RE =
  /^\s*(\d+)\.\s*(.+?)\s*\|\s*(.+?)\s*$/;

const FIELD_RES: { key: keyof ParsedFields; re: RegExp }[] = [
  { key: "linkedin", re: /^profile\s*url\s*:\s*(.*)$/i },
  {
    key: "domain",
    re: /^(?:domain(?:\s*\/\s*what they are building)?|what they are building)\s*:\s*(.*)$/i,
  },
  { key: "stageTimeline", re: /^stage(?:\s*&\s*founding timeline)?\s*:\s*(.*)$/i },
  { key: "funding", re: /^funding status\s*:\s*(.*)$/i },
  {
    key: "pedigree",
    re: /^pedigree(?:\s*&\s*traction(?:\s*\/\s*verification)?)?\s*:\s*(.*)$/i,
  },
];

type ParsedFields = {
  linkedin: string;
  domain: string;
  stageTimeline: string;
  funding: string;
  pedigree: string;
};

function splitCompany(right: string): { company: string; companyNote: string } {
  const m = right.trim().match(/^(.*?)\s*\((.+)\)\s*$/);
  if (m) {
    return { company: m[2].trim(), companyNote: m[1].trim() };
  }
  return { company: right.trim(), companyNote: "" };
}

function cleanLinkedin(value: string): string {
  const v = value.trim();
  if (!v || /^linkedin profile$/i.test(v)) return "";
  return normalizeLinkedInProfileUrl(v) || extractFounderLinks(v).linkedin;
}

/**
 * Parse one or more Mitra numbered blocks into sourced-founder records.
 * Used by the portal (preview) and mirrored in apps-script/sourcing/Code.gs.
 */
export function parseMitraBlocks(text: string): Omit<
  SourcedFounder,
  "rowIndex" | "status" | "notes" | "addedAt" | "addedAtMs"
>[] {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n");
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEADER_RE.test(lines[i])) starts.push(i);
  }
  if (starts.length === 0) return [];

  const out: Omit<
    SourcedFounder,
    "rowIndex" | "status" | "notes" | "addedAt" | "addedAtMs"
  >[] = [];

  for (let s = 0; s < starts.length; s++) {
    const from = starts[s];
    const to = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const block = lines.slice(from, to);
    const header = block[0].match(HEADER_RE);
    if (!header) continue;

    const fields: ParsedFields = {
      linkedin: "",
      domain: "",
      stageTimeline: "",
      funding: "",
      pedigree: "",
    };
    let current: keyof ParsedFields | null = null;

    for (let i = 1; i < block.length; i++) {
      const line = block[i];
      let matched = false;
      for (const f of FIELD_RES) {
        const m = line.match(f.re);
        if (!m) continue;
        fields[f.key] = m[1].trim();
        current = f.key;
        matched = true;
        break;
      }
      if (!matched && current && line.trim()) {
        fields[current] = `${fields[current]} ${line.trim()}`.trim();
      }
    }

    const { company, companyNote } = splitCompany(header[3]);
    const raw = block.join("\n").trim();
    const links = extractFounderLinks(fields.linkedin, raw);
    out.push({
      sourceIndex: header[1],
      founder: header[2].trim(),
      company,
      companyNote,
      linkedin: cleanLinkedin(fields.linkedin) || links.linkedin,
      github: links.github,
      website: links.website,
      twitter: links.twitter,
      domain: fields.domain,
      stageTimeline: fields.stageTimeline,
      funding: fields.funding,
      pedigree: fields.pedigree,
      hardware: "",
      moat: "",
      tam: "",
      auditStatus: "",
      raw,
    });
  }

  return out;
}

export function normalizeSourcingStatus(raw: string | null | undefined): SourcingStatus {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "watching") return "Watching";
  if (v === "outreach" || v === "reached out") return "Outreach";
  if (v === "passed" || v === "pass") return "Passed";
  return "New";
}

export function isLinkedinHref(value: string): boolean {
  return Boolean(normalizeLinkedInProfileUrl(value));
}

/** Canonical Mitra dump used for setup seed + unconfigured preview. */
export const EXAMPLE_MITRA_BLOCK = `1. Pradyumna Vyshnav | Stealth Startup (Uncharted AI)
Profile URL: LinkedIn Profile
Domain / What they are building: Space Robotics & Autonomous Resource Discovery
Stage & Founding Timeline: Stealth / Just Started Building (Incubating via ARTPARK / Antler DeepTech residency)
Funding Status: Strictly Unfunded / Zero VC raised (pre-seed incubation)
Pedigree & Traction / Verification: Aerospace background, AIAA Outstanding Paper Award recipient, KARI Student Scholar, ISRO semi-finalist. Building dual-use autonomous robotic systems for terrestrial extreme environments and planetary exploration.`;

export function exampleSourcedFounder(): SourcedFounder {
  const parsed = parseMitraBlocks(EXAMPLE_MITRA_BLOCK)[0];
  return {
    ...parsed,
    rowIndex: 0,
    status: "New",
    notes: "",
    addedAt: null,
    addedAtMs: null,
  };
}
