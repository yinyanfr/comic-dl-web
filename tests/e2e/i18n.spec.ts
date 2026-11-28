import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { testServices } from "./service";

for (const language of [
  {
    code: "en",
    name: "English",
    heading: "Settings",
    browse: "Browse sources",
    chapters: "Chapters",
    add: "Add to shelf",
    status: "The work is on your shelf.",
    summary: "Summary",
  },
  {
    code: "ja",
    name: "日本語",
    heading: "設定",
    browse: "配信元を探す",
    chapters: "章一覧",
    add: "本棚に追加",
    status: "作品を本棚に登録しました。",
    summary: "あらすじ",
  },
]) {
  test(`${language.code}: SSR、导航、反馈及漫画内容边界`, async ({
    page,
  }, info) => {
    const png = await readFile("tests/fixtures/comics/blue.png");
    const upstream = createServer((request, response) => {
      const path = new URL(request.url!, "http://localhost").pathname;
      const metadata = {
        title: "设置",
        authors: [{ name: "作者原文" }],
        summary: "暂无下载任务。",
        tags: ["成功"],
      };
      if (path.endsWith("/thumbnail"))
        return void response
          .writeHead(200, { "Content-Type": "image/png" })
          .end(png);
      const content =
        path === "/api/v1/series/list"
          ? { content: [{ id: "demo", metadata }], last: true }
          : path === "/api/v1/series/demo"
            ? { id: "demo", metadata }
            : path === "/api/v1/books/list"
              ? {
                  content: [
                    { id: "chapter", seriesId: "demo", name: "下一页" },
                  ],
                }
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
    const url = `http://127.0.0.1:${address.port}`;
    const services = testServices(info.outputPath("service"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      const service = await services.start({
        COMIC_DL_KOMGA_URL: url,
        COMIC_DL_KOMGA_API_KEY_URL: url,
        COMIC_DL_KOMGA_API_KEY: "test-key",
      });
      await page.goto(`${service.url}/settings`);
      await page.getByRole("button", { name: "语言", exact: true }).click();
      await page
        .getByRole("menuitem", { name: language.name, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: language.heading, exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", language.code);
      await expect(page).toHaveTitle(`${language.heading} · comic-dl-web`);
      const ssr = await page.request.get(`${service.url}/settings`);
      const html = await ssr.text();
      expect(html).toContain(`lang="${language.code}"`);
      expect(html).toContain(`>${language.heading}</h1>`);
      await page
        .getByRole("link", { name: language.browse, exact: true })
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        language.browse,
      );
      await page.goto(`${service.url}/catalog?source=komga&q=设置&page=1`);
      await page.getByRole("link", { name: "设置", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "设置", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: language.chapters, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: language.summary, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("暂无下载任务。", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("成功", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: "1. 下一页", exact: true }),
      ).toBeVisible();
      await expect(page).toHaveTitle("设置 · comic-dl-web");
      await page
        .getByRole("button", { name: language.add, exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: language.status }),
      ).toBeVisible();
      // Switching language preserves the current business URL and its query.
      const businessUrl = page.url();
      await page
        .getByRole("button", {
          name: language.code === "en" ? "Language" : "言語",
          exact: true,
        })
        .click();
      await page.getByRole("menuitem", { name: "中文", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "章节列表", exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(businessUrl);
      expect(errors).toEqual([]);
    } finally {
      await services.stopServers();
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
}

test("登录页语言在错误、登录及退出后保留；设置页可切换", async ({
  page,
}, info) => {
  const services = testServices(info.outputPath("service"));
  try {
    const service = await services.start({
      COMIC_DL_WEB_ADMIN_PASSWORD: "secret",
    });
    await page.goto(`${service.url}/settings`);
    await page.getByRole("link", { name: "English", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page
      .getByLabel("Administrator password", { exact: true })
      .fill("wrong");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Incorrect password.");
    await page
      .getByLabel("Administrator password", { exact: true })
      .fill("secret");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(`${service.url}/settings`);
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Interface language", { exact: true })
      .selectOption("ja");
    await expect(
      page.getByRole("heading", { name: "設定", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "管理者ログイン", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  } finally {
    await services.stopServers();
  }
});

test("下载状态与校验错误可切换语言，源章节名保持原样", async ({
  page,
}, info) => {
  const services = testServices(info.outputPath("service"));
  try {
    const service = await services.start({ COMIC_DL_WEB_FIXTURE: "1" });
    await page.context().addCookies([
      {
        name: "comic_dl_web_language",
        value: "en",
        url: service.url,
      },
    ]);
    await page.goto(`${service.url}/downloads?source=fixture&input=demo`);
    await page
      .getByRole("button", { name: "View chapters", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Chapters", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Start download", exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      "Select chapters or enter a range such as 2-4.",
    );
    await page.getByRole("checkbox", { name: "1. 开篇", exact: true }).check();
    await page
      .getByRole("button", { name: "Start download", exact: true })
      .click();
    await expect(page.getByText("Finished", { exact: true })).toBeVisible();
    await expect(page.getByText("1-开篇", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("menuitem", { name: "日本語", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "手動ダウンロード", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("終了", { exact: true })).toBeVisible();
    await expect(page.getByText("1-开篇", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 800 });
    await expect
      .poll(() =>
        page
          .getByRole("banner")
          .evaluate(
            (header) =>
              Math.ceil(header.getBoundingClientRect().right) <=
              window.innerWidth,
          ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "言語", exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: "English", exact: true }),
    ).toBeVisible();
  } finally {
    await services.stopServers();
  }
});
