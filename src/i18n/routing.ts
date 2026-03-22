import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./locales";

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: SUPPORTED_LOCALES,

  // Used when no locale matches
  defaultLocale: DEFAULT_LOCALE,

  // Use a cookie to remember the locale and don't
  // show the locale prefix in the URL
  localePrefix: "always",
});

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
