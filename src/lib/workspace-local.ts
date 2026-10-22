/** Local-first workspace store — team members live in the browser until a
 *  server-backed directory exists. Invites still go out via Resend. */

export type WorkspaceMember = {
  email: string;
  name: string;
  role: "admin" | "member" | "invited";
  invitedAt?: string;
  invitedBy?: string;
};

export type WorkspaceState = {
  name: string;
  members: WorkspaceMember[];
  updatedAt: string;
};

const STORAGE_KEY = "tofu-workspace-v2";

const AVATAR_COLORS = [
  "#78716c", // stone
  "#be185d", // pink
  "#c2410c", // orange
  "#475569", // slate
  "#7c3aed", // violet
  "#0f766e", // teal
  "#b45309", // amber
  "#1d4ed8", // blue
];

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

export function initialsFrom(nameOrEmail: string): string {
  const base = nameOrEmail.trim();
  if (!base) return "?";
  if (base.includes("@")) return base.charAt(0).toUpperCase();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function defaultState(): WorkspaceState {
  return {
    name: "All In Capital",
    members: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Drop the old seeded fake roster if it was ever written to localStorage.
 * Keep only: the signed-in user + people who were actually invited.
 */
function sanitizeMembers(
  members: WorkspaceMember[],
  selfEmail?: string | null,
): WorkspaceMember[] {
  const self = selfEmail?.trim().toLowerCase() || null;
  return members.filter((m) => {
    const email = m.email.trim().toLowerCase();
    if (self && email === self) return true;
    // Invited (or later promoted after accepting) — real invites always set invitedAt.
    if (m.invitedAt) return true;
    // Legacy: keep anyone marked invited even without timestamp.
    if (m.role === "invited") return true;
    return false;
  });
}

export function loadWorkspace(selfEmail?: string | null): WorkspaceState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as WorkspaceState;
    if (!parsed?.members || !Array.isArray(parsed.members)) return defaultState();
    return {
      name: parsed.name || "All In Capital",
      members: sanitizeMembers(parsed.members, selfEmail),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return defaultState();
  }
}

export function saveWorkspace(state: WorkspaceState) {
  if (typeof window === "undefined") return;
  const next = { ...state, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Ensure the signed-in user is on the roster (you). */
export function ensureSelf(
  state: WorkspaceState,
  email: string,
  name?: string | null,
): WorkspaceState {
  const normalized = email.trim().toLowerCase();
  const existing = state.members.find((m) => m.email === normalized);
  if (existing) {
    if (name && existing.name !== name) {
      return {
        ...state,
        members: state.members.map((m) =>
          m.email === normalized
            ? { ...m, name, role: m.role === "invited" ? "member" : m.role }
            : m,
        ),
      };
    }
    if (existing.role === "invited") {
      return {
        ...state,
        members: state.members.map((m) =>
          m.email === normalized ? { ...m, role: "member" } : m,
        ),
      };
    }
    return state;
  }
  return {
    ...state,
    members: [
      {
        email: normalized,
        name: name?.trim() || nameFromEmail(normalized),
        role: "admin",
      },
      ...state.members,
    ],
  };
}

export function upsertInvitedMember(
  state: WorkspaceState,
  email: string,
  invitedBy?: string,
): WorkspaceState {
  const normalized = email.trim().toLowerCase();
  if (state.members.some((m) => m.email === normalized)) {
    return {
      ...state,
      members: state.members.map((m) =>
        m.email === normalized
          ? {
              ...m,
              role: m.role === "admin" ? "admin" : "invited",
              invitedAt: new Date().toISOString(),
              invitedBy,
            }
          : m,
      ),
    };
  }
  return {
    ...state,
    members: [
      ...state.members,
      {
        email: normalized,
        name: nameFromEmail(normalized),
        role: "invited",
        invitedAt: new Date().toISOString(),
        invitedBy,
      },
    ],
  };
}

export function removeMember(state: WorkspaceState, email: string): WorkspaceState {
  return {
    ...state,
    members: state.members.filter((m) => m.email !== email.trim().toLowerCase()),
  };
}
