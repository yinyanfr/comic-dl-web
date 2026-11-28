import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import {
  isLocale,
  languageNames,
  localeCookie,
  locales,
  readLocale,
  translator,
} from "./i18n.ts";

const cookieName = "comic_dl_web_session";
const rememberedAge = 30 * 24 * 60 * 60 * 1000;

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function returnPath(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\p{Cc}]/u.test(value) &&
    !value.startsWith("/auth/") &&
    !value.startsWith("/login")
    ? value
    : "/";
}

function escape(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]!;
  });
}

// Mounted before Vite, static files and React Router: no business endpoint can
// bypass authentication. The login document is standalone and loads no assets.
export function createAuthMiddleware({
  password = process.env.COMIC_DL_WEB_ADMIN_PASSWORD,
  adminOrigin = process.env.COMIC_DL_WEB_ADMIN_ORIGIN,
} = {}) {
  const router = express.Router();
  if (!password) return router;
  const passwordHash = digest(password);
  const sessions = new Map<string, number>();
  const streams = new Map<string, Set<Response>>();
  const failures = new Map<string, { count: number; until: number }>();
  const windowMs = 15 * 60 * 1000;

  function invalidate(value: string) {
    sessions.delete(value);
    for (const stream of streams.get(value) ?? []) stream.end();
    streams.delete(value);
  }

  function origin(request: Request) {
    return adminOrigin
      ? new URL(adminOrigin).origin
      : `${request.protocol}://${request.get("host")}`;
  }
  function token(request: Request) {
    return (request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
  }
  function cookieOptions(request: Request) {
    return {
      httpOnly: true,
      sameSite: "strict" as const,
      secure: origin(request).startsWith("https:"),
      path: "/",
    };
  }
  function loginPage(
    request: Request,
    response: Response,
    error = "",
    status = 200,
  ) {
    const next = returnPath(request.body?.next ?? request.query.next);
    const locale = readLocale(request.headers.cookie);
    const t = translator(locale);
    const languages = locales
      .map(
        (value) =>
          `<a lang="${value}" ${locale === value ? 'aria-current="true"' : ""} href="/login?${escape(new URLSearchParams({ next, lang: value }).toString())}">${languageNames[value]}</a>`,
      )
      .join(" · ");
    response
      .status(status)
      .set({
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      })
      .type("html")
      .send(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#228be6">
<meta name="apple-mobile-web-app-title" content="comic-dl-web">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" type="image/png" href="/pwa-icon-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<title>${t("管理员登录")} · comic-dl-web</title><style>
:root{color-scheme:light dark;--mantine-primary-color-filled:#228be6;--mantine-radius-md:8px}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,sans-serif;background:light-dark(#f8f9fa,#141517);color:light-dark(#212529,#c1c2c5)}
main{max-width:400px;margin:12vh auto;padding:24px;border:1px solid light-dark(#dee2e6,#373a40);border-radius:var(--mantine-radius-md);background:light-dark(white,#1a1b1e)}
h1{font-size:24px;margin:0 0 8px}p{color:light-dark(#495057,#a6a7ab)}label{display:block;margin:16px 0 6px}
input[type=password]{width:100%;font:inherit;padding:10px;border:1px solid light-dark(#ced4da,#5c5f66);border-radius:4px;background:transparent;color:inherit}
button{width:100%;margin-top:20px;padding:10px;font:inherit;font-weight:600;background:var(--mantine-primary-color-filled);color:white;border:0;border-radius:4px;cursor:pointer}
[role=alert]{color:light-dark(#c92a2a,#ff8787)}@media(max-width:440px){main{margin:8vh 16px}}
</style></head><body><main><nav aria-label="${t("语言")}">${languages}</nav><h1>${t("管理员登录")}</h1><p>${t("输入管理员密码以访问 comic-dl-web。")}</p>
${error ? `<p role="alert">${escape(t(error))}</p>` : ""}
<form method="post" action="/auth/login"><input type="hidden" name="next" value="${escape(next)}">
<label for="password">${t("管理员密码")}</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
<label><input type="checkbox" name="remember" value="1"> ${t("记住我（30 天）")}</label>
<button type="submit">${t("登录")}</button></form><p>${t("建议仅在本机、局域网或 VPN 内使用。")}</p></main></body></html>`);
  }

  router.use((request, response, next) => {
    response.set({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    });
    const now = Date.now();
    for (const [key, expires] of sessions) if (expires <= now) invalidate(key);
    for (const [key, failure] of failures)
      if (failure.until <= now) failures.delete(key);
    next();
  });
  router.get("/login", (request, response) => {
    const locale = request.query.lang;
    if (isLocale(locale)) {
      response.cookie(localeCookie, locale, {
        ...cookieOptions(request),
        httpOnly: false,
        sameSite: "lax",
        maxAge: 365 * 86400000,
      });
      response.redirect(
        303,
        `/login?${new URLSearchParams({ next: returnPath(request.query.next) })}`,
      );
      return;
    }
    loginPage(request, response);
  });
  router.post(
    ["/auth/login", "/auth/logout"],
    (request, response, next) => {
      if (request.get("origin") !== origin(request)) {
        response
          .status(403)
          .send(
            translator(readLocale(request.headers.cookie))("请求来源无效。"),
          );
        return;
      }
      next();
    },
    express.urlencoded({ extended: false, limit: "8kb" }),
    (request, response) => {
      const oldToken = token(request);
      if (request.path === "/auth/logout") {
        if (oldToken) invalidate(oldToken);
        response.clearCookie(cookieName, cookieOptions(request));
        response.redirect(303, "/login");
        return;
      }
      // Never trust forwarded IP headers. Also cap global failures so a rotating
      // address cannot bypass the limit. This single-admin service is LAN-first.
      const keys = ["global", request.socket.remoteAddress ?? "unknown"];
      if (keys.some((key) => (failures.get(key)?.count ?? 0) >= 10)) {
        response.set("Retry-After", String(windowMs / 1000));
        loginPage(request, response, "尝试次数过多，请 15 分钟后重试。", 429);
        return;
      }
      const supplied = request.body?.password;
      if (
        typeof supplied !== "string" ||
        !timingSafeEqual(digest(supplied), passwordHash)
      ) {
        for (const key of keys) {
          const previous = failures.get(key);
          failures.set(key, {
            count: (previous?.count ?? 0) + 1,
            until: previous?.until ?? Date.now() + windowMs,
          });
        }
        request.query.next = returnPath(request.body?.next);
        loginPage(request, response, "密码错误。", 401);
        return;
      }
      if (oldToken) invalidate(oldToken);
      // Bound process-local state even if valid credentials are used repeatedly.
      if (sessions.size >= 1000) invalidate(sessions.keys().next().value!);
      const value = randomBytes(32).toString("hex");
      const remember = request.body?.remember === "1";
      sessions.set(value, Date.now() + rememberedAge);
      response.cookie(cookieName, value, {
        ...cookieOptions(request),
        ...(remember ? { maxAge: rememberedAge } : {}),
      });
      response.redirect(303, returnPath(request.body?.next));
    },
  );
  router.use((request, response, next) => {
    const value = token(request);
    if (value && sessions.has(value)) {
      // Track responses rather than URL spellings: route aliases, case and
      // trailing slashes must not bypass revocation of long-lived streams.
      const active = streams.get(value) ?? new Set<Response>();
      streams.set(value, active);
      active.add(response);
      // Reconnect at least daily so even an uninterrupted SSE connection
      // cannot outlive the server-side session.
      const timer = setTimeout(
        () => response.end(),
        Math.min(sessions.get(value)! - Date.now(), 86400000),
      );
      timer.unref();
      response.on("close", () => {
        clearTimeout(timer);
        active.delete(response);
        if (!active.size) streams.delete(value);
      });
      next();
      return;
    }
    if (
      request.method === "GET" &&
      request.get("accept")?.includes("text/html")
    ) {
      response.redirect(
        302,
        `/login?next=${encodeURIComponent(returnPath(request.originalUrl))}`,
      );
      return;
    }
    response
      .set("X-Comic-Dl-Auth", "required")
      .status(401)
      .json({
        error: translator(readLocale(request.headers.cookie))("请先登录。"),
      });
  });
  return router;
}
