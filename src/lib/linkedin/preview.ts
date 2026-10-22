/** Client-safe LinkedIn preview parsing (no server-only imports). */

export type LinkedInExperienceItem = {
  title: string;
  company: string;
  duration: string;
  logo: string;
};

export type LinkedInEducationItem = {
  school: string;
  degree: string;
  logo: string;
};

export type LinkedInPreview = {
  url: string;
  name: string;
  headline: string;
  avatar: string;
  experience: LinkedInExperienceItem[];
  education: LinkedInEducationItem[];
};

/** "Role" was an older placeholder for an unknown title — treat it as absent. */
function storedTitle(raw: unknown): string {
  const t = String(raw || "").trim();
  return t === "Role" ? "" : t;
}

/** Parse stored preview JSON (or synthesize from legacy plain text). */
export function parseStoredLinkedInPreview(
  workHistoryOrJson: string | null | undefined,
  college: string | null | undefined,
  profileUrl: string,
): LinkedInPreview | null {
  const raw = (workHistoryOrJson || "").trim();
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as LinkedInPreview;
      if (parsed && typeof parsed === "object") {
        return {
          url: parsed.url || profileUrl,
          name: typeof parsed.name === "string" ? parsed.name : "",
          headline: typeof parsed.headline === "string" ? parsed.headline : "",
          avatar: typeof parsed.avatar === "string" ? parsed.avatar : "",
          experience: Array.isArray(parsed.experience)
            ? parsed.experience
                .map((e) => ({
                  title: storedTitle(e?.title),
                  company: String(e?.company || ""),
                  duration: String(e?.duration || ""),
                  logo: String(e?.logo || ""),
                }))
                .slice(0, 3)
            : [],
          education: Array.isArray(parsed.education)
            ? parsed.education.map((e) => ({
                school: String(e?.school || ""),
                degree: String(e?.degree || ""),
                logo: String(e?.logo || ""),
              }))
            : [],
        };
      }
    } catch {
      /* fall through */
    }
  }

  if (!raw && !(college || "").trim()) return null;

  // Never render raw JSON as a work line.
  if (raw.startsWith("{")) return null;

  const experience = raw
    ? raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith("{"))
        .map((line) => {
          const m = line.match(/^(.+?)\s+@\s+(.+?)(?:\s+\((.+)\))?$/);
          if (m) {
            return {
              title: storedTitle(m[1]),
              company: m[2],
              duration: m[3] || "",
              logo: "",
            };
          }
          return { title: line, company: "", duration: "", logo: "" };
        })
    : [];
  const education = (college || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((school) => ({ school, degree: "", logo: "" }));

  if (experience.length === 0 && education.length === 0) return null;

  return {
    url: profileUrl,
    name: "",
    headline: "",
    avatar: "",
    experience,
    education,
  };
}
