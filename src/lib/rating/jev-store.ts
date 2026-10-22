import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type StoredJevRating = {
  stars: number;
  worth: string;
  summary: string;
  via: string;
  ratedAt: string;
};

const FILE = path.join(process.cwd(), ".data", "jev-ratings.json");

let cache: Record<string, StoredJevRating> | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Record<string, StoredJevRating>> {
  if (cache) return cache;
  try {
    const raw = await readFile(FILE, "utf8");
    cache = JSON.parse(raw) as Record<string, StoredJevRating>;
  } catch {
    cache = {};
  }
  return cache;
}

export async function readJevStore(): Promise<Map<number, StoredJevRating>> {
  const data = await load();
  const map = new Map<number, StoredJevRating>();
  for (const [k, v] of Object.entries(data)) {
    const n = Number(k);
    if (Number.isFinite(n) && v) map.set(n, v);
  }
  return map;
}

export async function writeJevStore(
  rowIndex: number,
  rating: StoredJevRating,
): Promise<void> {
  const run = async () => {
    const data = await load();
    data[String(rowIndex)] = rating;
    cache = data;
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(data), "utf8");
  };
  writeChain = writeChain.then(run, run);
  await writeChain;
}
