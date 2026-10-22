/** Client-safe Tracxn types. The compact profile is what we store and render. */

export type TracxnMoney = {
  usd: number | null;
  currency: string;
};

export type TracxnRound = {
  name: string;
  usd: number | null;
  date: string;
};

export type TracxnInvestor = {
  name: string;
  type: string;
  website: string;
};

export type TracxnPerson = {
  name: string;
  designation: string;
};

export type TracxnProfile = {
  id: string;
  name: string;
  logo: string;
  website: string;
  domain: string;
  foundedYear: number | null;
  shortDescription: string;
  detailedDescription: string;
  location: string;
  stage: string;
  funded: boolean;
  xcorn: string;
  totalEquityFundingUsd: number | null;
  latestRound: TracxnRound | null;
  investors: TracxnInvestor[];
  keyPeople: TracxnPerson[];
  employeeCount: number | null;
  employeeCountAsOn: string;
  revenueUsd: number | null;
  revenueAsOn: string;
  valuationUsd: { min: number | null; max: number | null } | null;
  practiceAreas: string[];
  feeds: string[];
  incubators: string[];
  linkedin: string;
  twitter: string;
  tracxnScore: number | null;
  editorRating: number | null;
  editorRationale: string;
  lastUpdated: string;
};

export type TracxnVia =
  | "ok"
  | "not_found"
  | "no_token"
  | "no_domain"
  | "api_error"
  | "out_of_credits"
  | "forbidden"
  | "disabled";

export const TRACXN_VIA_LABEL: Record<TracxnVia, string> = {
  ok: "Found on Tracxn",
  not_found: "Not on Tracxn",
  no_token: "Tracxn key missing",
  no_domain: "No website to look up",
  api_error: "Tracxn lookup failed",
  out_of_credits: "Tracxn credits exhausted",
  forbidden: "Tracxn access denied",
  disabled: "Tracxn lookups paused",
};
