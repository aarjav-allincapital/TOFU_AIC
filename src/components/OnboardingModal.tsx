"use client";

import { useState } from "react";

export function OnboardingModal({
  email,
  initialName,
  onComplete,
}: {
  email: string;
  initialName: string;
  onComplete: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
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
      onComplete(data.name);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-surface p-7 shadow-xl fade-in">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
          Welcome to TOFU
        </p>
        <h2 className="mt-1.5 text-[18px] font-bold text-foreground">
          Confirm your profile
        </h2>
        <p className="mt-1.5 text-[13px] text-muted">
          We pulled your name from your email. You can edit it anytime in settings.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
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
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border-strong bg-white px-3.5 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground"
            />
          </div>
          {error && <p className="text-[12.5px] text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="w-full rounded-lg bg-foreground py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Continue to TOFU"}
          </button>
        </form>
      </div>
    </div>
  );
}
