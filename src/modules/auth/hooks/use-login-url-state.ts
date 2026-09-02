"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type LoginMode = "password" | "otp";
export type LoginStep = "email" | "otp";

function sanitizeCallbackUrl(value: string | null): string {
  return value != null && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function useLoginUrlState(initialMode: LoginMode) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const callbackUrl = sanitizeCallbackUrl(searchParams.get("callbackUrl"));
  const rawMode = searchParams.get("authMode");
  const mode: LoginMode = rawMode === "password" || rawMode === "otp" ? rawMode : initialMode;
  const rawStep = searchParams.get("authStep");
  const step: LoginStep = mode === "otp" && rawStep === "otp" ? "otp" : "email";

  const writeFlowUrl = useCallback(
    (nextMode: LoginMode, nextStep: LoginStep, replace = false) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextMode === initialMode) params.delete("authMode");
      else params.set("authMode", nextMode);
      if (nextStep === "email") params.delete("authStep");
      else params.set("authStep", nextStep);
      const query = params.toString();
      const url = query === "" ? pathname : `${pathname}?${query}`;
      // Passing null lets Next copy its internal history state and update useSearchParams.
      if (replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [initialMode, pathname, searchParams]
  );

  useEffect(() => {
    const invalidMode = rawMode != null && rawMode !== "password" && rawMode !== "otp";
    const invalidStep =
      rawStep != null &&
      ((rawStep !== "email" && rawStep !== "otp") || (mode === "password" && rawStep === "otp"));
    if (invalidMode || invalidStep || (mode === "password" && rawStep != null)) {
      writeFlowUrl(mode, "email", true);
    }
  }, [mode, rawMode, rawStep, writeFlowUrl]);

  return { callbackUrl, mode, step, rawStep, writeFlowUrl };
}
