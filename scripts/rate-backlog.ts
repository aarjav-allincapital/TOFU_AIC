import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { rateBacklogFromSupabase } = await import(
    "../src/lib/deal-sources/auto-rate"
  );
  const started = Date.now();
  const r = await rateBacklogFromSupabase(120);
  console.log(JSON.stringify({ ...r, durationMs: Date.now() - started }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
