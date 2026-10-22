/**
 * One-time / manual sync: pulls the current Google Sheet snapshot and
 * upserts it into Supabase. Run with: npm run sync:supabase
 *
 * Loads .env.local first (before importing anything that reads
 * process.env at module-load time).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

async function main() {
  const { syncSheetToSupabase } = await import(
    "../src/lib/deal-sources/sync"
  );
  console.log("Syncing Google Sheet → Supabase...");
  const result = await syncSheetToSupabase();
  console.log(`✓ Synced ${result.count} deals in ${result.durationMs}ms.`);
}

main().catch((err) => {
  console.error("✗ Sync failed:", err);
  process.exit(1);
});
