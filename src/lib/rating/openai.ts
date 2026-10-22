import "server-only";

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  return key;
}

function getModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export async function callOpenAI(prompt: string): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify({
      model: getModel(),
      temperature: 0,
      max_tokens: 120,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "JSON only. star_rating 0-5. worth must be yes|review|no. " +
            "DEFAULT worth=no. Target mix ~90% no, ~5% review, ~5% yes. " +
            "yes ONLY if elite pedigree (IIT/IIM/ISB/BITS/Harvard/Stanford/MIT/Berkeley/Oxford/Cambridge/Emergent) is explicitly present — then star_rating≥4. " +
            "Never invent pedigree. Prefer no when unsure.",
        },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = await res.json();
  const content = (json.choices?.[0]?.message?.content ?? "").trim();
  const cleaned = content.replace(/^```json?\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned);
}
