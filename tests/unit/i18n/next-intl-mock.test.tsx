import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";

function ContextProbe() {
  const tAccount = useTranslations("Settings.Account");
  const tOther = useTranslations("Other");
  const locale = useLocale();
  const messages = useMessages();

  return (
    <>
      <span>{tAccount("passwordSection")}</span>
      <span>{tAccount("shared")}</span>
      <span>{tOther("shared")}</span>
      <span>{locale}</span>
      <span>{Object.keys(messages).join(",")}</span>
    </>
  );
}

describe("next-intl test mock", () => {
  it("honors provider subsets, dotted namespaces, and missing-key boundaries", () => {
    render(
      <NextIntlClientProvider
        locale="en"
        messages={{
          Settings: {
            Account: {
              passwordSection: "Password",
            },
          },
          Other: {
            shared: "Other value",
          },
        }}
      >
        <ContextProbe />
      </NextIntlClientProvider>
    );

    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Settings.Account.shared")).toBeInTheDocument();
    expect(screen.getByText("Other value")).toBeInTheDocument();
    expect(screen.getByText("en")).toBeInTheDocument();
    expect(screen.getByText("Settings,Other")).toBeInTheDocument();
  });
});
