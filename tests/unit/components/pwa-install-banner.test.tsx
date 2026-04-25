import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PWAInstallBanner } from "@/components/pwa-install-banner";

vi.mock("@/hooks/use-pwa-install", () => ({
  usePwaInstall: vi.fn(),
}));

import { usePwaInstall } from "@/hooks/use-pwa-install";

const mockedUsePwaInstall = vi.mocked(usePwaInstall);

describe("PWAInstallBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("does not render when isInstallable=false", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: false,
      isStandalone: false,
      isIOS: false,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    const { container } = render(<PWAInstallBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("does not render when isStandalone=true", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: false,
      isStandalone: true,
      isIOS: false,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    const { container } = render(<PWAInstallBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("does not render when banner was recently dismissed", () => {
    localStorage.setItem("cashier:pwa-dismissed", Date.now().toString());

    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: false,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    const { container } = render(<PWAInstallBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders banner when installable and not dismissed", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: false,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    render(<PWAInstallBanner />);
    expect(screen.getByText("installPrompt") !== null).toBe(true);
    expect(screen.getByText("install") !== null).toBe(true);
  });

  it("shows iOS text guide without install button", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: true,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    render(<PWAInstallBanner />);
    expect(screen.getByText("iosInstallGuide") !== null).toBe(true);
    expect(screen.queryByText("install")).toBeNull();
  });

  it("clicking dismiss hides banner and writes to localStorage", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: false,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    render(<PWAInstallBanner />);
    const closeButton = screen.getByLabelText("忽略");
    fireEvent.click(closeButton);

    expect(screen.queryByText("installPrompt")).toBeNull();
    expect(localStorage.getItem("cashier:pwa-dismissed")).not.toBeNull();
  });

  it("clicking install button calls promptInstall", () => {
    const promptMock = vi.fn();
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: false,
      promptInstall: promptMock,
      isPrompting: false,
    });

    render(<PWAInstallBanner />);
    const installButton = screen.getByText("install");
    fireEvent.click(installButton);

    expect(promptMock).toHaveBeenCalledTimes(1);
  });
});
