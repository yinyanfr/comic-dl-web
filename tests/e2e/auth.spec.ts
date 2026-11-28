import { expect, test } from "@playwright/test";
import { testServices } from "./service";

test("管理员登录保护页面与接口，会话、记住我及退出", async ({ page }, info) => {
  const services = testServices(info.outputPath("service"));
  try {
    const service = await services.start({
      COMIC_DL_WEB_ADMIN_PASSWORD: "test-admin-password",
    });
    await page.goto(`${service.url}/settings`);
    await expect(
      page.getByRole("heading", { name: "管理员登录" }),
    ).toBeVisible();
    for (const path of [
      "/covers?entry=unknown",
      "/tasks/status",
      "/tasks/events",
      "/tasks/a/results",
      "/settings.data",
      "/comic-icon.png",
      "/assets/private.js",
    ]) {
      expect((await page.request.get(`${service.url}${path}`)).status()).toBe(
        401,
      );
    }
    await page.getByLabel("管理员密码", { exact: true }).fill("wrong");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("密码错误。");
    await page
      .getByLabel("管理员密码", { exact: true })
      .fill("test-admin-password");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(`${service.url}/settings`);
    const cookie = (await page.context().cookies()).find(
      ({ name }) => name === "comic_dl_web_session",
    )!;
    expect(cookie.expires).toBe(-1);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Strict");
    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page).toHaveURL(`${service.url}/login`);
    expect(
      (
        await page.request.get(`${service.url}/tasks/status`, {
          headers: { Cookie: `comic_dl_web_session=${cookie.value}` },
        })
      ).status(),
    ).toBe(401);
    await page
      .getByLabel("管理员密码", { exact: true })
      .fill("test-admin-password");
    await page.getByLabel("记住我（30 天）").check();
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(`${service.url}/`);
    const remembered = (await page.context().cookies()).find(
      ({ name }) => name === cookie.name,
    )!;
    expect(remembered.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 86400);
    await service.stop();
    const restarted = await services.start({
      COMIC_DL_WEB_ADMIN_PASSWORD: "test-admin-password",
    });
    expect(
      (
        await page.request.get(`${restarted.url}/tasks/status`, {
          headers: { Cookie: `${remembered.name}=${remembered.value}` },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await services.stopServers();
  }
});

for (const trigger of ["navigation", "fetcher", "SSE"] as const) {
  test(`会话失效后 ${trigger} 返回登录页并可重新进入业务页面`, async ({
    page,
  }, info) => {
    const services = testServices(info.outputPath("service"));
    try {
      const service = await services.start({
        COMIC_DL_WEB_ADMIN_PASSWORD: "test-admin-password",
        COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT: "1",
      });
      await page.goto(`${service.url}/settings`);
      await page
        .getByLabel("管理员密码", { exact: true })
        .fill("test-admin-password");
      const connected = page.waitForResponse(
        (response) =>
          response.url().includes("/tasks/events?") &&
          response.status() === 200,
      );
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await expect(page).toHaveURL(`${service.url}/settings`);
      await expect(
        page.getByRole("button", { name: "保存设置" }),
      ).toBeEnabled();
      // Ensure SSE is established before invalidating its session.
      await connected;
      if (trigger === "SSE") {
        await page.request.post(`${service.url}/auth/logout`, {
          headers: { Origin: service.url },
        });
      } else {
        await page.context().clearCookies();
        if (trigger === "navigation") {
          await page
            .getByRole("link", { name: "浏览来源", exact: true })
            .click();
        } else {
          await page.getByRole("button", { name: "保存设置" }).click();
        }
      }
      await expect(page).toHaveURL(/\/login\?next=/);
      await expect(
        page.getByRole("heading", { name: "管理员登录" }),
      ).toBeVisible();
      const next = new URL(page.url()).searchParams.get("next")!;
      expect(next).toMatch(/^\/(?:settings|catalog)/);
      await expect(page.locator("body")).not.toContainText("Application Error");
      await page
        .getByLabel("管理员密码", { exact: true })
        .fill("test-admin-password");
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await expect(page).toHaveURL(new URL(next, service.url).href);
    } finally {
      await services.stopServers();
    }
  });
}
