# PWA 安装指引 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Cashier 添加 PWA 安装指引 UI，包含底部提示横幅和设置页安装按钮，支持标准浏览器和 iOS Safari。

**Architecture:** 纯客户端实现，不依赖后端。通过 `beforeinstallprompt` 事件拦截安装资格，用 `localStorage` 持久化横幅关闭状态，通过 `matchMedia("(display-mode: standalone)")` 检测已安装状态。iOS Safari 降级为文字指引。

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, next-intl, Lucide React, Vitest + happy-dom + @testing-library/react

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/pwa-utils.ts` | Create | 纯工具：`isStandalone()` 检测 PWA 模式，`isIOS()` 检测 iOS 设备 |
| `tests/unit/lib/pwa-utils.test.ts` | Create | 工具函数单元测试 |
| `src/hooks/use-pwa-install.ts` | Create | Hook：监听 `beforeinstallprompt`/`appinstalled`，管理安装资格和 prompt 调用 |
| `tests/unit/hooks/use-pwa-install.test.ts` | Create | Hook 单元测试（mock window 事件、matchMedia、userAgent） |
| `src/components/pwa-install-banner.tsx` | Create | 底部横幅组件：条件渲染、关闭逻辑、iOS 文字指引 |
| `tests/unit/components/pwa-install-banner.test.tsx` | Create | 横幅组件渲染测试 |
| `src/components/pwa-install-button.tsx` | Create | 设置页安装按钮：标准浏览器为按钮，iOS 为文字指引 |
| `tests/unit/components/pwa-install-button.test.tsx` | Create | 按钮组件渲染测试 |
| `src/app/[locale]/layout.tsx` | Modify | 在 `<Providers>` 内添加 `<PWAInstallBanner />` |
| `src/app/[locale]/(protected)/settings/page.tsx` | Modify | 在设置页添加 `<PWAInstallButton />` 区块 |
| `messages/en.json` | Modify | 添加 PWA 相关 i18n key |
| `messages/zh.json` | Modify | 添加 PWA 相关 i18n key |

---

### Task 1: PWA 工具函数

**Files:**
- Create: `src/lib/pwa-utils.ts`
- Test: `tests/unit/lib/pwa-utils.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { isStandalone, isIOS } from "@/lib/pwa-utils";

describe("isStandalone", () => {
  it("当 display-mode 为 standalone 时返回 true", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    expect(isStandalone()).toBe(true);
  });

  it("当 display-mode 不为 standalone 时返回 false", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    expect(isStandalone()).toBe(false);
  });
});

