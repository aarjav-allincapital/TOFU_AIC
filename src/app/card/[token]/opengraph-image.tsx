import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import {
  formatShareDate,
  shareDetails,
  shareHost,
  shareTitle,
} from "@/lib/sourcing/share-card";
import { readShareCard } from "@/lib/sourcing/share-token";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function asDataUri(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32 || buf.length > 900_000) return null;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!type.startsWith("image/")) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "AI"
  );
}

export default async function CardImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const card = await readShareCard(token);
  const title = card ? shareTitle(card.company, card.founder) : "All In Capital";
  const person = card?.profileName || card?.founder || title;
  const headline = card?.headline || "";
  const dateLabel = card ? formatShareDate(card.sharedAt) : "";
  const blurb = card?.blurb || "";
  const host = (card && shareHost(card.website)) || "";
  const highlights = card ? shareDetails(card).slice(0, 2) : [];
  const experience = card?.experience.slice(0, 2) ?? [];
  const logo = await readFile(path.join(process.cwd(), "public/all-in-logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  const avatarSrc = card?.avatar ? await asDataUri(card.avatar) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f3f2ef",
          padding: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            background: "white",
            borderRadius: 28,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: 96,
              padding: "0 44px",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <img src={logoSrc} alt="" width={132} height={67} />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "36px 44px 32px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt=""
                  width={92}
                  height={92}
                  style={{
                    borderRadius: 92,
                    objectFit: "cover",
                    marginRight: 24,
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    width: 92,
                    height: 92,
                    borderRadius: 92,
                    background: "#e5e7eb",
                    color: "#525252",
                    fontSize: 30,
                    fontWeight: 700,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 24,
                  }}
                >
                  {initials(person)}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 650, lineHeight: 1.1 }}>
                  {person}
                </div>
                {headline ? (
                  <div style={{ display: "flex", marginTop: 8, fontSize: 22, color: "#525252" }}>
                    {headline}
                  </div>
                ) : null}
                <div style={{ display: "flex", marginTop: 8, fontSize: 20, color: "#737373" }}>
                  {title}
                  {dateLabel ? `  ·  ${dateLabel}` : ""}
                </div>
              </div>
            </div>
            {experience[0] ? (
              <div style={{ display: "flex", marginTop: 22, fontSize: 20, color: "#404040" }}>
                {`${experience[0].title || experience[0].company}${
                  experience[0].title && experience[0].company
                    ? ` · ${experience[0].company}`
                    : ""
                }`}
              </div>
            ) : null}
            {blurb ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 16,
                  fontSize: 22,
                  lineHeight: 1.35,
                  color: "#262626",
                }}
              >
                {blurb}
              </div>
            ) : null}
            {highlights.map(({ label, value }) => (
              <div
                key={label}
                style={{ display: "flex", marginTop: 8, fontSize: 18, color: "#525252" }}
              >
                {`${label}: ${value}`}
              </div>
            ))}
            {host ? (
              <div style={{ display: "flex", marginTop: 16, fontSize: 18, color: "#0a0a0a" }}>
                {host}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
