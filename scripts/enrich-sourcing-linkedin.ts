/**
 * Local-only: scrape sourced-founder LinkedIn previews via Bright Data.
 * Writes .data/sourcing-linkedin.json — no Supabase / Attio / email.
 *
 *   node --require ./scripts/stub-server-only.cjs --import tsx scripts/enrich-sourcing-linkedin.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { fetchSourcingPayload } = await import("../src/lib/sourcing/fetch");
  const {
    enrichMissingSourcingLinkedIn,
    isSourcingLinkedInEnabled,
  } = await import("../src/lib/sourcing/linkedin-enrich");

  console.log("linkedinEnabled", isSourcingLinkedInEnabled());
  const payload = await fetchSourcingPayload();
  console.log("sourced", payload.count, "source", payload.source);
  for (const item of payload.sourced) {
    console.log(
      [
        item.company || "?",
        item.founder || "?",
        item.linkedin ? "li" : "no-li",
        item.github ? "gh" : "",
        item.linkedinPreview?.name || item.linkedinEnrichVia || "pending",
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }
  const result = await enrichMissingSourcingLinkedIn(payload.sourced);
  console.log("enrich", result);
  const after = await fetchSourcingPayload();
  for (const item of after.sourced) {
    console.log(
      [
        item.company || "?",
        item.linkedinPreview?.name || "—",
        item.linkedinEnrichVia || "none",
        item.linkedinPreview?.headline
          ? item.linkedinPreview.headline.slice(0, 80)
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
