import { once } from "node:events";
import { mkdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { archiveFiles, testServices } from "./service";

test("外观、下载位置和来源凭证从网页保存，重启后仍可用", async ({
  page,
}, info) => {
  const directory = info.outputPath("service");
  const output = join(directory, "archives", "Manga");
  const services = testServices(directory);
  await mkdir(output, { recursive: true });
  const key = "local-mock-key";
  const upstream = createServer((request, response) => {
    if (request.headers["x-api-key"] !== key) {
      response.writeHead(401).end();
      return;
    }
    if (!request.url?.startsWith("/komga/api/v1/series/list?")) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        content: [{ id: "demo", name: "有权限的漫画" }],
        last: true,
      }),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  if (!address || typeof address === "string")
    throw new Error("Mock server has no TCP address");
  const serverUrl = `http://127.0.0.1:${address.port}/komga`;
  const environment = {
    COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT: "1",
    COMIC_DL_WEB_FIXTURE: "1",
    COMIC_DL_KOMGA_URL: serverUrl,
    COMIC_DL_KOMGA_API_KEY: undefined,
  };
  try {
    const service = await services.start(environment);
    await page.goto(`${service.url}/settings`);
    await page.emulateMedia({ colorScheme: "light" });
    await page.getByRole("button", { name: "夜间模式" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "dark",
    );
    await page.reload();
    await expect(page.getByLabel("颜色模式")).toHaveValue("dark");

    const badPath = await page.request.post(`${service.url}/settings`, {
      headers: { Origin: service.url },
      form: { intent: "save", folder: "../outside", intervalSeconds: 30 },
    });
    expect(badPath.status()).toBe(400);
    await page.getByLabel("下载子目录").fill("Manga");
    await page.getByLabel("追更间隔（秒）").fill("30");
    await page.getByLabel("默认下载来源").selectOption("fixture");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("服务设置已生效。")).toBeVisible();

    await page.getByRole("link", { name: "打开来源设置" }).click();
    const zerobyw = page.getByRole("article", { name: "来源 zerobyw" });
    const login = zerobyw.getByRole("link", { name: "在新标签页登录 Zerobyw" });
    await expect(login).toHaveAttribute("target", "_blank");
    const rejected = await page.request.post(`${service.url}/extensions`, {
      headers: { Origin: service.url },
      form: {
        intent: "save-credential",
        source: "zerobyw",
        target: "https://other.example",
        credential: "session=test",
      },
    });
    expect(rejected.status()).toBe(422);
    const cookie = "session=offline-fixture";
    await zerobyw.getByLabel("Cookie").fill(cookie);
    await zerobyw.getByRole("button", { name: "保存凭证" }).click();
    await expect(zerobyw.getByText("凭证已保存。")).toBeVisible();
    expect(await page.content()).not.toContain(cookie);
    await zerobyw.getByRole("button", { name: "清除网页凭证" }).click();
    await expect(zerobyw.getByText("已清除网页保存的凭证。")).toBeVisible();

    const komga = page.getByRole("article", { name: "来源 komga" });
    await komga.getByLabel("API Key").fill(key);
    await komga.getByRole("button", { name: "保存凭证" }).click();
    await expect(komga.getByText("凭证已保存。")).toBeVisible();
    await expect(komga.getByLabel("API Key")).toHaveValue("");
    expect(await page.content()).not.toContain(key);
    expect((await stat(join(directory, "sources.json"))).mode & 0o777).toBe(
      0o600,
    );
    await service.stop();

    const restarted = await services.start(environment);
    await page.goto(`${restarted.url}/settings`);
    await expect(page.getByLabel("下载子目录")).toHaveValue("Manga");
    await expect(page.getByLabel("追更间隔（秒）")).toHaveValue("30");
    await expect(page.getByLabel("默认下载来源")).toHaveValue("fixture");
    await page.goto(`${restarted.url}/catalog?source=komga&q=demo`);
    await expect(
      page.getByRole("link", { name: "有权限的漫画" }),
    ).toBeVisible();
    expect(await page.content()).not.toContain(key);

    await page.getByRole("link", { name: "手动下载" }).click();
    await page.getByLabel("作品或章节链接 / 短 ID").fill("demo");
    await page.getByRole("button", { name: "查看章节" }).click();
    await page.getByRole("button", { name: "下载全部章节" }).click();
    await expect
      .poll(async () => (await archiveFiles(output)).length)
      .toBeGreaterThan(0);
  } finally {
    await services.stopServers();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
