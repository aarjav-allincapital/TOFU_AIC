import "server-only";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin-core";

export type DeckSummaryVia =
  | "ok"
  | "no_link"
  | "not_pdf"
  | "fetch_failed"
  | "empty"
  | "llm_failed"
  | "disabled";

export type PersistDeckSummaryInput = {
  summary: string | null;
  textExcerpt: string | null;
  via: DeckSummaryVia;
  at?: string;
};

/**
 * Write portal-only deck_* fields. Soft-fails if migration columns are missing.
 */
export async function persistDeckSummary(
  rowIndex: number,
  input: PersistDeckSummaryInput,
): Promise<boolean> {
  if (!isSupabaseAdminConfigured) return false;

  const admin = getSupabaseAdminCore();
  const at = input.at || new Date().toISOString();
  const { error } = await admin
    .from("deals")
    .update({
      deck_summary: input.summary,
      deck_text_excerpt: input.textExcerpt,
      deck_summarized_at: at,
      deck_summary_via: input.via,
    })
    .eq("row_index", rowIndex);

  if (error) {
    console.warn(
      `[deck] persist failed for row ${rowIndex}:`,
      error.message,
    );
    return false;
  }
  return true;
}
