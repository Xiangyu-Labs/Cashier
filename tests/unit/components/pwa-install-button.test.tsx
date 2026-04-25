import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PWAInstallButton } from "@/components/pwa-install-button";

vi.mock("@/hooks/use-pwa-install", () => ({
  usePwaInstall: vi.fn(),
}));

import { usePwaInstall } from "@/hooks/use-pwa-install";

const mockedUsePwaInstall = vi.mocked(usePwaInstall);

describe("PWAInstallButton", () => {
  beforeEach(() => {
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

    const { container } = render(<PWAInstallButton />);
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

    const { container } = render(<PWAInstallButton />);
    expect(container.firstChild).toBeNull();
  });

  it("renders install button on standard browsers", () => {
    const promptMock = vi.fn();
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: false,
      promptInstall: promptMock,
      isPrompting: false,
    });

    render(<PWAInstallButton />);
    expect(screen.getByRole("heading", { name: "安装应用" }) !== null).toBe(true);
    expect(screen.getByRole("button", { name: "安装应用" }) !== null).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "安装应用" }));
    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  it("renders text guide on iOS without a button", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: true,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    render(<PWAInstallButton />);
    expect(screen.getByText('在 Safari 中点击分享按钮，然后选择"添加到主屏幕"') !== null).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("disables install button when isPrompting=true", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: false,
      promptInstall: vi.fn(),
      isPrompting: true,
    });

    render(<PWAInstallButton />);
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
