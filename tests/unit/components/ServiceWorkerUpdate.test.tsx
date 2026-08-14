import { cleanup, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerUpdate } from "@/components/ServiceWorkerUpdate";
import { FEATURE_MESSAGES, pickMessages } from "@/i18n/client-feature-messages";
import enMessages from "messages/en.json";
import zhMessages from "messages/zh.json";

const { toastMock, toastErrorMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("next-intl", async () => {
  const React = await import("react");
  const MessagesContext = React.createContext<Record<string, unknown>>({});

  return {
    NextIntlClientProvider: ({
      children,
      messages,
    }: {
      children: ReactNode;
      messages: Record<string, unknown>;
    }) => React.createElement(MessagesContext.Provider, { value: messages }, children),
    useTranslations: (namespace: string) => {
      const messages = React.useContext(MessagesContext);
      const namespaceMessages = messages[namespace] as Record<string, string> | undefined;
      return (key: string) => namespaceMessages?.[key] ?? key;
    },
  };
});

vi.mock("sonner", () => ({
  toast: Object.assign(toastMock, { error: toastErrorMock }),
}));

interface ExpectedMessages {
  title: string;
  description: string;
  updateNow: string;
  later: string;
}

describe("ServiceWorkerUpdate", () => {
  let originalServiceWorkerDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "serviceWorker"
    );
  });

  afterEach(() => {
    cleanup();
    if (originalServiceWorkerDescriptor == null) {
      Reflect.deleteProperty(window.navigator, "serviceWorker");
    } else {
      Object.defineProperty(window.navigator, "serviceWorker", originalServiceWorkerDescriptor);
    }
  });

  it("renders localized persistent update prompts from the shell catalogs", async () => {
    const fixtures: Array<{
      locale: string;
      messages: Record<string, unknown>;
      expected: ExpectedMessages;
    }> = [
      {
        locale: "en",
        messages: pickMessages(enMessages, FEATURE_MESSAGES.shell),
        expected: {
          title: "A new version is available",
          description: "Save your work, then update when ready.",
          updateNow: "Update now",
          later: "Later",
        },
      },
      {
        locale: "zh",
        messages: pickMessages(zhMessages, FEATURE_MESSAGES.shell),
        expected: {
          title: "有新版本可用",
          description: "请先保存当前更改，再在合适时更新",
          updateNow: "立即更新",
          later: "稍后",
        },
      },
    ];

    for (const { locale, messages, expected } of fixtures) {
      const waitingWorker = { postMessage: vi.fn() } as unknown as ServiceWorker;
      const registration = {
        waiting: waitingWorker,
        installing: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as ServiceWorkerRegistration;
      const serviceWorker = {
        ready: Promise.resolve(registration),
        controller: {},
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as ServiceWorkerContainer;
      Object.defineProperty(window.navigator, "serviceWorker", {
        configurable: true,
        value: serviceWorker,
      });

      const view = render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ServiceWorkerUpdate />
        </NextIntlClientProvider>
      );

      await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
      expect(toastMock).toHaveBeenCalledWith(
        expected.title,
        expect.objectContaining({
          id: "service-worker-update",
          description: expected.description,
          duration: Infinity,
          action: expect.objectContaining({ label: expected.updateNow }),
          cancel: expect.objectContaining({ label: expected.later }),
        })
      );
      view.unmount();
      expect(registration.removeEventListener).toHaveBeenCalledWith(
        "updatefound",
        expect.any(Function)
      );
      expect(serviceWorker.removeEventListener).toHaveBeenCalledWith(
        "controllerchange",
        expect.any(Function)
      );
      vi.clearAllMocks();
    }
  });

  it("handles service worker readiness rejection without leaking an unhandled promise", async () => {
    const error = new Error("registration failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const serviceWorker = {
      ready: Promise.reject(error),
      controller: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as ServiceWorkerContainer;
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: serviceWorker,
    });

    render(
      <NextIntlClientProvider
        locale="en"
        messages={pickMessages(enMessages, FEATURE_MESSAGES.shell)}
      >
        <ServiceWorkerUpdate />
      </NextIntlClientProvider>
    );

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "[ServiceWorkerUpdate] registration readiness failed",
        error
      )
    );
    consoleError.mockRestore();
  });
});
