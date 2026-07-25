import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

// zh.json messages are used by the useTranslations mock (see setup.common.ts)
import zhMessages from "messages/zh.json";

const messages = zhMessages as Record<string, unknown>;

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
    it("renders localized close screen-reader text via Common namespace", () => {
      render(
        <NextIntlClientProvider messages={messages} locale="zh">
          <Dialog open>
            <DialogTrigger />
            <DialogContent>
              <p>Dialog body</p>
            </DialogContent>
          </Dialog>
        </NextIntlClientProvider>
      );

      const closeButton = screen.getByRole("button", { name: "关闭" });
      expect(closeButton).toBeDefined();
    });
  });
});
