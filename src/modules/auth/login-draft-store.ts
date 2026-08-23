import { create } from "zustand";

interface LoginDraftState {
  email: string;
  otp: string;
  resendPending: boolean;
  otpExpired: boolean;
  expiresAt: number | null;
  canResendAt: number | null;
  setEmail: (email: string) => void;
  setOtp: (otp: string) => void;
  setResendPending: (pending: boolean) => void;
  setOtpExpiry: (expiresAt: number | null, canResendAt: number | null) => void;
  setOtpExpired: (expired: boolean) => void;
  reset: () => void;
}

const INITIAL_DRAFT = {
  email: "",
  otp: "",
  resendPending: false,
  otpExpired: false,
  expiresAt: null,
  canResendAt: null,
};

export const useLoginDraftStore = create<LoginDraftState>((set) => ({
  ...INITIAL_DRAFT,
  setEmail: (email) => set({ email }),
  setOtp: (otp) => set({ otp }),
  setResendPending: (resendPending) => set({ resendPending }),
  setOtpExpiry: (expiresAt, canResendAt) => set({ expiresAt, canResendAt, otpExpired: false }),
  setOtpExpired: (otpExpired) => set({ otpExpired }),
  reset: () => set(INITIAL_DRAFT),
}));
