import { SUPPORTED_LOCALES, DEFAULT_LOCALE, SupportedLocale } from "./locales";

interface ResolveLocaleOptions {
  explicitLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}

function matchSupportedLocale(value: string): SupportedLocale | null {
  const normalized = value.trim().toLowerCase();
  for (const locale of SUPPORTED_LOCALES) {
    if (normalized === locale || normalized.startsWith(`${locale}-`)) {
      return locale;
    }
  }
  return null;
}

function resolveFromAcceptLanguage(header: string): SupportedLocale | null {
  const tags = header
    .split(",")
    .map((part) => {
      const [tag] = part.trim().split(";");
      return tag?.trim() ?? "";
    })
    .filter(Boolean);

  for (const tag of tags) {
    const match = matchSupportedLocale(tag);
    if (match !== null) return match;
  }
  return null;
}

export function resolveSupportedLocale(options: ResolveLocaleOptions): SupportedLocale {
  const { explicitLocale, cookieLocale, acceptLanguage } = options;

  if (explicitLocale) {
    const match = matchSupportedLocale(explicitLocale);
    if (match !== null) return match;
  }

  if (cookieLocale) {
    const match = matchSupportedLocale(cookieLocale);
    if (match !== null) return match;
  }

  if (acceptLanguage) {
    const match = resolveFromAcceptLanguage(acceptLanguage);
    if (match !== null) return match;
  }

  return DEFAULT_LOCALE;
}