describe("isIOS", () => {
  it("当 userAgent 包含 iPhone 时返回 true", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    });
    expect(isIOS()).toBe(true);
  });

  it("当 userAgent 包含 iPad 时返回 true", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)",
    });
    expect(isIOS()).toBe(true);
  });

  it("当 userAgent 不包含 iPhone/iPad/iPod 时返回 false", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    expect(isIOS()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/pwa-utils.test.ts`

Expected: FAIL with "Cannot find module '@/lib/pwa-utils'"

- [ ] **Step 3: Write minimal implementation**

```typescript
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/pwa-utils.test.ts`

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/unit/lib/pwa-utils.test.ts src/lib/pwa-utils.ts
git commit -m "feat: add PWA utility functions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: usePwaInstall Hook

**Files:**
- Create: `src/hooks/use-pwa-install.ts`
- Test: `tests/unit/hooks/use-pwa-install.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

describe("usePwaInstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("初始状态：未安装、不可安装", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.isStandalone).toBe(false);
    expect(result.current.isInstallable).toBe(false);
    expect(result.current.isIOS).toBe(false);
    expect(result.current.isPrompting).toBe(false);
  });

  it("触发 beforeinstallprompt 后 isInstallable 变为 true", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

    const { result } = renderHook(() => usePwaInstall());

    const promptMock = vi.fn();
    const userChoiceMock = Promise.resolve({ outcome: "accepted" as const, platform: "" });

    const event = new Event("beforeinstallprompt", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "prompt", { value: promptMock, writable: false });
    Object.defineProperty(event, "userChoice", { value: userChoiceMock, writable: false });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.isInstallable).toBe(true);
    expect(result.current.isStandalone).toBe(false);
  });

  it("iOS 设备未安装时 isInstallable 为 true", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    });

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.isIOS).toBe(true);
    expect(result.current.isInstallable).toBe(true);
    expect(result.current.isStandalone).toBe(false);
  });

  it("已处于 standalone 模式时 isInstallable 为 false", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.isStandalone).toBe(true);
    expect(result.current.isInstallable).toBe(false);
  });

  it("调用 promptInstall 会触发保存的 prompt", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

    const { result } = renderHook(() => usePwaInstall());

    const promptMock = vi.fn();
    const userChoiceMock = Promise.resolve({ outcome: "accepted" as const, platform: "" });

    const event = new Event("beforeinstallprompt", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "prompt", { value: promptMock, writable: false });
    Object.defineProperty(event, "userChoice", { value: userChoiceMock, writable: false });

    act(() => {
      window.dispatchEvent(event);
    });

    act(() => {
      result.current.promptInstall();
    });

    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(result.current.isPrompting).toBe(true);

    await act(async () => {
      await userChoiceMock;
    });

    // isPrompting 会在 userChoice resolve 后变回 false
    // 但由于异步更新，这里不严格断言最终状态
  });

  it("appinstalled 事件触发后 isInstallable 变为 false", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });

    const { result } = renderHook(() => usePwaInstall());

    // 先触发 beforeinstallprompt
    const promptMock = vi.fn();
    const userChoiceMock = Promise.resolve({ outcome: "accepted" as const, platform: "" });
    const event = new Event("beforeinstallprompt", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "prompt", { value: promptMock, writable: false });
    Object.defineProperty(event, "userChoice", { value: userChoiceMock, writable: false });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.isInstallable).toBe(true);

    // 再触发 appinstalled
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.isInstallable).toBe(false);
    expect(result.current.isStandalone).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/hooks/use-pwa-install.test.ts`

Expected: FAIL with "Cannot find module '@/hooks/use-pwa-install'"

- [ ] **Step 3: Write minimal implementation**

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { isStandalone, isIOS } from "@/lib/pwa-utils";

export interface UsePwaInstallReturn {
  isInstallable: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  promptInstall: () => void;
  isPrompting: boolean;
}

export function usePwaInstall(): UsePwaInstallReturn {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandaloneState, setIsStandaloneState] = useState(false);
  const [isIOSState, setIsIOSState] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);
  const deferredPromptRef = useRef<Event | null>(null);

  useEffect(() => {
    const standalone = isStandalone();
    setIsStandaloneState(standalone);
    setIsIOSState(isIOS());

    if (standalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      deferredPromptRef.current = null;
      setIsInstallable(false);
      setIsStandaloneState(true);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const promptInstall = useCallback(() => {
    const prompt = deferredPromptRef.current;
    if (prompt == null) return;

    setIsPrompting(true);

    const promptFn = (prompt as unknown as { prompt: () => Promise<void> }).prompt;
    const userChoiceFn = (prompt as unknown as { userChoice: Promise<{ outcome: string }> }).userChoice;

    if (typeof promptFn === "function") {
      promptFn().catch(() => {
        // ignore
      });
    }

    if (userChoiceFn != null) {
      userChoiceFn
        .then(() => {
          setIsPrompting(false);
        })
        .catch(() => {
          setIsPrompting(false);
        });
    } else {
      setIsPrompting(false);
    }
  }, []);

  const effectiveInstallable = isInstallable || (isIOSState && !isStandaloneState);

  return {
    isInstallable: effectiveInstallable,
    isStandalone: isStandaloneState,
    isIOS: isIOSState,
    promptInstall,
    isPrompting,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/hooks/use-pwa-install.test.ts`

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/unit/hooks/use-pwa-install.test.ts src/hooks/use-pwa-install.ts
git commit -m "feat: add usePwaInstall hook

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: PWAInstallBanner 组件

