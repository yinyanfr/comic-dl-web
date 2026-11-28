import { expect, test } from "@playwright/test";
import { testServices } from "./service";

for (const authenticated of [false, true]) {
  test(`PWA 清单、图标和安装检查（管理员登录${authenticated ? "开启" : "关闭"}）`, async ({
    page,
  }, info) => {
    const services = testServices(info.outputPath("service"));
    try {
      const service = await services.start(
        authenticated ? { COMIC_DL_WEB_ADMIN_PASSWORD: "test-password" } : {},
      );
      const cspErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") cspErrors.push(message.text());
      });
      await page.goto(service.url);
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
        "href",
        "/manifest.webmanifest",
      );
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
        "content",
        "#228be6",
      );
      const response = await page.request.get(
        `${service.url}/manifest.webmanifest`,
      );
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain(
        "application/manifest+json",
      );
      const manifest = await response.json();
      expect(manifest).toMatchObject({
        id: "/",
        name: "comic-dl-web",
        start_url: "/",
        scope: "/",
        display: "standalone",
      });
      for (const [path, size] of [
        ["/pwa-icon-192.png", 192],
        ["/pwa-icon-512.png", 512],
        ["/apple-touch-icon.png", 180],
      ] as const) {
        const icon = await page.request.get(`${service.url}${path}`);
        expect(icon.status()).toBe(200);
        expect(icon.headers()["content-type"]).toContain("image/png");
        const bytes = await icon.body();
        expect(bytes.subarray(1, 4).toString()).toBe("PNG");
        expect(bytes.readUInt32BE(16)).toBe(size);
        expect(bytes.readUInt32BE(20)).toBe(size);
      }
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Page.enable");
      const parsed = await cdp.send("Page.getAppManifest");
      expect(parsed.errors).toEqual([]);
      expect(parsed.url).toBe(`${service.url}/manifest.webmanifest`);
      expect(
        (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors,
      ).toEqual([]);
      expect(
        await page.evaluate(async () => ({
          workers: (await navigator.serviceWorker.getRegistrations()).length,
          caches: await caches.keys(),
        })),
      ).toEqual({ workers: 0, caches: [] });
      if (authenticated) {
        await expect(
          page.getByRole("heading", { name: "管理员登录" }),
        ).toBeVisible();
        for (const path of [
          "/tasks/status",
          "/covers?entry=unknown",
          "/settings.data",
          "/assets/private.js",
        ]) {
          expect(
            (await page.request.get(`${service.url}${path}`)).status(),
          ).toBe(401);
        }
        await page
          .getByLabel("管理员密码", { exact: true })
          .fill("test-password");
        await page.getByRole("button", { name: "登录", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "书架", exact: true }),
        ).toBeVisible();
        await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
          "href",
          "/manifest.webmanifest",
        );
      }
      expect(cspErrors).toEqual([]);
    } finally {
      await services.stopServers();
    }
  });
}
