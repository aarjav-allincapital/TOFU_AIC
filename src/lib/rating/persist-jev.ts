import "server-only";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "../supabase-admin-core";
import { writeJevStore, type StoredJevRating } from "./jev-store";

let jevColumnsMissing = false;

export async function persistJevRating(
  rowIndex: number,
  rating: StoredJevRating,
): Promise<void> {
  await writeJevStore(rowIndex, rating);

  if (!isSupabaseAdminConfigured || jevColumnsMissing) return;
  const admin = getSupabaseAdminCore();
  const { error } = await admin
    .from("deals")
    .update({
      jev_rating_stars: rating.stars,
      jev_worth: rating.worth,
      jev_summary: rating.summary,
      jev_via: rating.via,
      jev_rated_at: rating.ratedAt,
    })
    .eq("row_index", rowIndex);

  if (error && /jev_rating_stars|jev_worth|jev_summary|jev_via|jev_rated_at/i.test(error.message)) {
    jevColumnsMissing = true;
    console.warn(
      "[jev] Supabase jev_* columns missing — using local .data/jev-ratings.json. Run supabase/migrate-jev-rating.sql to persist in the DB.",
    );
  } else if (error) {
    console.warn("[jev] persist failed:", error.message);
  }
}

/** Write AI rating fields only — no auto-pass, email, or Attio. */
export async function persistAiRatingOnly(
  rowIndex: number,
  rating: {
    stars: number;
    worth: string;
    summary: string;
    via: string;
    mode: string;
  },
): Promise<void> {
  if (!isSupabaseAdminConfigured) return;
  const admin = getSupabaseAdminCore();
  const { error } = await admin
    .from("deals")
    .update({
      ai_rating_stars: rating.stars,
      ai_worth: rating.worth,
      ai_summary: rating.summary,
      ai_via: rating.via,
      ai_mode: rating.mode,
      ai_rated_at: new Date().toISOString(),
    })
    .eq("row_index", rowIndex);
  if (error) {
    console.warn("[jev] restore AI rating failed:", error.message);
  }
}