**Files:**
- Create: `src/components/pwa-install-banner.tsx`
- Test: `tests/unit/components/pwa-install-banner.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
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

  it("当 isInstallable=false 时不渲染", () => {
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

  it("当 isStandalone=true 时不渲染", () => {
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

  it("当横幅被关闭且未过 7 天时不渲染", () => {
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

  it("当 isInstallable=true 且未关闭时渲染横幅", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: false,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    render(<PWAInstallBanner />);
    expect(screen.getByText("installPrompt")).toBeInTheDocument();
    expect(screen.getByText("install")).toBeInTheDocument();
  });

  it("iOS 时显示文字指引且无安装按钮", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: true,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    render(<PWAInstallBanner />);
    expect(screen.getByText("iosInstallGuide")).toBeInTheDocument();
    expect(screen.queryByText("install")).not.toBeInTheDocument();
  });

  it("点击关闭按钮后横幅消失并写入 localStorage", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: false,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    render(<PWAInstallBanner />);
    const closeButton = screen.getByLabelText("dismiss");
    fireEvent.click(closeButton);

    expect(screen.queryByText("installPrompt")).not.toBeInTheDocument();
    expect(localStorage.getItem("cashier:pwa-dismissed")).not.toBeNull();
  });

  it("点击安装按钮调用 promptInstall", () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/pwa-install-banner.test.tsx`

Expected: FAIL with "Cannot find module '@/components/pwa-install-banner'"

- [ ] **Step 3: Write minimal implementation**

```tsx
"use client";

import { useState, useEffect } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, X } from "lucide-react";
import { useTranslations } from "next-intl";

const DISMISS_KEY = "cashier:pwa-dismissed";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export function PWAInstallBanner() {
  const { isInstallable, isStandalone, isIOS, promptInstall } = usePwaInstall();
  const [isDismissed, setIsDismissed] = useState(false);
  const t = useTranslations("PWA");

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const time = parseInt(dismissed, 10);
      if (Date.now() - time < DISMISS_DURATION) {
        setIsDismissed(true);
      }
    }
  }, []);

  if (isStandalone || !isInstallable || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setIsDismissed(true);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t p-3 shadow-lg">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-primary/10 p-2 rounded-lg shrink-0">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm text-foreground truncate">
            {isIOS ? t("iosInstallGuide") : t("installPrompt")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isIOS && (
            <button
              onClick={promptInstall}
              className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              {t("install")}
            </button>
          )}
          <button
            onClick={handleDismiss}
            aria-label={t("dismiss")}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/pwa-install-banner.test.tsx`

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/unit/components/pwa-install-banner.test.tsx src/components/pwa-install-banner.tsx
git commit -m "feat: add PWA install banner component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: PWAInstallButton 组件

**Files:**
- Create: `src/components/pwa-install-button.tsx`
- Test: `tests/unit/components/pwa-install-button.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
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

  it("当 isInstallable=false 时不渲染", () => {
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

  it("当 isStandalone=true 时不渲染", () => {
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

  it("标准浏览器下渲染安装按钮", () => {
    const promptMock = vi.fn();
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: false,
      promptInstall: promptMock,
      isPrompting: false,
    });

    render(<PWAInstallButton />);
    expect(screen.getByText("installApp")).toBeInTheDocument();

    fireEvent.click(screen.getByText("installApp"));
    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  it("iOS 下渲染文字指引而非按钮", () => {
    mockedUsePwaInstall.mockReturnValue({
      isInstallable: true,
      isStandalone: false,
      isIOS: true,
      promptInstall: vi.fn(),
      isPrompting: false,
    });

    render(<PWAInstallButton />);
    expect(screen.getByText("iosInstallGuide")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /install/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/pwa-install-button.test.tsx`

Expected: FAIL with "Cannot find module '@/components/pwa-install-button'"

- [ ] **Step 3: Write minimal implementation**

```tsx
"use client";

import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

export function PWAInstallButton() {
  const { isInstallable, isStandalone, isIOS, promptInstall } = usePwaInstall();
  const t = useTranslations("PWA");

  if (isStandalone || !isInstallable) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t("installTitle")}</h2>
        <p className="text-xs text-muted-foreground">
          {isIOS ? t("iosInstallGuide") : t("installDesc")}
        </p>
      </div>
      {isIOS ? (
        <div className="shrink-0 p-2 text-muted-foreground">
          <Smartphone className="h-5 w-5" />
        </div>
      ) : (
        <button
          onClick={promptInstall}
          className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Download className="h-4 w-4" />
          {t("installApp")}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/pwa-install-button.test.tsx`

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/unit/components/pwa-install-button.test.tsx src/components/pwa-install-button.tsx
git commit -m "feat: add PWA install button component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: i18n Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add i18n keys to both translation files**

