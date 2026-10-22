export type Deal = {
  /** Stable unique id — always row-based (thread IDs can repeat). */
  id: string;
  rowIndex: number;
  dateReceived: string | null;
  dateReceivedMs: number | null;
  name: string;
  company: string;
  sector: string;
  website: string;
  deckLink: string;
  blurb: string;
  summary: string;
  senderEmail: string;
  threadId: string;
  action: string;
  actionDate: string | null;
  status: string;
  linkedin: string;
  eliteSchool: string;
  rating: string;
  worth: string;

  /** Inbox attribution — which triage agent ingested this row, and via which
   *  channel. Written to the Sheet by each agent; drives per-inbox views. */
  owner: string;
  channel: string;

  /** Rating module output — computed server-side, only for deals rated by the portal. */
  aiRatingStars: number | null;
  aiWorth: string | null;
  aiSummary: string | null;
  aiVia: string | null;
  aiMode: string | null;
  aiRatedAt: string | null;

  /** Parallel Jev (TypeSafe) rating — never overwrites ai_* and never auto-passes. */
  jevRatingStars: number | null;
  jevWorth: string | null;
  jevSummary: string | null;
  jevVia: string | null;
  jevRatedAt: string | null;

  /** Manually-selected bucket from the portal dropdown (e.g. "call_with_kushal", "pass"). */
  manualBucket: string | null;
  manualBucketAt: string | null;
  manualBucketBy: string | null;

  /** Attio CRM sync tracking (Inbound list only). */
  crmEntryId: string | null;
  crmSyncedAt: string | null;

  /** PDF deck agent — portal-only summary of pitch deck (does not overwrite sheet summary). */
  deckSummary: string | null;
  deckTextExcerpt: string | null;
  deckSummarizedAt: string | null;
  deckSummaryVia: string | null;

  /** LinkedIn Bright Data enrich — structured preview JSON in work_history + college names. */
  linkedinWorkHistory: string | null;
  linkedinCollege: string | null;
  linkedinEnrichedAt: string | null;
  linkedinEnrichVia: string | null;

  /** Founder replied after a Request Info email. Overlay-only (Supabase). */
  infoRepliedAt?: string | null;
  infoReplyNote?: string | null;
};

export const BUCKET_OPTIONS = [
  { value: "pass", label: "Pass" },
  { value: "pass_temporary", label: "Pass (temporary)" },
  { value: "pass_by_aditya", label: "Pass by Aditya" },
  { value: "request_info", label: "Request Info" },
  { value: "call_with_aarjav", label: "Call with Aarjav" },
  { value: "call_with_siddharth", label: "Call with Siddharth" },
  { value: "call_with_kushal", label: "Call with Kushal" },
  { value: "call_with_simran", label: "Call with Simran" },
  { value: "call_with_disha", label: "Call with Disha" },
  { value: "call_with_aditya1", label: "Call with Aditya (1)" },
  { value: "call_with_aditya2", label: "Call with Aditya (2)" },
] as const;

export type BucketValue = (typeof BUCKET_OPTIONS)[number]["value"];

export type DealsPayload = {
  deals: Deal[];
  count: number;
  fetchedAt: string;
  source: "sheet" | "apps-script" | "supabase";
};
