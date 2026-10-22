import "server-only";
import { randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "../supabase-admin-core";
import { compactShareProfile, type ShareCardFields } from "./share-card";

const PREFIX = "share:";
const FILE = path.join(process.cwd(), ".data", "share-cards.json");
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

let fileCache: Record<string, ShareCardFields> | null = null;
let dedicatedTableMissing = false;
let writeChain: Promise<void> = Promise.resolve();

function newId(): string {
  return randomBytes(9).toString("base64url");
}

export function isShareCardId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,24}$/.test(id);
}

async function loadFile(): Promise<Record<string, ShareCardFields>> {
  if (fileCache) return fileCache;
  try {
    fileCache = JSON.parse(await readFile(FILE, "utf8")) as Record<
      string,
      ShareCardFields
    >;
  } catch {
    fileCache = {};
  }
  return fileCache;
}

async function writeFileStore(id: string, card: ShareCardFields): Promise<boolean> {
  try {
    const data = await loadFile();
    data[id] = card;
    fileCache = data;
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(data), "utf8");
    return !process.env.VERCEL;
  } catch (err) {
    console.warn(
      "[share-store] file write failed:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/** Store public card snapshots behind short random IDs. */
export async function writeShareCard(card: ShareCardFields): Promise<string> {
  const id = newId();
  let saved = false;

  const run = async () => {
    if (isSupabaseAdminConfigured) {
      const db = getSupabaseAdminCore();
      if (!dedicatedTableMissing) {
        const { error } = await db.from("sourcing_share_cards").insert({
          id,
          card,
          created_at: card.sharedAt,
        });
        if (error) {
          dedicatedTableMissing = true;
          console.warn(
            "[share-store] sourcing_share_cards missing — falling back. Run supabase/migrate-sourcing-share.sql.",
            error.message,
          );
        } else {
          saved = true;
        }
      }
      if (!saved) {
        const { error } = await db.from("sourcing_linkedin").insert({
          url: `${PREFIX}${id}`,
          preview: { type: "share-card", card },
          college: null,
          via: "share-card",
          enriched_at: card.sharedAt,
        });
        if (error) {
          console.warn("[share-store] linkedin fallback failed:", error.message);
        } else {
          saved = true;
        }
      }
    }
    const fileOk = await writeFileStore(id, card);
    saved = saved || fileOk;
  };

  writeChain = writeChain.then(run, run);
  await writeChain;
  if (!saved) throw new Error("Could not store share card.");
  return id;
}

export async function readStoredShareCard(
  id: string,
): Promise<ShareCardFields | null> {
  if (!isShareCardId(id)) return null;

  if (isSupabaseAdminConfigured) {
    const db = getSupabaseAdminCore();
    if (!dedicatedTableMissing) {
      const { data, error } = await db
        .from("sourcing_share_cards")
        .select("card, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        dedicatedTableMissing = true;
      } else if (data) {
        const parsed = parseCard(data.card, data.created_at);
        if (parsed) return parsed;
      }
    }
    const { data } = await db
      .from("sourcing_linkedin")
      .select("preview, enriched_at")
      .eq("url", `${PREFIX}${id}`)
      .maybeSingle();
    if (data) {
      const stored = data.preview as
        | { type?: unknown; card?: unknown }
        | null;
      if (stored?.type === "share-card") {
        const parsed = parseCard(stored.card, data.enriched_at);
        if (parsed) return parsed;
      }
    }
  }

  const local = await loadFile();
  return parseCard(local[id], local[id]?.sharedAt);
}

function parseCard(
  raw: unknown,
  fallbackDate: unknown,
): ShareCardFields | null {
  if (!raw || typeof raw !== "object") return null;
  const card = raw as Partial<ShareCardFields>;
  const company = text(card.company);
  const founder = text(card.founder);
  if (!company && !founder) return null;
  const sharedAt = text(card.sharedAt) || text(fallbackDate);
  const timestamp = Date.parse(sharedAt);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > MAX_AGE_MS) {
    return null;
  }
  return {
    company,
    founder,
    blurb: text(card.blurb),
    website: text(card.website),
    domain: text(card.domain),
    stageTimeline: text(card.stageTimeline),
    funding: text(card.funding),
    pedigree: text(card.pedigree),
    hardware: text(card.hardware),
    moat: text(card.moat),
    tam: text(card.tam),
    auditStatus: text(card.auditStatus),
    linkedin: text(card.linkedin),
    github: text(card.github),
    twitter: text(card.twitter),
    notes: text(card.notes),
    ...compactShareProfile({
      name: card.profileName,
      headline: card.headline,
      avatar: card.avatar,
      experience: card.experience,
      education: card.education,
    }),
    sharedAt,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
