import { createContext, useContext } from "react";
import { localeCookie, readLocale, translator, type Locale } from "./i18n";

export const LocaleContext = createContext<Locale>("zh-CN");

export function useI18n() {
  const locale = useContext(LocaleContext);
  return { locale, t: translator(locale) };
}

export function changeLanguage(locale: Locale) {
  document.cookie = `${localeCookie}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  if (readLocale(document.cookie) === locale) window.location.reload();
}
