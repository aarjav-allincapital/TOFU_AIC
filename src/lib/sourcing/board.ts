import { normalizeLinkedInProfileUrl } from "@/lib/linkedin/url";
import type { SourcedFounder } from "./types";

export type BoardStage = "new" | "reached_out" | "talking";

export const BOARD_STAGES: BoardStage[] = ["new", "reached_out", "talking"];

export const BOARD_STAGE_LABELS: Record<BoardStage, string> = {
  new: "New leads",
  reached_out: "Reached out",
  talking: "Talking",
};

export function isBoardStage(value: unknown): value is BoardStage {
  return value === "new" || value === "reached_out" || value === "talking";
}

/** Stable per-founder key — survives sheet row moves. */
export function sourcingBoardKey(
  item: Pick<SourcedFounder, "linkedin" | "founder" | "company">,
): string {
  const li = normalizeLinkedInProfileUrl(item.linkedin || "");
  if (li) return li;
  return `${item.founder.trim().toLowerCase()}|${item.company.trim().toLowerCase()}`;
}

/** Stored stage wins; otherwise sheet Outreach starts in Reached out. */
export function boardStageFor(item: SourcedFounder): BoardStage {
  if (item.boardStage && isBoardStage(item.boardStage)) return item.boardStage;
  if (item.status === "Outreach") return "reached_out";
  return "new";
}
