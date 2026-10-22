import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseAdminConfigured = Boolean(
  SUPABASE_URL && SERVICE_ROLE_KEY,
);

let adminClient: SupabaseClient | null = null;

/** Service-role client — bypasses RLS. Never expose to the browser. */
export function getSupabaseAdminCore(): SupabaseClient {
  if (!isSupabaseAdminConfigured) {
    throw new Error(
      "Supabase admin is not configured — set SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return adminClient;
}
