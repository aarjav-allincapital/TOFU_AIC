/**
 * Client-safe picklists for the manual "Add to Attio" action.
 * Mirrors the Deal Flow list in Attio: Deal Stage columns + Owner (teammate).
 */

export const DEAL_FLOW_STAGES = [
  "New Lead",
  "Due diligence",
  "Term sheet",
  "Watchlist",
  "Awareness",
  "Invested",
  "Passed",
  "Lost",
] as const;

export type DealFlowStage = (typeof DEAL_FLOW_STAGES)[number];

export function isDealFlowStage(v: string): v is DealFlowStage {
  return (DEAL_FLOW_STAGES as readonly string[]).includes(v);
}

/** Attio workspace members selectable as Deal Flow Owner (matched by email). */
export const DEAL_FLOW_OWNERS = [
  { email: "aarjav@allincapital.vc", label: "Aarjav" },
  { email: "kb@allincapital.vc", label: "Kushal" },
  { email: "siddharth@allincapital.vc", label: "Siddharth" },
  { email: "simran@allincapital.vc", label: "Simran" },
  { email: "disha@allincapital.vc", label: "Disha" },
  { email: "as@allincapital.vc", label: "Aditya Pratap Singh" },
  { email: "adityasingh2@allincapital.vc", label: "Aditya Singh" },
] as const;

export function isDealFlowOwnerEmail(v: string): boolean {
  return DEAL_FLOW_OWNERS.some((o) => o.email === v);
}

export function dealFlowOwnerLabel(email: string | null | undefined): string {
  if (!email) return "";
  return DEAL_FLOW_OWNERS.find((o) => o.email === email)?.label ?? email;
}
