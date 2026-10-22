import type { SourcedFounder } from "./types";

type Named = Pick<SourcedFounder, "company" | "founder" | "companyNote" | "domain">;

/** Card title: company, else the founder's name — never "Untitled". */
export function sourcingTitle(item: Named): string {
  return item.company.trim() || item.founder.trim() || "Stealth founder";
}

/** Card subtitle: founder under a company, else the note/domain. */
export function sourcingSubtitle(item: Named): string {
  if (item.company.trim()) return item.founder.trim();
  return item.companyNote.trim() || item.domain.trim() || "Stealth";
}
