import { sourcingBoardKey } from "./board";
import type { SourcedFounder } from "./types";

/** Founders removed from Deal sourcing. The sourcing sheet is left as-is. */
const HIDDEN_SOURCING_KEYS = new Set<string>([
  // RADALIS — Pradyumna Bang (already an inbound deal)
  "https://www.linkedin.com/in/pradyumna-bang-28011b168/",
  // Aule Space — Jay Panchal
  "https://www.linkedin.com/in/jay-panchal-40451119b/",
  // Parsec Aerospace — Effy John
  "https://www.linkedin.com/in/effyjohn/",
  // Vyobha Aerospace — Gavneesh, Sorav Kumar, Arnav Kumar
  "https://www.linkedin.com/in/gavneesh-9419b418a/",
  "https://www.linkedin.com/in/sorav-kumar/",
  "https://www.linkedin.com/in/arnav-kumar-73b0641b6/",
  // Comet Aerospace co-founder card — Garvit Goel is the one card we keep
  "https://www.linkedin.com/in/abhishek-nand/",
]);

const HIDDEN_COMPANIES = new Set(["vyobha aerospace"]);

export function withoutHiddenSourcing(rows: SourcedFounder[]): SourcedFounder[] {
  return rows.filter((item) => {
    if (HIDDEN_SOURCING_KEYS.has(sourcingBoardKey(item))) return false;
    return !HIDDEN_COMPANIES.has(item.company.trim().toLowerCase());
  });
}
