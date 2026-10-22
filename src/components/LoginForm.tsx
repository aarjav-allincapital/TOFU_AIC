"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Step = "email" | "code";

const CODE_LENGTH = 6;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const verifying = useRef(false);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  useEffect(() => {
    if (step === "code") boxes.current[0]?.focus();
  }, [step]);

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1 && cooldownTimer.current) clearInterval(cooldownTimer.current);
        return Math.max(0, current - 1);
      });
    }, 1000);
  };

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setDigits(Array(CODE_LENGTH).fill(""));
      setStep("code");
      startCooldown(30);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const verifyCode = async (nextDigits: string[]) => {
    const code = nextDigits.join("");
    if (code.length < CODE_LENGTH || verifying.current) return;
    verifying.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Incorrect code.");
        setDigits(Array(CODE_LENGTH).fill(""));
        boxes.current[0]?.focus();
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      verifying.current = false;
      setPending(false);
    }
  };

  const writeDigits = (index: number, raw: string) => {
    const incoming = raw.replace(/\D/g, "");
    if (!incoming) return;
    const next = [...digits];
    const chars = incoming.slice(0, CODE_LENGTH - index).split("");
    chars.forEach((char, offset) => {
      next[index + offset] = char;
    });
    setDigits(next);
    const focusAt = Math.min(index + chars.length, CODE_LENGTH - 1);
    boxes.current[focusAt]?.focus();
    if (next.every((digit) => digit.length === 1)) void verifyCode(next);
  };

  const onDigitKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Backspace") return;
    event.preventDefault();
    const next = [...digits];
    if (next[index]) {
      next[index] = "";
      setDigits(next);
      return;
    }
    if (index === 0) return;
    next[index - 1] = "";
    setDigits(next);
    boxes.current[index - 1]?.focus();
  };

  return (
    <div className="w-full max-w-[440px]">
      {step === "email" ? (
        <form onSubmit={requestCode}>
          <h1 className="text-[40px] font-semibold leading-none tracking-tight text-neutral-950">
            Sign in to Tofu
          </h1>
          <p className="mt-4 text-[17px] text-neutral-500">
            We&apos;ll send you a code to sign in.
          </p>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="you@allincapital.vc"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="signin-field mt-8 w-full rounded-lg border bg-white px-4 py-3.5 text-[16px] text-neutral-950 outline-none placeholder:text-neutral-400"
          />
          <p className="mt-6 text-[15px] leading-relaxed text-neutral-500">
            By clicking the &quot;Send code&quot; button, I agree to receive a one-time
            sign-in code at my @allincapital.vc email.
          </p>
          {error ? <p className="mt-4 text-[14px] text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-950 py-4 text-[16px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send code"}
            {pending ? null : <span aria-hidden>→</span>}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void verifyCode(digits);
          }}
        >
          <h1 className="text-[40px] font-semibold leading-none tracking-tight text-neutral-950">
            Enter your code
          </h1>
          <p className="mt-4 text-[17px] leading-snug text-neutral-500">
            We sent a 6-digit code to {email}.
          </p>
          <div className="mt-8 flex gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  boxes.current[index] = node;
                }}
                value={digit}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${index + 1}`}
                maxLength={index === 0 ? CODE_LENGTH : 1}
                onChange={(event) => writeDigits(index, event.target.value)}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (!/\d/.test(text)) return;
                  event.preventDefault();
                  writeDigits(index, text);
                }}
                onKeyDown={(event) => onDigitKeyDown(index, event)}
                onFocus={(event) => event.currentTarget.select()}
                className="signin-box shrink-0 rounded-lg border bg-white text-center text-[22px] text-neutral-950 outline-none"
              />
            ))}
          </div>
          {error ? <p className="mt-4 text-[14px] text-red-600">{error}</p> : null}
          <p className="mt-8 text-[15px] leading-relaxed text-neutral-500">
            No code yet? Check spam or filtered mail.
          </p>
          <p className="mt-1 text-[15px] text-neutral-500">
            {cooldown > 0 ? (
              <span className="underline decoration-neutral-300 underline-offset-2">
                Send a new code in {cooldown}s
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void requestCode()}
                disabled={pending}
                className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-950 disabled:opacity-50"
              >
                Send a new code
              </button>
            )}{" "}
            or{" "}
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setDigits(Array(CODE_LENGTH).fill(""));
                setError(null);
              }}
              className="text-neutral-800 underline decoration-neutral-400 underline-offset-2 hover:text-neutral-950"
            >
              change email
            </button>
            .
          </p>
        </form>
      )}
    </div>
  );
}
