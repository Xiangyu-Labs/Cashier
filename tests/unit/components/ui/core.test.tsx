import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

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

describe("UI Core Components", () => {
  describe("Button", () => {
    it("renders default variant correctly", () => {
      render(<Button>Default Button</Button>);
      const button = screen.getByRole("button", { name: /default button/i });
      expect(button.className).toContain("bg-primary");
    });

    it("renders destructive variant correctly", () => {
      render(<Button variant="destructive">Destructive Button</Button>);
      const button = screen.getByRole("button", { name: /destructive button/i });
      expect(button.className).toContain("bg-danger");
    });

    it("renders outline variant correctly", () => {
      render(<Button variant="outline">Outline Button</Button>);
      const button = screen.getByRole("button", { name: /outline button/i });
      expect(button.className).toContain("border-border");
    });
  });

  describe("Badge", () => {
    it("renders default variant correctly", () => {
      render(<Badge>Default Badge</Badge>);
      const badge = screen.getByText("Default Badge");
      expect(badge.className).toContain("bg-surface2");
    });

    it("renders success variant correctly", () => {
      render(<Badge variant="success">Success Badge</Badge>);
      const badge = screen.getByText("Success Badge");
      expect(badge.className).toContain("bg-primary/20");
    });

    it("renders error variant correctly", () => {
      render(<Badge variant="error">Error Badge</Badge>);
      const badge = screen.getByText("Error Badge");
      expect(badge.className).toContain("bg-danger/20");
    });
  });

  describe("Card", () => {
    it("renders card sections with the expected title typography", () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Card Content</p>
          </CardContent>
          <CardFooter>
            <p>Card Footer</p>
          </CardFooter>
        </Card>
      );

      const title = screen.getByText("Card Title");
      expect(title.closest("div")?.className).toContain("font-semibold");
    });
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
            <DialogContent>
              <p>Dialog body</p>
            </DialogContent>
          </Dialog>
        );

        const expected = locale === "en" ? "Close" : "关闭";
        const closeButton = screen.getByRole("button", { name: expected });
        expect(closeButton).toBeDefined();
      });
    });
  });
});
