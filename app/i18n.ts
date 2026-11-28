import { messages } from "./locales/messages.ts";

export const locales = ["zh-CN", "en", "ja"] as const;
export type Locale = (typeof locales)[number];
export const localeCookie = "comic_dl_web_language";
export const languageNames: Record<Locale, string> = {
  "zh-CN": "中文",
  en: "English",
  ja: "日本語",
};

export function isLocale(value: unknown): value is Locale {
  return locales.some((locale) => locale === value);
}

export function readLocale(cookie: string | null | undefined): Locale {
  const value = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${localeCookie}=`))
    ?.slice(localeCookie.length + 1);
  return isLocale(value) ? value : "zh-CN";
}

export type MessageKey = keyof typeof messages;
export type Parameters = Record<string, string | number>;

export function translator(locale: Locale) {
  return (key: string, parameters?: Parameters): string => {
    // Only explicit project UI strings call this function. Source metadata,
    // extension-defined labels and user content must never pass through it.
    const entry = Object.hasOwn(messages, key)
      ? messages[key as MessageKey]
      : undefined;
    const text = entry
      ? locale === "en"
        ? entry[0]
        : locale === "ja"
          ? entry[1]
          : key
      : key;
    return parameters
      ? text.replace(/\{(\w+)\}/g, (match, name: string) =>
          Object.hasOwn(parameters, name) ? String(parameters[name]) : match,
        )
      : text;
  };
}

export function pageTitle(
  matches: readonly ({ id: string; data: unknown } | undefined)[],
  title: string,
) {
  const data = matches.find((match) => match?.id === "root")?.data as
    { locale?: Locale } | undefined;
  return `${translator(data?.locale ?? "zh-CN")(title)} · comic-dl-web`;
}
