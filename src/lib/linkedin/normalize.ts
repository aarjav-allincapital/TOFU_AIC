import type { BrightDataProfile } from "./brightdata";
import type {
  LinkedInEducationItem,
  LinkedInExperienceItem,
  LinkedInPreview,
} from "./preview";

export type {
  LinkedInEducationItem,
  LinkedInExperienceItem,
  LinkedInPreview,
} from "./preview";
export { parseStoredLinkedInPreview } from "./preview";

function clean(s: unknown): string {
  const t = String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || /\[object Object\]/i.test(t)) return "";
  return t;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = clean(obj[k]);
    if (v) return v;
  }
  return "";
}

/** Bright Data splits dates across start_date/end_date — join into a range. */
function parseDuration(o: Record<string, unknown>): string {
  const explicit = pickString(o, ["duration", "date_range", "dates"]);
  if (explicit) return explicit;
  const start = pickString(o, ["start_date"]);
  const end = pickString(o, ["end_date"]);
  if (start && end) return `${start} – ${end}`;
  return start || end || "";
}

/** Pull a date range or tenure out of a "Role · Jan 2019 - Dec 2022" subtitle. */
function durationFromSubtitle(subtitle: string): string {
  for (const seg of subtitle.split("·").map((s) => s.trim())) {
    if (!seg) continue;
    if (/\d+\s*(?:yr|yrs|year|years|mo|mos|month|months)/i.test(seg)) return seg;
    if (/\d{4}/.test(seg) && /present|–|-|to /i.test(seg)) return seg;
  }
  return "";
}

/** Pull a role out of a "Role · Full-time" style subtitle. */
function roleFromSubtitle(subtitle: string, company: string): string {
  const first = subtitle.split("·")[0]?.trim() || "";
  if (!first) return "";
  if (first.toLowerCase() === company.toLowerCase()) return "";
  // Date-ish or duration-ish segments are not job titles.
  if (/\d{4}|\b(?:yr|yrs|mo|mos|present)\b/i.test(first)) return "";
  return first;
}

function parseExperience(raw: unknown): LinkedInExperienceItem[] {
  if (!Array.isArray(raw)) return [];
  const out: LinkedInExperienceItem[] = [];

  // An empty title is fine — the card promotes company to the primary line.
  const push = (item: LinkedInExperienceItem) => {
    if (!item.title && !item.company) return;
    out.push({
      title: item.title,
      company: item.company,
      duration: item.duration || "",
      logo: item.logo || "",
    });
  };

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const company = pickString(o, [
      "company",
      "company_name",
      "companyName",
    ]);
    const logo = pickString(o, [
      "company_logo_url",
      "company_logo",
      "logo",
      "logo_url",
    ]);

    // Bright Data sometimes nests multiple roles under one company.
    const positions = o.positions ?? o.roles ?? o.jobs;
    if (Array.isArray(positions) && positions.length > 0) {
      for (const pos of positions) {
        if (!pos || typeof pos !== "object") continue;
        const p = pos as Record<string, unknown>;
        let title = pickString(p, ["title", "position", "role"]);
        const subtitle = pickString(p, ["subtitle", "meta", "description"]);
        let dur = parseDuration(p);
        if (!dur && subtitle) dur = durationFromSubtitle(subtitle);
        if (title && company && title.toLowerCase() === company.toLowerCase()) {
          title = roleFromSubtitle(subtitle, company);
        }
        push({
          title,
          company,
          duration: dur,
          logo,
        });
        if (out.length >= 3) return out;
      }
      continue;
    }

    let title = pickString(o, ["title", "position", "role"]);
    const subtitle = pickString(o, ["subtitle", "meta"]);
    const duration = parseDuration(o);

    let companyName = company;
    if (title && companyName && title.toLowerCase() === companyName.toLowerCase()) {
      // Bright Data sometimes puts the company in `title` and the real role in
      // `subtitle` — don't lose the role.
      title =
        pickString(o, ["job_title", "description"]) ||
        roleFromSubtitle(subtitle, companyName);
    } else if (!companyName && subtitle) {
      companyName = subtitle.split("·")[0]?.trim() || subtitle;
    }

    let dur = duration;
    if (!dur && subtitle) {
      dur = durationFromSubtitle(subtitle);
      if (!dur && /present|–|-|to /i.test(subtitle) && !subtitle.includes("·")) {
        dur = subtitle;
      }
    }

    push({
      title,
      company: companyName,
      duration: dur,
      logo,
    });
    if (out.length >= 3) break;
  }
  return out;
}

