import "server-only";
import type { BucketValue } from "@/lib/types";

export type TeamMember = {
  value: BucketValue;
  displayName: string;
  /** Full name used in founder call-invite emails. */
  fullName: string;
  email: string;
  calendlyUrl: string;
  /** Optional LinkedIn profile shown in the call-invite email. */
  linkedinUrl?: string;
};

/**
 * Calendar + identity per call bucket.
 * Env vars (CALENDLY_*) override the defaults below without a redeploy.
 */
type CallBucket = Exclude<
  BucketValue,
  "pass" | "pass_temporary" | "pass_by_aditya" | "request_info"
>;

export const TEAM_MEMBERS: Record<CallBucket, TeamMember> = {
  call_with_aarjav: {
    value: "call_with_aarjav",
    displayName: "Aarjav",
    fullName: "Aarjav",
    email: "aarjav@allincapital.vc",
    calendlyUrl:
      process.env.CALENDLY_AARJAV ||
      "https://calendar.app.google/EsVwwxnN45VjrK9v6",
    linkedinUrl:
      process.env.LINKEDIN_AARJAV ||
      "https://www.linkedin.com/in/aarjavshah365/",
  },
  call_with_siddharth: {
    value: "call_with_siddharth",
    displayName: "Siddharth",
    fullName: "Siddharth",
    email:
      process.env.SIDDHARTH_EMAIL || "siddharth@allincapital.vc",
    calendlyUrl:
      process.env.CALENDLY_SIDDHARTH ||
      "https://calendar.app.google/McgHTCPJ1sXfoppz9",
  },
  call_with_kushal: {
    value: "call_with_kushal",
    displayName: "Kushal",
    fullName: "Kushal Bhagia",
    email: "kb@allincapital.vc",
    calendlyUrl:
      process.env.CALENDLY_KUSHAL || "https://cal.com/kushal-bhagia/30min",
    linkedinUrl:
      process.env.LINKEDIN_KUSHAL ||
      "https://www.linkedin.com/in/kushalbhagia/",
  },
  call_with_simran: {
    value: "call_with_simran",
    displayName: "Simran",
    fullName: "Simran Patel",
    email: "simran@allincapital.vc",
    calendlyUrl:
      process.env.CALENDLY_SIMRAN ||
      "https://calendar.app.google/7zQLitFE6cQcgCof7",
    linkedinUrl:
      process.env.LINKEDIN_SIMRAN ||
      "https://www.linkedin.com/in/simran-patel-1025ab87/",
  },
  call_with_disha: {
    value: "call_with_disha",
    displayName: "Disha",
    fullName: "Disha Choudhary",
    email: "disha@allincapital.vc",
    calendlyUrl:
      process.env.CALENDLY_DISHA ||
      "https://calendar.app.google/bVUfu2nidbD6JMe16",
    linkedinUrl:
      process.env.LINKEDIN_DISHA ||
      "https://www.linkedin.com/in/disha-choudhary-526140206/",
  },
  call_with_aditya1: {
    value: "call_with_aditya1",
    displayName: "Aditya",
    fullName: "Aditya Pratap Singh",
    email: "as@allincapital.vc",
    calendlyUrl:
      process.env.CALENDLY_ADITYA1 ||
      "https://calendar.app.google/6qCjzHUsZYK24V7G7",
  },
  call_with_aditya2: {
    value: "call_with_aditya2",
    displayName: "Aditya",
    fullName: "Aditya Singh",
    email: "adityasingh2@allincapital.vc",
    calendlyUrl:
      process.env.CALENDLY_ADITYA2 ||
      "https://calendly.com/adityasingh2-allincapital/30min",
    linkedinUrl:
      process.env.LINKEDIN_ADITYA2 ||
      "https://www.linkedin.com/in/aditya-singh-55944422b/",
  },
};

export function isCallBucket(
  bucket: string,
): bucket is CallBucket {
  return bucket in TEAM_MEMBERS;
}
