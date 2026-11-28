import { once } from "node:events";
import { cp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { archiveFiles, testServices } from "./service";

test("手动章节失败后可重试，不重新下载已成功的章节", async ({ page }, info) => {
  const directory = info.outputPath("service");
  const fixture = join(directory, "comic");
  const output = join(directory, "archives");
  await cp("tests/fixtures/comics", fixture, { recursive: true });
  const manifestFile = join(fixture, "series.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as {
    chapters: { pages: string[] }[];
  };
  manifest.chapters[1].pages = ["missing.png"];
  await writeFile(manifestFile, JSON.stringify(manifest));
  const services = testServices(directory);
  try {
    const service = await services.start({
      COMIC_DL_WEB_FIXTURE: "1",
      COMIC_DL_WEB_FIXTURE_DIR: fixture,
    });
    await page.goto(`${service.url}/downloads`);
    await page.getByLabel("漫画源").selectOption("fixture");
    await page.getByLabel("作品或章节链接 / 短 ID").fill("demo");
    await page.getByRole("button", { name: "查看章节" }).click();
    await page.getByRole("button", { name: "下载全部章节" }).click();
    const task = page.getByRole("article").first();
    await expect(task.getByText("任务失败", { exact: true })).toBeVisible();
    expect(await archiveFiles(output)).toHaveLength(2);
    const first = await readFile(join(output, "demo/1-开篇.cbz"));
    await cp(join(fixture, "blue.png"), join(fixture, "missing.png"));
    await task.getByRole("button", { name: "重试失败或取消章节" }).click();
    await expect(task.getByText("已结束", { exact: true })).toBeVisible();
    expect(await archiveFiles(output)).toHaveLength(3);
    expect(await readFile(join(output, "demo/1-开篇.cbz"))).toEqual(first);
    await expect(
      task.getByRole("listitem").filter({ hasText: "2-中篇" }),
    ).toContainText("已下载");
  } finally {
    await services.stopServers();
  }
});

test("选章保留目录序号、切换格式不重复下载，归档迁移须预览确认", async ({
  page,
}, info) => {
  const directory = info.outputPath("service");
  const services = testServices(directory);
  const fixture = join(directory, "comic");
  const output = join(directory, "archives");
  await cp("tests/fixtures/comics", fixture, { recursive: true });
  try {
    const service = await services.start({
      COMIC_DL_WEB_FIXTURE: "1",
      COMIC_DL_WEB_FIXTURE_DIR: fixture,
      COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT: "1",
    });
    await page.goto(`${service.url}/downloads`);
    await page.getByLabel("漫画源").selectOption("fixture");
    await page.getByLabel("作品或章节链接 / 短 ID").fill("demo");
    await page.getByRole("button", { name: "查看章节" }).click();
    await page.getByRole("checkbox", { name: "2. 中篇" }).check();
    await page.getByRole("button", { name: "提交下载" }).click();
    await expect.poll(() => archiveFiles(output)).toEqual(["demo/2-中篇.cbz"]);

    await page.goto(`${service.url}/settings`);
    await page.getByLabel("归档格式").selectOption("zip");
    await page.getByLabel("序号补零位数").fill("3");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("服务设置已生效。")).toBeVisible();
    await page.goto(`${service.url}/downloads`);
    await page.getByLabel("漫画源").selectOption("fixture");
    await page.getByLabel("作品或章节链接 / 短 ID").fill("demo");
    await page.getByRole("button", { name: "查看章节" }).click();
    await page.getByRole("checkbox", { name: "2. 中篇" }).check();
    await page.getByRole("button", { name: "提交下载" }).click();
    await expect(
      page
        .getByRole("article")
        .first()
        .getByText("已存在 · 跳过", { exact: true }),
    ).toBeVisible();
    expect(await archiveFiles(output)).toEqual(["demo/2-中篇.cbz"]);

    await page.goto(`${service.url}/settings/archive-migration`);
    await page.getByLabel("漫画源").selectOption("fixture");
    await page.getByLabel("作品链接 / 短 ID（可选）").fill("demo");
    await page.getByRole("button", { name: "生成迁移预览" }).click();
    await expect(
      page.getByRole("cell", { name: "demo/002-中篇.zip", exact: true }),
    ).toBeVisible();
    expect(await archiveFiles(output)).toEqual(["demo/2-中篇.cbz"]);
    const tampered = await page.request.post(
      `${service.url}/settings/archive-migration`,
      {
        headers: { Origin: service.url },
        form: { intent: "apply", token: crypto.randomUUID(), confirm: "yes" },
      },
    );
    expect(tampered.status()).toBe(409);
    expect(await archiveFiles(output)).toEqual(["demo/2-中篇.cbz"]);
    await page.getByLabel("已备份归档，确认应用此预览").check();
    await page.getByRole("button", { name: "应用迁移" }).click();
    await expect(page.getByText("迁移已完成，冲突项不会移动。")).toBeVisible();
    expect(await archiveFiles(output)).toEqual(["demo/002-中篇.zip"]);
  } finally {
    await services.stopServers();
  }
});

