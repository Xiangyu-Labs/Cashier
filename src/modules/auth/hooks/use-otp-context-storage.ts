"use client";

import { useCallback, useEffect, useState } from "react";
import type { LoginMode, LoginStep } from "./use-login-url-state";

const OTP_CONTEXT_KEY = "cashier:login-otp-context:v1";

interface StoredOtpContext {
  email: string;
  expiresAt: number;
  canResendAt: number;
}

interface UseOtpContextStorageOptions {
  mode: LoginMode;
  rawStep: string | null;
  setEmail: (email: string) => void;
  setOtpExpiry: (expiresAt: number, canResendAt: number) => void;
  writeFlowUrl: (mode: LoginMode, step: LoginStep, replace?: boolean) => void;
}

function readOtpContext(): StoredOtpContext | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(OTP_CONTEXT_KEY);
    if (raw == null) return null;
    const stored = JSON.parse(raw) as Partial<StoredOtpContext>;
    if (
      typeof stored.email === "string" &&
      stored.email !== "" &&
      typeof stored.expiresAt === "number" &&
      Number.isFinite(stored.expiresAt) &&
      stored.expiresAt > Math.floor(Date.now() / 1000) &&
      typeof stored.canResendAt === "number" &&
      Number.isFinite(stored.canResendAt)
    ) {
      return {
        email: stored.email,
        expiresAt: stored.expiresAt,
        canResendAt: stored.canResendAt,
      };
    }
  } catch {
    // Treat unreadable or malformed context as absent.
  }
  return null;
}

export function useOtpContextStorage({
  mode,
  rawStep,
  setEmail,
  setOtpExpiry,
  writeFlowUrl,
}: UseOtpContextStorageOptions) {
  const needsHydration = rawStep === "otp" && mode === "otp";
  const [contextHydrated, setContextHydrated] = useState(!needsHydration);

  const clearOtpContext = useCallback(() => {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.removeItem(OTP_CONTEXT_KEY);
    } catch {
      // Storage is disabled or restricted; the login flow must still work.
    }
  }, []);

  const storeOtpContext = useCallback((context: StoredOtpContext) => {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.setItem(OTP_CONTEXT_KEY, JSON.stringify(context));
    } catch {
      // Best-effort persistence only: the in-memory draft store still drives the UI.
    }
  }, []);

  useEffect(() => {
    if (!needsHydration) return;
    const stored = readOtpContext();
    const now = Math.floor(Date.now() / 1000);
    if (stored != null && stored.expiresAt > now) {
      setEmail(stored.email);
      setOtpExpiry(stored.expiresAt, stored.canResendAt);
    } else {
      clearOtpContext();
      writeFlowUrl("otp", "email", true);
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setContextHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [clearOtpContext, needsHydration, setEmail, setOtpExpiry, writeFlowUrl]);

  return { contextHydrated, clearOtpContext, storeOtpContext };
}
