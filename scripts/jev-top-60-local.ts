/**
 * Local-only: Jev-rate the top 60 inbounds (newest first).
 * Writes AI rating fields only — no auto-pass, emails, Attio, or bucket changes.
 *
 *   node --require ./scripts/stub-server-only.cjs --import tsx scripts/jev-top-60-local.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const LIMIT = Number(process.env.JEV_LIMIT || 60);
const CONCURRENCY = Number(process.env.JEV_CONCURRENCY || 3);

function dealToEvalDeal(deal: {
  company: string;
  sector: string;
  name: string;
  blurb: string;
  summary: string;
  website: string;
  deckLink: string;
  senderEmail: string;
  linkedin: string;
  eliteSchool: string;
}) {
  return {
    companyName: deal.company,
    sector: deal.sector,
    founderName: deal.name,
    blurb: deal.blurb,
    summary: deal.summary,
    websiteUrl: deal.website,
    deckLink: deal.deckLink,
    senderEmail: deal.senderEmail,
    linkedin: deal.linkedin,
    eliteSchool: deal.eliteSchool,
  };
}

async function main() {
  const { fetchDealsPayload } = await import("../src/lib/deal-sources");
  const { isJevConfigured, jevRateDeal } = await import("../src/lib/rating/jev");
  const {
    collectSignals,
    determineMode,
    RUBRIC_VERSION,
  } = await import("../src/lib/rating/rubric");
    const { persistJevRating } = await import("../src/lib/rating/persist-jev");

  if (!isJevConfigured()) {
    throw new Error("TYPESAFE_API_KEY is missing in .env.local");
  }

  const payload = await fetchDealsPayload();
  const top = payload.deals
    .filter((d) => (d.company || "").trim())
    .slice(0, LIMIT);

  console.log(
    `Jev local · ${top.length} deals (of ${payload.deals.length}) · source=${payload.source} · no auto-pass / email / Attio`,
  );
  top.slice(0, 8).forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.company}  (row ${d.rowIndex})`);
  });
  if (top.length > 8) console.log(`  … +${top.length - 8} more`);

  const counts = { Yes: 0, Review: 0, No: 0 };
  let ok = 0;
  let failed = 0;
  let i = 0;

  async function rateOne(
    deal: (typeof top)[number],
    index: number,
  ): Promise<void> {
    const evalDeal = dealToEvalDeal(deal);
    const mode = determineMode(evalDeal);
    const signals = await collectSignals(evalDeal);
    const jev = await jevRateDeal(evalDeal, signals, mode);
    const via = `${jev.via}@${RUBRIC_VERSION}`;
    const ratedAt = new Date().toISOString();

    await persistJevRating(deal.rowIndex, {
      stars: jev.stars,
      worth: jev.worth,
      summary: jev.summary,
      via,
      ratedAt,
    });

    counts[jev.worth] += 1;
    ok += 1;
    const prev = deal.jevWorth
      ? `${deal.jevRatingStars ?? "—"}★ ${deal.jevWorth}`
      : deal.aiWorth
        ? `AI ${deal.aiRatingStars ?? "—"}★ ${deal.aiWorth}`
        : "unrated";
    console.log(
      `[${String(index + 1).padStart(2)}/${top.length}] ${jev.stars}★ ${jev.worth.padEnd(6)}  ${deal.company}  (${prev} → jev)  ${jev.summary}`,
    );
  }

  async function worker() {
    while (i < top.length) {
      const index = i++;
      const deal = top[index];
      try {
        await rateOne(deal, index);
      } catch (err) {
        failed += 1;
        console.warn(
          `[${String(index + 1).padStart(2)}/${top.length}] FAIL ${deal.company}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, top.length) }, () => worker()),
  );

  console.log(
    JSON.stringify(
      {
        rated: ok,
        failed,
        mix: counts,
        limit: top.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
