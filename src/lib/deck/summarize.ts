import "server-only";

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  return key;
}

function getModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export type DeckSummaryFields = {
  founders: string;
  raising: string;
  summary: string;
};

function cleanText(s: string): string {
  const t = s.trim();
  if (!t) return "";
  // Never surface JS object dumps in the portal.
  if (/\[object Object\]/i.test(t)) return "";
  if (/^\{[\s\S]*\}$/.test(t) && t.includes('"')) {
    // Looks like raw JSON blob — skip rather than show to users.
    return "";
  }
  return t;
}

function asPlainText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return cleanText(String(value));
  }
  if (Array.isArray(value)) {
    return cleanText(
      value
        .map((item) => {
          if (typeof item === "string") return cleanText(item);
          if (item && typeof item === "object") {
            const o = item as Record<string, unknown>;
            const name = cleanText(
              String(o.name || o.founder || o.full_name || ""),
            );
            const role = cleanText(
              String(
                o.role ||
                  o.title ||
                  o.background ||
                  o.bio ||
                  o.description ||
                  "",
              ),
            );
            if (name && role) return `${name} — ${role}`;
            if (name) return name;
            return "";
          }
          if (typeof item === "number" || typeof item === "boolean") {
            return String(item);
          }
          return "";
        })
        .filter(Boolean)
        .join("; "),
    );
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const name = cleanText(String(o.name || o.founder || o.full_name || ""));
    const role = cleanText(
      String(o.role || o.title || o.background || o.bio || o.description || ""),
    );
    if (name && role) return `${name} — ${role}`;
    if (name) return name;
    // Prefer known scalar keys over dumping the object.
    for (const key of ["text", "value", "amount", "raising", "summary"]) {
      const v = o[key];
      if (typeof v === "string" && cleanText(v)) return cleanText(v);
      if (typeof v === "number") return String(v);
    }
    return "";
  }
  return "";
}

/**
 * Extract founder bios + raise amount from deck text; short factual summary.
 * Used only for 5★ / 1★ deals with a PDF deck.
 */
export async function summarizeDeckText(opts: {
  company: string;
  sector: string;
  founder: string;
  text: string;
}): Promise<DeckSummaryFields> {
  const excerpt = opts.text.slice(0, 14_000);
  const prompt =
    `Extract fundraising + founder details from this pitch deck.\n` +
    `Company: ${opts.company || "Unknown"}\n` +
    `Sector: ${opts.sector || "—"}\n` +
    `Known founder name (email/sheet): ${opts.founder || "—"}\n\n` +
    `Deck text:\n${excerpt}\n\n` +
    `Return JSON only with STRING values (never objects or arrays):\n` +
    `{\n` +
    `  "founders": "Plain text: names + short background if stated. Use \\"\\" if unknown.",\n` +
    `  "raising": "Plain text: round size / instrument if stated. Use \\"\\" if unknown.",\n` +
    `  "summary": "2–4 factual sentences on product + traction. Use \\"\\" if nothing useful."\n` +
    `}\n` +
    `Omit inventing metrics. If a field is unknown, return an empty string — do not invent.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify({
      model: getModel(),
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract founder info and raise amount from pitch decks. JSON only. founders/raising/summary must be plain strings, never objects/arrays. Empty string when unknown.",
        },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = await res.json();
  const content = String(json.choices?.[0]?.message?.content ?? "").trim();
  const cleaned = content.replace(/^```json?\s*/i, "").replace(/```$/, "");
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const founders = asPlainText(parsed.founders);
  const raising = asPlainText(parsed.raising);
  const summary = asPlainText(parsed.summary);

  if (!founders && !raising && !summary) {
    throw new Error("Empty deck extraction from model");
  }

  return { founders, raising, summary };
}

/** Format structured fields into the portal deck_summary string.
 *  Skip any field that is missing or garbage — never show "[object Object]". */
export function formatDeckSummary(fields: DeckSummaryFields): string {
  const lines: string[] = [];
  const founders = cleanText(fields.founders);
  const raising = cleanText(fields.raising);
  const summary = cleanText(fields.summary);
  if (founders) lines.push(`Founders: ${founders}`);
  if (raising) lines.push(`Raising: ${raising}`);
  if (summary) {
    if (lines.length) lines.push("");
    lines.push(summary);
  }
  return lines.join("\n").trim();
}

