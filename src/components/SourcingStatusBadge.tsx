import type { SourcingStatus } from "@/lib/sourcing/types";

const STYLES: Record<
  SourcingStatus,
  { dot: string; badge: string }
> = {
  New: {
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 border-blue-100",
  },
  Watching: {
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 border-amber-100",
  },
  Outreach: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  Passed: {
    dot: "bg-neutral-400",
    badge: "bg-neutral-100 text-neutral-500 border-neutral-200",
  },
};

export function SourcingStatusBadge({ status }: { status: SourcingStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold ${s.badge}`}
    >
      <span className={`h-1 w-1 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
