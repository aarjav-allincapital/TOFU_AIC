import "server-only";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "./supabase-admin-core";

export { isSupabaseAdminConfigured };

/** Server-only wrapper — use in API routes, not CLI scripts. */
export function getSupabaseAdmin() {
  return getSupabaseAdminCore();
}
