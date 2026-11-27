import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startExtensionRegistry, testPackage } from "./extension-registry";
import { testServices } from "./service";

test("默认市场只读，推荐扩展可浏览，管理请求被拒绝", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "扩展市场" }).click();
  await expect(page.getByRole("heading", { name: "扩展市场" })).toBeVisible();
  await expect(
    page
      .getByRole("article", { name: "CopyManga" })
      .getByRole("link", { name: "npm" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "安装", exact: true }),
  ).toHaveCount(0);
  const denied = await page.request.post("/extensions", {
    form: { intent: "update-all" },
  });
  expect(denied.status()).toBe(403);
});

test("安装、更新、卸载；来源设置、动态目录与追更共享生效版本", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const directory = info.outputPath("service");
  const services = testServices(directory);
  const registry = await startExtensionRegistry(info.outputPath("registry"));
  const environment = {
    COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT: "1",
    COMIC_DL_WEB_EXTENSIONS: "@fixture/missing-source",
    COMIC_TEST_LABEL: "value-from-environment",
    npm_config_registry: registry.url,
    npm_config_cache: join(directory, "npm-cache"),
    npm_config_prefer_online: "true",
    npm_config_update_notifier: "false",
  };
  try {
    const service = await services.start(environment);
    const market = `${service.url}/extensions`;
    await page.goto(market);
    await expect(
      page.getByText("@fixture/missing-source 无法加载。"),
    ).toBeVisible();
    const crossOrigin = await page.request.post(market, {
      headers: { Origin: "https://example.com" },
      form: { intent: "update-all" },
    });
    expect([400, 403]).toContain(crossOrigin.status());
    const invalidSpec = await page.request.post(market, {
      headers: { Origin: service.url },
      form: {
        intent: "add",
        name: "./local-package",
        version: "",
        trust: "yes",
      },
    });
    expect(invalidSpec.status()).toBe(400);

    const npmPackage = page.getByRole("textbox", {
      name: "npm 包名",
      exact: true,
    });
    await expect(npmPackage).toBeVisible();
    const manualInstall = page.locator("form").filter({ has: npmPackage });
    await npmPackage.fill(testPackage);
    await manualInstall.getByLabel("版本范围或标签（可选）").fill("^1.0.0");
    await manualInstall.getByLabel("我信任此发布者").check();
    await manualInstall
      .getByRole("button", { name: "安装", exact: true })
      .click();
    const source = page.getByRole("article", { name: "来源 catalog-test" });
    await expect(source).toBeVisible({ timeout: 15_000 });
    expect(await page.content()).not.toContain("value-from-environment");

    await page.getByRole("link", { name: "漫画目录" }).click();
    await page.getByLabel("漫画源").selectOption("catalog-test");
    await page.getByRole("button", { name: "浏览 / 搜索" }).click();
    await expect(
      page.getByText("1.0.0 default browse default all 1"),
    ).toBeVisible();
    await expect(page.getByText("带凭据的结果")).toHaveCount(0);
    await page.getByLabel("排序").selectOption("new");
    await page.getByLabel("分组").selectOption("popular");
    await page.getByRole("button", { name: "应用排序与筛选" }).click();
    await expect(
      page.getByText("1.0.0 default browse new popular 1"),
    ).toBeVisible();
    await page.getByRole("link", { name: "下一页" }).click();
    await expect(
      page.getByText("1.0.0 default browse new popular 2"),
    ).toBeVisible();

    await page.getByLabel("关键词").fill("demo");
    await page.getByRole("button", { name: "浏览 / 搜索" }).click();
    await expect(page.getByLabel("排序")).toHaveCount(0);
    await page.getByLabel("分组").selectOption("matched");
    await page.getByRole("button", { name: "应用排序与筛选" }).click();
    await expect(
      page.getByText("1.0.0 default demo default matched 1"),
    ).toBeVisible();
    await page.getByRole("button", { name: "加入书架" }).click();
    await expect(page.getByText("作品已在书架中。")).toBeVisible();
    await page.getByRole("link", { name: "查看与下载" }).click();
    await expect(page.getByLabel("作品或章节链接 / 短 ID")).toHaveValue(
      "https://catalog.example/demo?group=matched",
    );
    await page.getByRole("button", { name: "查看章节" }).click();
    await expect(page.getByRole("heading", { name: "章节列表" })).toBeVisible();
    await page.getByRole("link", { name: "书架" }).click();
    await expect(page.getByLabel("作品输入")).toHaveValue(
      "https://catalog.example/demo?group=matched",
    );
    await page
      .getByLabel("作品输入")
      .fill("https://catalog.example/demo?group=popular");
    await page.getByRole("button", { name: "保存作品输入" }).click();
    await expect(page.getByText("已保存作品输入。")).toBeVisible();
    await page.getByRole("button", { name: "订阅", exact: true }).click();
    await expect(page.getByText("检查结果：成功")).toBeVisible();
    await expect(page.getByText("已完成 0 章", { exact: false })).toBeVisible();

    registry.publishUpdate();
    await page.goto(market);
    await page.getByRole("button", { name: "更新全部托管扩展" }).click();
    await expect(page.getByText("扩展操作已完成。")).toBeVisible({
      timeout: 15_000,
    });
    await page.goto(`${service.url}/catalog?source=catalog-test`);
    await expect(
      page.getByText("1.1.0 default browse default all 1"),
    ).toBeVisible();
    await page.goto(`${service.url}/shelf`);
    await expect(page.getByText("追更服务运行中")).toBeVisible();
    await expect(page.getByText("已完成 1 章", { exact: false })).toBeVisible();

    await page.goto(market);
    await source.getByLabel("展示样式").selectOption("compact");
    await source.getByRole("button", { name: "保存设置" }).click();
    await expect(source.getByText("来源设置已生效。")).toBeVisible();
    await page.goto(`${service.url}/shelf`);
    await expect(page.getByText("已完成 2 章", { exact: false })).toBeVisible();

    await service.stop();
    const restarted = await services.start(environment);
    await page.goto(`${restarted.url}/catalog?source=catalog-test`);
    await expect(
      page.getByText("1.1.0 compact browse default all 1"),
    ).toBeVisible();
    await page.getByRole("link", { name: "扩展市场" }).click();
    await source.getByRole("button", { name: "恢复默认" }).click();
    await expect(source.getByText("已恢复部署配置与默认值。")).toBeVisible();
    await page.goto(`${restarted.url}/catalog?source=catalog-test`);
    await expect(
      page.getByText("1.1.0 default browse default all 1"),
    ).toBeVisible();

    await page.getByRole("link", { name: "扩展市场" }).click();
    await page.getByLabel("已安装的 npm 包名").fill("@fixture/not-installed");
    const manage = page
      .locator("form")
      .filter({ has: page.getByLabel("已安装的 npm 包名") });
    await manage.getByRole("button", { name: "更新" }).click();
    await expect(manage.getByRole("alert")).toContainText("扩展操作失败");
    await expect(source).toBeVisible();
    await page.getByLabel("已安装的 npm 包名").fill(testPackage);
    await manage.getByRole("button", { name: "卸载" }).click();
    await expect(source).toHaveCount(0, { timeout: 15_000 });
    await page.goto(`${restarted.url}/shelf`);
    await expect(page.getByText("已完成 2 章", { exact: false })).toBeVisible();
    await expect(page.getByText("来源不可用", { exact: true })).toBeVisible();
  } finally {
    try {
      await services.stopServers();
    } finally {
      await registry.stop();
    }
  }
});
