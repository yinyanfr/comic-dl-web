import { once } from "node:events";
import express from "express";
import { expect, test, vi } from "vitest";
import { createAuthMiddleware } from "../../app/auth.server";

test("认证校验来源、防止开放重定向、设置安全 Cookie 并限制失败次数", async () => {
  const app = express();
  app.use(
    createAuthMiddleware({
      password: "secret",
      adminOrigin: "https://comics.example.com",
    }),
  );
  app.get("/", (_request, response) => response.send("private"));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const url = `http://127.0.0.1:${address.port}`;
  async function login(
    password: string,
    origin = "https://comics.example.com",
  ) {
    return fetch(`${url}/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        password,
        next: "//evil.example",
        remember: "1",
      }),
    });
  }
  try {
    expect((await fetch(url)).status).toBe(401);
    const page = await fetch(`${url}/settings`, {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    expect(page.headers.get("location")).toBe("/login?next=%2Fsettings");
    expect((await login("secret", "https://evil.example")).status).toBe(403);
    const success = await login("secret");
    expect(success.status).toBe(303);
    expect(success.headers.get("location")).toBe("/");
    expect(success.headers.get("set-cookie")).toContain("Secure");
    expect(success.headers.get("set-cookie")).toContain("HttpOnly");
    expect(success.headers.get("set-cookie")).toContain("Max-Age=2592000");
    const cookie = success.headers.get("set-cookie")!.split(";")[0];
    expect((await fetch(url, { headers: { Cookie: cookie } })).status).toBe(
      200,
    );
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.now() + 31 * 86400000);
    try {
      expect((await fetch(url, { headers: { Cookie: cookie } })).status).toBe(
        401,
      );
    } finally {
      clock.mockRestore();
    }
    for (let index = 0; index < 10; index++)
      expect((await login("wrong")).status).toBe(401);
    expect((await login("secret")).status).toBe(429);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

for (const reason of ["logout", "expiry"] as const) {
  test(`SSE 路径变体在 ${reason} 后全部断开`, async () => {
    const app = express();
    app.use(createAuthMiddleware({ password: "secret" }));
    app.get("/tasks/events", (_request, response) => {
      response.type("text/event-stream").write("data: connected\n\n");
    });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const url = `http://127.0.0.1:${address.port}`;
    const controllers: AbortController[] = [];
    try {
      const login = await fetch(`${url}/auth/login`, {
        method: "POST",
        headers: {
          Origin: url,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "password=secret",
        redirect: "manual",
      });
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      const readers = await Promise.all(
        ["/tasks/events", "/tasks/events/", "/TASKS/EVENTS"].map(
          async (path) => {
            const controller = new AbortController();
            controllers.push(controller);
            const response = await fetch(url + path, {
              headers: { Cookie: cookie },
              signal: controller.signal,
            });
            expect(response.status).toBe(200);
            const reader = response.body!.getReader();
            expect((await reader.read()).done).toBe(false);
            return reader;
          },
        ),
      );
      if (reason === "logout") {
        await fetch(`${url}/auth/logout`, {
          method: "POST",
          headers: { Origin: url, Cookie: cookie },
          redirect: "manual",
        });
      } else {
        const clock = vi
          .spyOn(Date, "now")
          .mockReturnValue(Date.now() + 31 * 86400000);
        try {
          expect(
            (await fetch(url, { headers: { Cookie: cookie } })).status,
          ).toBe(401);
        } finally {
          clock.mockRestore();
        }
      }
      await Promise.all(
        readers.map(async (reader) => {
          expect((await reader.read()).done).toBe(true);
        }),
      );
    } finally {
      for (const controller of controllers) controller.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
