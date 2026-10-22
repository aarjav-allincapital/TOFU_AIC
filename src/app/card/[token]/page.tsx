import type { Metadata } from "next";
import { ShareCard } from "@/components/ShareCard";
import { shareTitle } from "@/lib/sourcing/share-card";
import { readShareCard } from "@/lib/sourcing/share-token";

export const dynamic = "force-dynamic";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://tofu-aic.vercel.app").replace(
  /\/$/,
  "",
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const card = await readShareCard(token);
  const pageUrl = `${APP_URL}/card/${token}`;
  if (!card) {
    return {
      metadataBase: new URL(APP_URL),
      title: { absolute: "All In Capital" },
      description: "This shared card is not available.",
      robots: { index: false, follow: false },
      openGraph: {
        title: "All In Capital",
        description: "This shared card is not available.",
        url: pageUrl,
        siteName: "All In Capital",
        type: "website",
      },
    };
  }
  const title = shareTitle(card.company, card.founder);
  const description = card.blurb || `${title} — a deal from All In Capital.`;
  return {
    metadataBase: new URL(APP_URL),
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "All In Capital",
      type: "website",
      images: [
        {
          url: `${pageUrl}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ShareCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const card = await readShareCard(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f2ef] px-4 py-10 font-sans">
      {card ? (
        <ShareCard card={card} />
      ) : (
        <p className="font-sans text-[15px] text-neutral-600">This card is not available.</p>
      )}
    </main>
  );
}
