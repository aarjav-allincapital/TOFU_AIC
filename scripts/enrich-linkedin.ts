/**
 * Enrich LinkedIn previews.
 *
 *   npx tsx scripts/enrich-linkedin.ts
 *   LIMIT=10 FORCE=1 npx tsx scripts/enrich-linkedin.ts
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

process.env.ENABLE_LINKEDIN_BRIGHTDATA =
  process.env.ENABLE_LINKEDIN_BRIGHTDATA || "1";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module") as typeof import("module") & {
  prototype: { require: (...args: unknown[]) => unknown };
};
const originalRequire = Module.prototype.require;
Module.prototype.require = function (this: unknown, id: string, ...rest: unknown[]) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, [id, ...rest] as never);
};

async function main() {
  const limit = Number(process.env.LIMIT || 10);
  const force = process.env.FORCE === "1";
  const { enrichLinkedInBacklog } = await import("../src/lib/linkedin/backfill");
  console.log(
    `enriching up to ${limit} LinkedIn profiles${force ? " (force)" : ""}…`,
  );
  const result = await enrichLinkedInBacklog(limit, { force });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
