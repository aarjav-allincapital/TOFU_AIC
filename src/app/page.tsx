import { AppShell } from "@/components/AppShell";
import { fetchDealsPayload } from "@/lib/deal-sources";
import { getSession } from "@/lib/auth/session";
import { scopeDealsForEmail } from "@/lib/deal-owner";
import type { DealsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  let initial: DealsPayload | undefined;
  try {
    const payload = await fetchDealsPayload();
    const session = await getSession();
    const deals = scopeDealsForEmail(payload.deals, session?.email);
    initial = { ...payload, deals, count: deals.length };
  } catch {
    initial = undefined;
  }

  return (
    <main>
      <AppShell initial={initial} />
    </main>
  );
}
