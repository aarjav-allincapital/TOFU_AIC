/** Derive a display name from an email local-part.
 *  aarjav@… → Aarjav · aarjav.shah@… → Aarjav Shah · kb@… → Kb
 */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "Teammate";
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
