"use client";

import { useState } from "react";
import {
  loadWorkspace,
  saveWorkspace,
  upsertInvitedMember,
} from "@/lib/workspace-local";
import { CloseIcon } from "./icons";

export function InviteTeamModal({
  onClose,
  invitedBy,
}: {
  onClose: () => void;
  invitedBy?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target.endsWith("@allincapital.vc")) {
      setError("Only @allincapital.vc emails can be invited.");
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
      // Keep local workspace roster in sync (local-first).
      const ws = loadWorkspace(invitedBy?.includes("@") ? invitedBy : undefined);
      saveWorkspace(upsertInvitedMember(ws, target, invitedBy || undefined));
      setStatus("sent");
      setEmail("");
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border border-border bg-surface p-6 shadow-xl fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-[16px] font-bold text-foreground">Invite your team</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-sidebar-active hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-5 text-[13px] text-muted">
          Invite anyone with an @allincapital.vc email to the TOFU workspace.
        </p>

        <form className="flex gap-2" onSubmit={invite}>
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
            className="min-w-0 flex-1 rounded-lg border border-border-strong bg-white px-3 py-2 text-[13px] outline-none focus:border-foreground"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {status === "sending" ? "Sending…" : "Invite"}
          </button>
        </form>

        {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}
        {status === "sent" && !error && (
          <p className="mt-3 text-[12.5px] text-emerald-700">
            Invite sent — check Team to see them on the roster.
          </p>
        )}
      </div>
    </div>
  );
}
