import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const m = await import("../src/lib/sheet");
  const p = await m.fetchDealsPayload();
  console.log("source:", p.source, "count:", p.count);
  console.log(
    "first15:",
    JSON.stringify(p.deals.slice(0, 15).map((d) => d.company || d.name)),
  );
  const hits = ["Aazmaao", "Offbeet", "Aired", "Myudaan", "Lytyr", "BOSCO"].map(
    (n) => ({
      n,
      found: p.deals.some((d) =>
        (d.company || "").toLowerCase().includes(n.toLowerCase()),
      ),
    }),
  );
  console.log("latest_check:", JSON.stringify(hits));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
