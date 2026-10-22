import "server-only";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin-core";

export type LinkedInEnrichVia =
  | "ok"
  | "no_url"
  | "bad_url"
  | "no_token"
  | "api_error"
  | "empty"
  | "disabled";

export async function persistLinkedInEnrichment(
  rowIndex: number,
  input: {
    workHistory: string | null;
    college: string | null;
    via: LinkedInEnrichVia;
    at?: string;
  },
): Promise<boolean> {
  if (!isSupabaseAdminConfigured) return false;
  const admin = getSupabaseAdminCore();
  const at = input.at || new Date().toISOString();
  const { error } = await admin
    .from("deals")
    .update({
      linkedin_work_history: input.workHistory,
      linkedin_college: input.college,
      linkedin_enriched_at: at,
      linkedin_enrich_via: input.via,
    })
    .eq("row_index", rowIndex);

  if (error) {
    console.warn(`[linkedin] persist row ${rowIndex}:`, error.message);
    return false;
  }
  return true;
}
