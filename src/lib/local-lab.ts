/**
 * Jev ratings stay on `next dev`. Deal sourcing is on for every signed-in
 * @allincapital.vc account, including production.
 * Override Jev with NEXT_PUBLIC_ENABLE_LOCAL_LAB=1|0.
 */
export function isLocalLab(): boolean {
  const flag = (process.env.NEXT_PUBLIC_ENABLE_LOCAL_LAB || "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.NODE_ENV !== "production";
}
