import type { Deal } from "@/lib/types";
import {
  AttioError,
  attioFetch,
  getDealFlowListSlug,
} from "./client";
import { upsertCompany } from "./inbound-sync";

type AttioEntry = {
  id: { entry_id: string };
  entry_values?: {
    deal_stage?: { status?: { title?: string } }[];
  };
};

const STAGE_ATTR =
  process.env.ATTIO_DEAL_FLOW_STAGE_ATTR || "deal_stage";

function dealStageTitle(entry: AttioEntry): string {
  return String(entry.entry_values?.deal_stage?.[0]?.status?.title || "").trim();
}

type RecordEntry = {
  list_api_slug?: string;
  list_id?: string;
  entry_id: string;
};

/** Find this company's existing Deal Flow entry (if any) and its current column. */
async function findDealFlowEntry(
  companyId: string,
  list: string,
): Promise<{ entryId: string; stage: string } | null> {
  const res = await attioFetch<{ data: RecordEntry[] }>(
    `/objects/companies/records/${companyId}/entries`,
  );
  const hit = (res.data || []).find((e) => e.list_api_slug === list);
  if (!hit) return null;
  const entry = await attioFetch<{ data: AttioEntry }>(
    `/lists/${list}/entries/${hit.entry_id}`,
  );
  return { entryId: hit.entry_id, stage: dealStageTitle(entry.data) };
}

export type ManualDealFlowResult = {
  entryId: string;
  stage: string;
  previousStage: string | null;
  /** created = new card; moved = existing card changed column; unchanged = same column. */
  status: "created" | "moved" | "unchanged";
  ownerSet: boolean;
  ownerError: string | null;
};

/**
 * Manual "Add to Attio" from the portal — a human picked the column and the
 * owner. This may move an existing card to the chosen column.
 */
export async function pushDealToDealFlow(
  deal: Deal,
  opts: { stage: string; ownerEmail?: string | null },
): Promise<ManualDealFlowResult> {
  const list = getDealFlowListSlug();
  const companyId = await upsertCompany(deal);
  const existing = await findDealFlowEntry(companyId, list);

  const baseValues: Record<string, unknown> = { [STAGE_ATTR]: opts.stage };
  const ownerValue = opts.ownerEmail
    ? [{ workspace_member_email_address: opts.ownerEmail }]
    : null;

  const write = async (values: Record<string, unknown>) => {
    if (existing) {
      await attioFetch(`/lists/${list}/entries/${existing.entryId}`, {
        method: "PATCH",
        body: JSON.stringify({ data: { entry_values: values } }),
      });
      return existing.entryId;
    }
    const res = await attioFetch<{ data: AttioEntry }>(
      `/lists/${list}/entries`,
      {
        method: "PUT",
        body: JSON.stringify({
          data: {
            parent_record_id: companyId,
            parent_object: "companies",
            entry_values: values,
          },
        }),
      },
    );
    return res.data.id.entry_id;
  };

  let ownerSet = false;
  let ownerError: string | null = null;
  let entryId: string;

  try {
    entryId = await write(
      ownerValue ? { ...baseValues, owner: ownerValue } : baseValues,
    );
    ownerSet = Boolean(ownerValue);
  } catch (err) {
    // Owner email not an Attio workspace member → retry with stage only.
    if (!ownerValue || !(err instanceof AttioError) || err.status !== 400) {
      throw err;
    }
    ownerError = `Owner not set — ${opts.ownerEmail} is not an Attio workspace member.`;
    entryId = await write(baseValues);
  }

  const previousStage = existing?.stage || null;
  const status: ManualDealFlowResult["status"] = !existing
    ? "created"
    : previousStage === opts.stage
      ? "unchanged"
      : "moved";

  return {
    entryId,
    stage: opts.stage,
    previousStage,
    status,
    ownerSet,
    ownerError,
  };
}