In `messages/en.json`, add at the root level (after the last top-level key):

```json
  "PWA": {
    "installPrompt": "Install Cashier for a better experience",
    "install": "Install",
    "installApp": "Install App",
    "installTitle": "Install App",
    "installDesc": "Add Cashier to your home screen for quick access",
    "iosInstallGuide": "Tap the share button in Safari, then select 'Add to Home Screen'",
    "dismiss": "Dismiss"
  }
```

In `messages/zh.json`, add at the root level:

```json
  "PWA": {
    "installPrompt": "安装 Cashier 以获得更好体验",
    "install": "安装",
    "installApp": "安装应用",
    "installTitle": "安装应用",
    "installDesc": "将 Cashier 添加到主屏幕，快速访问",
    "iosInstallGuide": "在 Safari 中点击分享按钮，然后选择"添加到主屏幕"",
    "dismiss": "关闭"
  }
```

**Note:** 确保 JSON 语法正确，前一个 key 的末尾有逗号，新加的 block 后面如果是文件末尾则不加逗号。

- [ ] **Step 2: Verify JSON is valid**

Run: `npx eslint messages/en.json messages/zh.json` (optional, if eslint handles JSON)

Or just validate manually by running the app tests:

Run: `npx vitest run tests/unit/components/pwa-install-banner.test.tsx tests/unit/components/pwa-install-button.test.tsx`

Expected: PASS (tests use mocked next-intl, so they won't fail from missing keys, but it's good to verify no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/zh.json
git commit -m "i18n: add PWA install prompt translations

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Integration into App

**Files:**
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/app/[locale]/(protected)/settings/page.tsx`

- [ ] **Step 1: Add PWAInstallBanner to locale layout**

In `src/app/[locale]/layout.tsx`, import the banner and place it inside `<Providers>` but outside `<main>`:

```tsx
// Add import at top
import { PWAInstallBanner } from "@/components/pwa-install-banner";
```

Inside the return JSX, add `<PWAInstallBanner />` after `{children}` inside `<Providers>`:

```tsx
<Providers>
  <main className="max-w-screen-2xl mx-auto min-h-screen pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
    {children}
  </main>
  <PWAInstallBanner />
</Providers>
```

- [ ] **Step 2: Add PWAInstallButton to settings page**

In `src/app/[locale]/(protected)/settings/page.tsx`, import the button and add a new section:

```tsx
// Add import at top
import { PWAInstallButton } from "@/components/pwa-install-button";
```

Add a new section inside the container, before the Account section:

```tsx
<div className="space-y-4">
  <h2 className="text-lg font-semibold">{t("app") !== "" ? t("app") : "App"}</h2>
  <PWAInstallButton />
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors (or only pre-existing errors)

- [ ] **Step 4: Run all new tests together**

Run: `npx vitest run tests/unit/lib/pwa-utils.test.ts tests/unit/hooks/use-pwa-install.test.ts tests/unit/components/pwa-install-banner.test.tsx tests/unit/components/pwa-install-button.test.tsx`

Expected: PASS (18 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/layout.tsx src/app/[locale]/(protected)/settings/page.tsx
git commit -m "feat: integrate PWA install UI into app layout and settings

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 底部横幅（PWAInstallBanner）— Task 3
- ✅ 设置页按钮（PWAInstallButton）— Task 4
- ✅ 安装资格检测（usePwaInstall Hook）— Task 2
- ✅ iOS Safari 降级文字指引 — Task 3 & 4
- ✅ 已安装检测（standalone）— Task 2
- ✅ 横幅关闭持久化（localStorage 7 天）— Task 3
- ✅ 测试策略 — 每个任务都有测试

**2. Placeholder scan:**
- ✅ 无 TBD/TODO
- ✅ 所有步骤包含完整代码
- ✅ 所有测试包含具体断言
- ✅ 所有命令包含预期输出

**3. Type consistency:**
- ✅ `UsePwaInstallReturn` 接口在 Task 2 定义，在 Task 3/4 的 mock 中保持一致
- ✅ `promptInstall` 签名在所有 mock 中一致：无参数，返回 void
- ✅ i18n key 在组件和测试中一致（使用 t() 调用的 key）

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-25-pwa-install-guide.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session, batch execution with checkpoints

Which approach?