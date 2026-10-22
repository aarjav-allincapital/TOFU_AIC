import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "../supabase-admin-core";
import { sourcingBoardKey, type BoardStage, isBoardStage } from "./board";
import type { SourcedFounder } from "./types";

type StoredStage = {
  stage: BoardStage;
  updatedAt: string;
  updatedBy: string | null;
};

const FILE = path.join(process.cwd(), ".data", "sourcing-board.json");

let cache: Record<string, StoredStage> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let supabaseMissing = false;

async function loadFile(): Promise<Record<string, StoredStage>> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(FILE, "utf8")) as Record<string, StoredStage>;
  } catch {
    cache = {};
  }
  return cache;
}

async function loadSupabase(): Promise<Record<string, StoredStage>> {
  if (!isSupabaseAdminConfigured || supabaseMissing) return {};
  try {
    const { data, error } = await getSupabaseAdminCore()
      .from("sourcing_board")
      .select("key, stage, updated_at, updated_by");
    if (error) {
      supabaseMissing = true;
      console.warn(
        "[sourcing/board] Supabase table missing — using .data/sourcing-board.json. Run supabase/migrate-sourcing-board.sql.",
      );
      return {};
    }
    const out: Record<string, StoredStage> = {};
    for (const row of data || []) {
      if (!isBoardStage(row.stage)) continue;
      out[String(row.key)] = {
        stage: row.stage,
        updatedAt: new Date(row.updated_at as string).toISOString(),
        updatedBy: (row.updated_by as string | null) ?? null,
      };
    }
    return out;
  } catch (err) {
    supabaseMissing = true;
    console.warn(
      "[sourcing/board] Supabase read failed:",
      err instanceof Error ? err.message : err,
    );
    return {};
  }
}

async function loadAll(): Promise<Map<string, StoredStage>> {
  const [file, remote] = await Promise.all([loadFile(), loadSupabase()]);
  const map = new Map<string, StoredStage>(Object.entries(file));
  for (const [key, entry] of Object.entries(remote)) {
    const local = map.get(key);
    if (!local || Date.parse(entry.updatedAt) >= Date.parse(local.updatedAt)) {
      map.set(key, entry);
    }
  }
  return map;
}

export async function overlayBoardStages(
  sourced: SourcedFounder[],
): Promise<SourcedFounder[]> {
  const stages = await loadAll();
  if (stages.size === 0) return sourced;
  return sourced.map((item) => {
    const hit = stages.get(sourcingBoardKey(item));
    return hit ? { ...item, boardStage: hit.stage } : item;
  });
}

/** Returns false when nothing durable accepted the write. */
export async function writeBoardStage(
  key: string,
  stage: BoardStage,
  updatedBy: string | null,
): Promise<boolean> {
  const entry: StoredStage = {
    stage,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  let fileOk = false;
  let remoteOk = false;
  const run = async () => {
    const data = await loadFile();
    data[key] = entry;
    cache = data;
    try {
      await mkdir(path.dirname(FILE), { recursive: true });
      await writeFile(FILE, JSON.stringify(data), "utf8");
      fileOk = !process.env.VERCEL;
    } catch (err) {
      console.warn(
        "[sourcing/board] file write failed:",
        err instanceof Error ? err.message : err,
      );
    }
    if (isSupabaseAdminConfigured && !supabaseMissing) {
      const { error } = await getSupabaseAdminCore()
        .from("sourcing_board")
        .upsert(
          {
            key,
            stage,
            updated_at: entry.updatedAt,
            updated_by: updatedBy,
          },
          { onConflict: "key" },
        );
      if (error) {
        supabaseMissing = true;
        console.warn("[sourcing/board] Supabase write failed:", error.message);
      } else {
        remoteOk = true;
      }
    }
  };
  writeChain = writeChain.then(run, run);
  await writeChain;
  return fileOk || remoteOk;
}
