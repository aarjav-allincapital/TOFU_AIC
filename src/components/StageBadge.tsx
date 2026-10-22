import { STAGE_STYLES, type Stage } from "@/lib/deal-utils";

export function StageBadge({ stage }: { stage: Stage }) {
  const s = STAGE_STYLES[stage];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold ${s.badge}`}
    >
      <span className={`h-1 w-1 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
