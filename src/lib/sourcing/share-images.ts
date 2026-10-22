import "server-only";
import { isRemoteImage, type ShareCardFields } from "./share-card";

const MAX_BYTES = 250_000;
const TIMEOUT_MS = 4000;

/**
 * Copy a remote image into the card as a data URI so recipients never depend
 * on LinkedIn's CDN (signed URLs expire and in-app browsers are often blocked).
 */
export async function inlineImage(url: string): Promise<string> {
  if (!isRemoteImage(url)) return url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return url;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(type)) return url;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32 || buf.length > MAX_BYTES) return url;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}

export function hasRemoteImages(card: ShareCardFields): boolean {
  return (
    isRemoteImage(card.avatar) ||
    card.experience.some((row) => isRemoteImage(row.logo)) ||
    card.education.some((row) => isRemoteImage(row.logo))
  );
}

/** Inline the founder photo and company/school logos. Leaves text untouched. */
export async function inlineShareImages(card: ShareCardFields): Promise<ShareCardFields> {
  if (!hasRemoteImages(card)) return card;
  const [avatar, experience, education] = await Promise.all([
    inlineImage(card.avatar),
    Promise.all(
      card.experience.map(async (row) => ({ ...row, logo: await inlineImage(row.logo) })),
    ),
    Promise.all(
      card.education.map(async (row) => ({ ...row, logo: await inlineImage(row.logo) })),
    ),
  ]);
  return { ...card, avatar, experience, education };
}