test("Komga 鉴权封面只通过同站图片接口读取，详情展示元数据", async ({
  page,
}, info) => {
  const png = await readFile("tests/fixtures/comics/blue.png");
  const secret = "private-cover-key";
  let coverRequests = 0;
  const upstream = createServer((request, response) => {
    if (request.headers["x-api-key"] !== secret)
      return void response.writeHead(401).end();
    const path = new URL(request.url!, "http://localhost").pathname;
    const metadata = {
      title: "鉴权漫画",
      authors: [{ name: "测试作者" }],
      summary: "需要鉴权的作品详情",
      genres: ["冒险"],
      tags: [],
    };
    if (path === "/komga/api/v1/series/demo/thumbnail") {
      coverRequests++;
      response.writeHead(200, { "Content-Type": "image/png" }).end(png);
      return;
    }
    const content =
      path === "/komga/api/v1/series/list"
        ? { content: [{ id: "demo", metadata }], last: true }
        : path === "/komga/api/v1/series/demo"
          ? { id: "demo", metadata }
          : path === "/komga/api/v1/books/list"
            ? { content: [{ id: "chapter", seriesId: "demo", name: "第一话" }] }
            : undefined;
    if (!content) return void response.writeHead(404).end();
    response
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify(content));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  if (!address || typeof address === "string")
    throw new Error("No mock address");
  const server = `http://127.0.0.1:${address.port}/komga`;
  const services = testServices(info.outputPath("service"));
  try {
    const service = await services.start({
      COMIC_DL_KOMGA_URL: server,
      COMIC_DL_KOMGA_API_KEY_URL: server,
      COMIC_DL_KOMGA_API_KEY: secret,
    });
    await page.goto(`${service.url}/catalog?source=komga`);
    await expect
      .poll(() =>
        page
          .locator('img[src^="/covers?"]')
          .first()
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.getByRole("link", { name: "鉴权漫画" }).click();
    await expect(page.getByText("作者：测试作者")).toBeVisible();
    await expect(page.getByText("需要鉴权的作品详情")).toBeVisible();
    await expect(page.getByText("冒险", { exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(secret);
    const input = new URL(page.url()).searchParams.get("input")!;
    const fallback = await page.request.get(
      `${service.url}/covers?${new URLSearchParams({ source: "komga", input })}`,
    );
    expect(fallback.headers()["content-type"]).toBe("image/png");
    await page.getByRole("button", { name: "加入书架", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "书架" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "书架", exact: true }).click();
    const shelfCover = page.locator('img[src^="/covers?entry="]').first();
    await expect
      .poll(() =>
        shelfCover.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "切换紧凑显示" }).click();
    await expect(page.getByText("最近检查：")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "鉴权漫画" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "检查更新", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "切换详细显示" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "作品管理与下载策略" }).click();
    await expect(
      page.getByRole("dialog").getByText("检查与下载策略", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.setViewportSize({ width: 320, height: 740 });
    const navigation = page.getByRole("navigation", { name: "主导航" });
    await expect(
      navigation.getByRole("link", { name: "浏览来源" }),
    ).toBeVisible();
    await expect(
      navigation
        .locator("span")
        .filter({ hasText: /^浏览来源$/ })
        .last(),
    ).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "切换详细显示" }).click();
    await expect(page.getByText("最近检查：")).toBeVisible();
    const before = coverRequests;
    const invalid = await page.request.get(
      `${service.url}/covers?source=komga&id=${encodeURIComponent("http://evil.example/key")}`,
    );
    expect(invalid.status()).toBe(404);
    expect(coverRequests).toBe(before);
    const cover = await page.request.get(
      `${service.url}/covers?source=komga&id=demo`,
    );
    expect(cover.headers()["cache-control"]).toBe("private, no-store");
    expect(cover.headers()["content-type"]).toBe("image/png");
  } finally {
    await services.stopServers();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
