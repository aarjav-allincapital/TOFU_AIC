import { fetchDealsPayload } from "../sheet";
import type { DealSource } from "./types";

/** Wraps the existing Google Sheet (Apps Script / gviz) fetch logic. */
export const sheetSource: DealSource = {
  name: "sheet",
  fetch: fetchDealsPayload,
};
