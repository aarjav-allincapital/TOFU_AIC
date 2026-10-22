"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  avatarColor,
  initialsFrom,
  loadWorkspace,
  saveWorkspace,
  type WorkspaceState,
} from "@/lib/workspace-local";
import { FolderIcon, UsersIcon, UserPlusIcon } from "./icons";

type TeamMember = {
  email: string;
  name: string;
  role: "admin" | "member" | "invited";
  invitedAt?: string;
  joinedAt?: string;
};

function MemberAvatar({
  member,
  size = 36,
  className = "",
}: {
  member: TeamMember;
  size?: number;
  className?: string;
}) {
  const initials = initialsFrom(member.name || member.email);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-white font-bold text-white shadow-sm ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: avatarColor(member.email),
      }}
      title={member.name || member.email}
    >
      {initials}
    </span>
  );
}

function roleLabel(role: TeamMember["role"]) {
  if (role === "admin") return "Admin";
  if (role === "invited") return "Invited";
  return "Member";
}

function Bone({ className }: { className?: string }) {
  return <div className={`skeleton-shimmer bg-surface-muted ${className ?? ""}`} />;
}

function BoneOnDark({ className }: { className?: string }) {
  return (
    <div className={`skeleton-shimmer-on-dark bg-white/10 ${className ?? ""}`} />
  );
}

function TeamSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading workspace</span>
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="bg-gradient-to-b from-neutral-900 via-neutral-900 to-neutral-800 px-6 pb-10 pt-12 sm:px-10">
          <div className="mb-6 flex justify-center">
            <div className="flex items-center -space-x-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <BoneOnDark
                  key={i}
                  className="h-10 w-10 rounded-full !bg-white/20 shadow-[0_0_0_2.5px_#171717]"
                />
              ))}
            </div>
          </div>
          <BoneOnDark className="mx-auto mb-4 h-11 w-11 rounded-xl" />
          <BoneOnDark className="mx-auto h-9 w-56 max-w-full rounded-lg" />
          <BoneOnDark className="mx-auto mt-3 h-3.5 w-72 max-w-full rounded-md" />
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <BoneOnDark className="h-3 w-24 rounded-md" />
            <BoneOnDark className="h-3 w-28 rounded-md" />
            <BoneOnDark className="h-3 w-20 rounded-md" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <Bone className="h-4 w-36 rounded-md" />
        <Bone className="mt-2 h-3 w-80 max-w-full rounded-md" />
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <Bone className="h-12 w-full rounded-xl sm:flex-1" />
          <Bone className="h-12 w-full rounded-xl sm:w-36" />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <Bone className="h-3 w-16 rounded-md" />
          <Bone className="h-3 w-6 rounded-md" />
        </div>
        <ul className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3.5">
              <Bone className="h-[38px] w-[38px] shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bone className="h-3.5 w-32 rounded-md" />
                <Bone className="h-3 w-48 max-w-full rounded-md" />
              </div>
              <Bone className="h-5 w-16 shrink-0 rounded-md" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function TeamView({
  currentEmail,
  currentName,
}: {
  currentEmail: string | null;
  currentName: string | null;
}) {
  const [workspaceName, setWorkspaceName] = useState("All In Capital");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("All In Capital");

  const loadRoster = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/team");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.members)) {
        setMembers(data.members);
      }
    } catch {
      // keep whatever we already have
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const local = loadWorkspace(currentEmail);
    setWorkspaceName(local.name);
    setNameDraft(local.name);
    void loadRoster();
  }, [currentEmail, currentName]);

  const activeCount = members.filter((m) => m.role !== "invited").length;
  const invitedCount = members.filter((m) => m.role === "invited").length;
  const stack = useMemo(() => members.slice(0, 8), [members]);

  const persistName = (name: string) => {
    const local = loadWorkspace(currentEmail);
    const next: WorkspaceState = { ...local, name, members: local.members };
    saveWorkspace(next);
    setWorkspaceName(name);
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target.endsWith("@allincapital.vc")) {
      setError("Only @allincapital.vc emails can join this workspace.");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("sending");
    try {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(data.error || "Failed to send invite.");
        return;
      }
      setStatus("sent");
      setEmail("");
      await loadRoster();
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  };

  const saveName = () => {
    const next = nameDraft.trim() || "All In Capital";
    persistName(next);
    setEditingName(false);
  };

  if (loading && members.length === 0) {
    return <TeamSkeleton />;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="relative bg-gradient-to-b from-neutral-900 via-neutral-900 to-neutral-800 px-6 pb-10 pt-12 text-center sm:px-10">
          <div className="mb-6 flex justify-center">
            <div className="flex items-center -space-x-2.5">
              {stack.map((m) => (
                <MemberAvatar
                  key={m.email}
                  member={m}
                  size={40}
                  className="ring-0 border-[2.5px] border-neutral-900"
                />
              ))}
              {members.length > stack.length && (
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-neutral-900 bg-neutral-700 text-[11px] font-bold text-white">
                  +{members.length - stack.length}
                </span>
              )}
            </div>
          </div>

          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white p-1.5 shadow-lg">
            <Image
              src="/all-in-logo.png"
              alt="All In Capital"
              width={36}
              height={36}
              className="h-full w-full object-contain"
            />
          </div>

          {editingName ? (
            <div className="mx-auto flex max-w-sm items-center justify-center gap-2">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    setNameDraft(workspaceName);
                    setEditingName(false);
                  }
                }}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center text-[28px] font-bold tracking-tight text-white outline-none placeholder:text-white/40"
              />
              <button
                type="button"
                onClick={saveName}
                className="rounded-lg bg-white px-3 py-2 text-[12px] font-bold text-neutral-900"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="group mx-auto block"
              title="Rename workspace"
            >
              <h2 className="text-[34px] font-bold tracking-tight text-white transition-opacity group-hover:opacity-90">
                {workspaceName}
              </h2>
            </button>
          )}

          <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-neutral-400">
            Your team workspace on TOFU — shared deal flow, ratings, and pipeline.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12.5px] text-neutral-400">
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon className="h-3.5 w-3.5" />
              {activeCount} teammate{activeCount === 1 ? "" : "s"}
              {invitedCount > 0 ? ` · ${invitedCount} invited` : ""}
            </span>
            <span className="text-neutral-600">·</span>
            <span className="inline-flex items-center gap-1.5">
              <FolderIcon className="h-3.5 w-3.5" />
              @allincapital.vc
            </span>
            <span className="text-neutral-600">·</span>
            <span>TOFU portal</span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-foreground">
              Invite teammates
            </h3>
            <p className="mt-1 text-[13px] text-muted">
              Anyone with an @allincapital.vc email can join. They&apos;ll get a
              branded invite with a one-time sign-in code.
            </p>
          </div>
        </div>

        <form className="flex flex-col gap-2.5 sm:flex-row" onSubmit={invite}>
          <input
            type="email"
            required
            placeholder="teammate@allincapital.vc"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setStatus("idle");
              setError(null);
            }}
            className="min-w-0 flex-1 rounded-xl border border-border-strong bg-white px-3.5 py-3 text-[14px] outline-none focus:border-foreground"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            <UserPlusIcon className="h-4 w-4" />
            {status === "sending" ? "Sending…" : "Send invite"}
          </button>
        </form>

        {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}
        {status === "sent" && !error && (
          <p className="mt-3 text-[12.5px] font-medium text-emerald-700">
            Invite sent — they&apos;ll appear below as Invited.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted-2">
            People
          </h3>
          <span className="text-[12px] font-semibold tabular-nums text-muted">
            {members.length}
          </span>
        </div>
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const isYou =
              !!currentEmail &&
              m.email.toLowerCase() === currentEmail.toLowerCase();
            return (
              <li
                key={m.email}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted/50"
              >
                <MemberAvatar member={m} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-foreground">
                    {m.name}
                    {isYou && (
                      <span className="ml-2 text-[11px] font-semibold text-muted-2">
                        you
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[12.5px] text-muted">{m.email}</div>
                </div>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                    m.role === "admin"
                      ? "border-neutral-200 bg-neutral-50 text-neutral-700"
                      : m.role === "invited"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-border bg-surface-muted text-muted"
                  }`}
                >
                  {roleLabel(m.role)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
