import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const { currentLocale } = vi.hoisted(() => {
  const ref: { value: string } = { value: "zh" };
  return { currentLocale: ref };
});

vi.mock("next-intl", async () => {
  const en = (await import("messages/en.json")).default as Record<string, Record<string, string>>;
  const zh = (await import("messages/zh.json")).default as Record<string, Record<string, string>>;

  return {
    useTranslations: (namespace?: string) => {
      const msgs = currentLocale.value === "en" ? en : zh;
      return (key: string, values?: Record<string, string | number>) => {
        const nsMessages = namespace ? msgs[namespace] : undefined;
        let msg = nsMessages?.[key];
        if (msg == null) {
          for (const ns in msgs) {
            if (msgs[ns]?.[key] != null) {
              msg = msgs[ns][key];
              break;
            }
          }
        }
        if (msg == null) return key;
        if (values != null) {
          Object.entries(values).forEach(([k, v]) => {
            msg = (msg as string).replace(`{${k}}`, String(v));
          });
        }
        return msg;
      };
    },
    useLocale: () => currentLocale.value,
    useMessages: () => (currentLocale.value === "en" ? en : zh),
    useTimeZone: () => "UTC",
    useNow: () => new Date(),
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

describe("Dialog", () => {
  describe.each(["en", "zh"] as const)("localization (%s)", (locale) => {
    beforeEach(() => {
      currentLocale.value = locale;
    });

    it("renders localized close screen-reader text via Common namespace", () => {
      render(
        <Dialog open>
          <DialogTrigger />
          <DialogContent variant="modal">
            <p>Dialog body</p>
          </DialogContent>
        </Dialog>
      );

      const expected = locale === "en" ? "Close" : "关闭";
      const closeButton = screen.getByRole("button", { name: expected });
      expect(closeButton).toBeDefined();
    });

    it("focuses the dialog title before its close control", async () => {
      render(
        <Dialog open>
          <DialogContent variant="modal">
            <DialogTitle>Dialog title</DialogTitle>
            <p>Dialog body</p>
          </DialogContent>
        </Dialog>
      );

      await waitFor(() =>
        expect(screen.getByRole("heading", { name: "Dialog title" })).toHaveFocus()
      );
      expect(
        screen.getByRole("button", { name: locale === "en" ? "Close" : "关闭" })
      ).not.toHaveFocus();
    });

    it("increments the layer for a nested task dialog", () => {
      render(
        <Dialog open>
          <DialogContent variant="detail">
            <p>Detail body</p>
            <Dialog open>
              <DialogContent variant="modal">
                <p>Task body</p>
              </DialogContent>
            </Dialog>
          </DialogContent>
        </Dialog>
      );

      const detail = screen.getByText("Detail body").parentElement;
      const task = screen.getByText("Task body").parentElement;
      expect(Number(task?.style.zIndex)).toBeGreaterThan(Number(detail?.style.zIndex));
    });
  });
});