/** "Title @ Company", degrading gracefully when either side is missing. */
function describeRole(e: LinkedInExperienceItem): string {
  if (e.title && e.company) return `${e.title} @ ${e.company}`;
  return e.title || e.company;
}

function parseEducation(raw: unknown): LinkedInEducationItem[] {
  if (!Array.isArray(raw)) return [];
  const out: LinkedInEducationItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const school = pickString(o, [
      "title",
      "school",
      "school_name",
      "name",
      "institute",
      "university",
    ]);
    if (!school) continue;
    const degreeParts = [
      pickString(o, ["degree", "degree_name"]),
      pickString(o, ["field", "field_of_study", "description", "subtitle"]),
    ].filter(Boolean);
    const degree = [...new Set(degreeParts)]
      .filter((p) => p.toLowerCase() !== school.toLowerCase())
      .join(", ");
    const logo = pickString(o, [
      "school_logo_url",
      "logo",
      "logo_url",
      "url",
    ]);
    // Avoid treating profile URLs as logos
    const safeLogo = /\.(png|jpe?g|webp|gif|svg)/i.test(logo) ? logo : "";
    out.push({ school, degree, logo: safeLogo });
    if (out.length >= 6) break;
  }
  return out;
}

export type LinkedInEnrichment = {
  preview: LinkedInPreview;
  /** Plain-text college/uni names (one per line) for elite-school fallback. */
  college: string;
  /** Legacy plain-text work lines (derived from preview). */
  workHistory: string;
};

/**
 * Extract a LinkedIn-style preview card from Bright Data profile JSON.
 */
export function extractLinkedInPreview(
  profile: BrightDataProfile,
  profileUrl: string,
): LinkedInEnrichment {
  let experience = parseExperience(profile.experience);
  if (experience.length === 0) {
    experience = parseExperience(profile.experiences);
  }

  let education = parseEducation(profile.education);
  if (education.length === 0) {
    education = parseEducation(profile.educations);
  }
  if (education.length === 0) {
    education = parseEducation(profile.educations_details);
  }

  if (experience.length === 0) {
    const cc = profile.current_company;
    const ccObj =
      typeof cc === "object" && cc ? (cc as Record<string, unknown>) : null;
    const ccName = ccObj
      ? pickString(ccObj, ["name"])
      : pickString(profile, ["current_company_name"]);
    const position = pickString(profile, ["position"]);
    const logo = ccObj
      ? pickString(ccObj, ["logo", "company_logo_url"])
      : "";
    if (ccName || position) {
      experience = [
        {
          title: position,
          company: ccName,
          duration: "",
          logo,
        },
      ];
    }
  }

  const name =
    pickString(profile, ["name", "full_name"]) ||
    [pickString(profile, ["first_name"]), pickString(profile, ["last_name"])]
      .filter(Boolean)
      .join(" ");
  const headline =
    pickString(profile, ["position", "headline", "about"]) ||
    (experience[0] ? describeRole(experience[0]) : "");
  const avatar = pickString(profile, [
    "avatar",
    "profile_pic_url",
    "profile_picture",
    "image",
  ]);

  const preview: LinkedInPreview = {
    url: profileUrl,
    name,
    headline: headline.slice(0, 220),
    avatar,
    // Keep latest 2–3 roles for the dashboard card.
    experience: experience.slice(0, 3),
    education: education.slice(0, 3),
  };

  const workHistory = preview.experience
    .map((e) => {
      const left = describeRole(e);
      return e.duration ? `${left} (${e.duration})` : left;
    })
    .join("\n");

  const college = [
    ...new Set(preview.education.map((e) => e.school).filter(Boolean)),
  ].join("\n");

  return { preview, college, workHistory };
}

/** @deprecated use extractLinkedInPreview */
export function extractWorkAndCollege(
  profile: BrightDataProfile,
): { workHistory: string; college: string } {
  const e = extractLinkedInPreview(profile, "");
  return { workHistory: e.workHistory, college: e.college };
}

