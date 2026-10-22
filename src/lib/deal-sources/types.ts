import type { DealsPayload } from "../types";

/**
 * A pluggable deal data source. Implement this for any new system of record
 * (Sheet, Supabase, Attio, ...) and swap it into `deal-sources/index.ts`
 * without touching API routes, hooks, or components.
 */
export interface DealSource {
  name: DealsPayload["source"];
  fetch(): Promise<DealsPayload>;
}
