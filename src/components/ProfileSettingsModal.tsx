"use client";

import { useState } from "react";
import { CloseIcon, LogoutIcon } from "./icons";

export function ProfileSettingsModal({
  email,
  initialName,
  onClose,
  onSaved,
  onLogout,
}: {
  email: string;
  initialName: string;
  onClose: () => void;
  onSaved: (name: string) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save profile.");
        return;
      }
      onSaved(data.name);
      setSaved(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl border border-border bg-surface p-6 shadow-xl fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-[16px] font-bold text-foreground">Profile settings</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-sidebar-active hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-5 text-[13px] text-muted">
          Update how your name appears in TOFU.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-muted">
              Email
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-[14px] text-muted"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-muted">
              Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              className="w-full rounded-lg border border-border-strong bg-white px-3.5 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground"
            />
          </div>
          {error && <p className="text-[12.5px] text-red-600">{error}</p>}
          {saved && !error && (
            <p className="text-[12.5px] text-emerald-700">Profile saved.</p>
          )}
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="w-full rounded-lg bg-foreground py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </form>

        <div className="mt-5 border-t border-border pt-4">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-[13px] font-semibold text-foreground hover:bg-sidebar-active"
          >
            <LogoutIcon className="h-4 w-4" />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
