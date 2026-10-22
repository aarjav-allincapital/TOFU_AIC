import type { LinkedInPreview } from "@/lib/linkedin/preview";
import type { TracxnProfile, TracxnVia } from "@/lib/tracxn/types";

export type SourcingStatus =
  | "New"
  | "Watching"
  | "Outreach"
  | "Passed";

export const SOURCING_STATUSES: SourcingStatus[] = [
  "New",
  "Watching",
  "Outreach",
  "Passed",
];

export type SourcedFounder = {
  rowIndex: number;
  sourceIndex: string;
  founder: string;
  company: string;
  companyNote: string;
  linkedin: string;
  github: string;
  website: string;
  twitter: string;
  domain: string;
  stageTimeline: string;
  funding: string;
  pedigree: string;
  hardware: string;
  moat: string;
  tam: string;
  auditStatus: string;
  raw: string;
  status: SourcingStatus;
  notes: string;
  addedAt: string | null;
  addedAtMs: number | null;
  linkedinPreview?: LinkedInPreview | null;
  linkedinCollege?: string | null;
  linkedinEnrichedAt?: string | null;
  linkedinEnrichVia?: string | null;
  boardStage?: "new" | "reached_out" | "talking" | null;
  tracxn?: TracxnProfile | null;
  tracxnVia?: TracxnVia | null;
  tracxnFetchedAt?: string | null;
};

export type SourcingPayload = {
  sourced: SourcedFounder[];
  count: number;
  fetchedAt: string;
  configured: boolean;
  sheetUrl?: string | null;
  source: "apps-script" | "sheet" | "unconfigured";
  error?: string;
  linkedinEnabled?: boolean;
  tracxnEnabled?: boolean;
};
