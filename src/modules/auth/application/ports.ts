export interface AccountSecurityPort {
  getPasswordHash(userId: string): Promise<string | null | undefined>;
  setInitialPassword(input: {
    userId: string;
    passwordHash: string;
    passwordUpdatedAt: Date;
  }): Promise<boolean>;
  changePassword(input: {
    userId: string;
    expectedPasswordHash: string;
    passwordHash: string;
    passwordUpdatedAt: Date;
  }): Promise<boolean>;
  createEmailChangeChallenge(input: {
    userId: string;
    newEmail: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    minimumIntervalMs: number;
  }): Promise<"created" | "unauthorized" | "same_email" | "duplicate" | "rate_limited" | "locked">;
  discardEmailChangeChallenge(input: {
    userId: string;
    newEmail: string;
    tokenHash: string;
  }): Promise<void>;
  verifyEmailChangeChallenge(input: {
    userId: string;
    newEmail: string;
    otp: string;
    now: Date;
  }): Promise<
    | { status: "verified"; email: string }
    | { status: "not_found" | "locked" | "expired" | "duplicate" }
    | { status: "incorrect"; attemptsRemaining: number; locked: boolean }
  >;
}

export interface RateLimitPort {
  increment(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ success: boolean; remaining: number; resetTime: number }>;
  current(key: string, windowSeconds: number): Promise<number>;
  acquireCooldown(
    key: string,
    seconds: number
  ): Promise<{ acquired: boolean; acquiredAt: Date; retryAfter: number }>;
  releaseCooldown(key: string, acquiredAt: Date): Promise<boolean>;
  setCooldown(key: string, cooldownSeconds: number): Promise<void>;
  getCooldownRemaining(key: string, cooldownSeconds: number): Promise<number>;
}
