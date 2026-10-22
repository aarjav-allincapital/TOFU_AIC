/**
 * Sync Google Sheet deals → Attio Inbound list only.
 * Run: npm run sync:attio
 *
 * Optional: LIMIT=10 npm run sync:attio  (smoke-test first N deals)
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

async function main() {
  const { isAttioConfigured, getInboundListSlug } = await import(
    "../src/lib/attio/client"
  );
  if (!isAttioConfigured()) {
    throw new Error("Set ATTIO_API_KEY in .env.local");
  }

  const list = getInboundListSlug();
  console.log(`Target Attio list: ${list} (Inbound only — Deal Flow untouched)`);

  const { sheetSource } = await import("../src/lib/deal-sources/sheet-source");
  const { syncDealsToAttioInbound } = await import(
    "../src/lib/attio/inbound-sync"
  );

  console.log("Fetching deals from Sheet…");
  const payload = await sheetSource.fetch();
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
  console.log(
    `Pushing ${limit ? Math.min(limit, payload.deals.length) : payload.deals.length} of ${payload.deals.length} deals → Attio…`,
  );

  const result = await syncDealsToAttioInbound(payload.deals, { limit });
  console.log(
    `✓ Attio Inbound: ${result.succeeded}/${result.attempted} ok in ${result.durationMs}ms` +
      (result.failed ? ` (${result.failed} failed)` : ""),
  );
  if (result.errors.length) {
    console.log("Sample errors:");
    for (const e of result.errors) {
      console.log(`  row ${e.rowIndex} ${e.company}: ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error("✗ Attio sync failed:", err);
  process.exit(1);
});
