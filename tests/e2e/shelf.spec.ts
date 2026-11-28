import {
  cp,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { expect, test as base } from "@playwright/test";
import { archiveFiles, testServices } from "./service";

const demo = "tests/fixtures/comics";

const test = base.extend<{ shelf: Awaited<ReturnType<typeof prepareShelf>> }>({
  // Playwright requires destructured fixture dependencies.
  // eslint-disable-next-line no-empty-pattern
  shelf: async ({}, use, info) => {
    const shelf = await prepareShelf(info.outputPath("shelf"));
    try {
      await use(shelf);
    } finally {
      await shelf.stopServers();
    }
  },
});

async function prepareShelf(directory: string) {
  const fixture = join(directory, "comics");
  const output = join(directory, "archives");
  const marker = join(output, ".nas-ready");
  const manifestFile = join(fixture, "series.json");
  await cp(demo, fixture, { recursive: true });
  await mkdir(output);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as {
    workId: string;
    chapters: { id: string; title: string; pages: string[] }[];
  };
  const saveManifest = async () => {
    const temporary = `${manifestFile}.tmp`;
    await writeFile(temporary, JSON.stringify(manifest));
    await rename(temporary, manifestFile);
  };
  const services = testServices(directory);

  async function start(
    options: { fixture?: boolean; marker?: boolean; management?: boolean } = {},
  ) {
    return services.start({
      COMIC_DL_WEB_FIXTURE: options.fixture === false ? "0" : "1",
      COMIC_DL_WEB_FIXTURE_DIR: fixture,
      // A second process can open the shelf even when its configured extension fails to load.
      COMIC_DL_WEB_EXTENSIONS:
        options.fixture === false ? "@fixture/missing-source" : "",
      COMIC_DL_WEB_OUTPUT_MARKER: options.marker ? ".nas-ready" : undefined,
      COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT: options.management ? "1" : "0",
    });
  }

  return {
    fixture,
    output,
    marker,
    manifest,
    saveManifest,
    start,
    stopServers: services.stopServers,
    async archives() {
      return archiveFiles(output);
    },
    async append(id: string, page = "blue.png") {
      manifest.chapters.push({ id, title: id, pages: [page] });
      await saveManifest();
    },
  };
}

test("收藏、基线、后台追更、重启恢复、补历史及重试", async ({
  shelf,
  page,
  context,
}) => {
  const service = await shelf.start();
  await page.goto(`${service.url}/downloads`);
  await page.getByLabel("漫画源").selectOption("fixture");
  await page.getByLabel("作品或章节链接 / 短 ID").fill("demo");
  await page.getByRole("button", { name: "查看章节" }).click();
  await page.getByRole("button", { name: "加入书架" }).click();
  await expect(page.getByRole("status")).toHaveText("作品已在书架中。");
  await page.getByRole("link", { name: "书架" }).click();

  const work = page.getByRole("article", { name: "demo · fixture" });
  await expect(
    work.getByText("自动检查关闭 · 自动下载关闭", { exact: true }),
  ).toBeVisible();
  await expect(work.getByText("尚未检查", { exact: false })).toBeVisible();
  await work.getByText("编辑作品输入").click();
  await expect(work.getByLabel("作品输入")).toHaveValue("demo");
  const html = await page.request.get(`${service.url}/shelf`);
  expect(await html.text()).not.toContain(shelf.fixture);

  await page.getByText("通过链接添加作品").click();
  await page.getByLabel("漫画源").selectOption("fixture");
  await page.getByLabel("作品链接 / 短 ID").fill("demo");
  await page.getByRole("button", { name: "加入书架" }).click();
  await expect(page.getByRole("status")).toHaveText("作品已在书架中。");
  await expect(page.getByRole("article")).toHaveCount(1);

  shelf.manifest.workId = "different-work";
  await shelf.saveManifest();
  await work.getByRole("button", { name: "保存作品输入" }).click();
  await expect(work.getByRole("alert")).toContainText("新输入指向同一作品");
  shelf.manifest.workId = "demo";
  await shelf.saveManifest();
  await work.getByRole("button", { name: "保存作品输入" }).click();
  await expect(work.getByText("已保存作品输入。")).toBeVisible();

  await work.getByRole("button", { name: "开启自动追更", exact: true }).click();
  await expect(work.getByText("检查结果：成功")).toBeVisible();
  await expect(work.getByText("待处理 0 章 · 已完成 0 章")).toBeVisible();
  expect(await shelf.archives()).toEqual([]);
  await page.close();
  await shelf.append("first-new");
  await expect.poll(shelf.archives).toHaveLength(1);

  const reopened = await context.newPage();
  await reopened.goto(`${service.url}/shelf`);
  const entry = reopened.getByRole("article", { name: "demo · fixture" });
  await expect(entry.getByText("待处理 0 章 · 已完成 1 章")).toBeVisible();

  const locked = await shelf.start({ fixture: false });
  const offline = await context.newPage();
  await offline.goto(`${locked.url}/shelf`);
  await expect(offline.getByText("书架追更锁已被占用")).toBeVisible();
  const offlineEntry = offline.getByRole("article", { name: "demo · fixture" });
  await expect(
    offlineEntry.getByText("来源不可用", { exact: true }),
  ).toBeVisible();
  await expect(
    offlineEntry.getByText("已完成 1 章", { exact: false }),
  ).toBeVisible();
  await locked.stop();

  const [archive] = await shelf.archives();
  const firstMtime = (await stat(join(shelf.output, archive))).mtimeMs;
  await service.stop();
  await shelf.append("after-restart");
  const restarted = await shelf.start();
  // A new chapter is found before any request reaches the restarted process.
  await expect.poll(shelf.archives).toHaveLength(2);
  expect((await stat(join(shelf.output, archive))).mtimeMs).toBe(firstMtime);
  await reopened.goto(`${restarted.url}/shelf`);
  await expect(reopened.getByText("追更服务运行中")).toBeVisible();
  await expect(
    entry.getByText("自动检查开启 · 自动下载开启", { exact: true }),
  ).toBeVisible();
  await expect(entry.getByText("待处理 0 章 · 已完成 2 章")).toBeVisible();

  await entry.getByRole("button", { name: "暂停自动追更" }).click();
  await expect(
    entry.getByText("自动检查关闭 · 自动下载关闭", { exact: true }),
  ).toBeVisible();
  await expect(
    reopened.getByRole("button", { name: "检查全部作品" }),
  ).toBeEnabled();
  await shelf.append("while-paused");
  expect(await shelf.archives()).toHaveLength(2);
  await entry
    .getByRole("button", { name: "开启自动追更", exact: true })
    .click();
  await expect(entry.getByText("待处理 0 章 · 已完成 3 章")).toBeVisible();

  await entry.getByRole("button", { name: "补下载历史" }).click();
  await expect(entry.getByText("待处理 0 章 · 已完成 6 章")).toBeVisible();
  expect(await shelf.archives()).toHaveLength(6);
  await reopened.getByRole("button", { name: "检查全部作品" }).click();
  await expect(
    reopened.getByText("已检查 1 项，0 章入队，0 项检查失败。"),
  ).toBeVisible();

  await shelf.append("broken", "missing.png");
  await entry.getByRole("button", { name: "检查更新" }).click();
  await expect(entry.getByText("broken · 下载失败")).toBeVisible();
  await cp(join(demo, "blue.png"), join(shelf.fixture, "missing.png"));
  await entry.getByRole("button", { name: "重试" }).click();
  await expect(entry.getByText("待处理 0 章 · 已完成 7 章")).toBeVisible();
  await expect(entry.getByText("broken · 下载失败")).toHaveCount(0);

  await entry.getByRole("button", { name: "从书架移除" }).click();
  await expect(reopened.getByText("书架暂无作品。")).toBeVisible();
  expect(await shelf.archives()).toHaveLength(7);
});

test("下载子目录消失时保留队列，目录恢复后继续追更", async ({
  shelf,
  page,
}) => {
  test.setTimeout(85_000);
  const folder = join(shelf.output, "Manga");
  const moved = join(shelf.output, "Manga-moved");
  await mkdir(folder);
  const service = await shelf.start({ management: true });
  await page.goto(`${service.url}/settings`);
  await page.getByLabel("下载子目录").fill("Manga");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("服务设置已生效。")).toBeVisible();
  await page.getByRole("link", { name: "书架", exact: true }).click();
  await page.getByText("通过链接添加作品").click();
  await page.getByLabel("漫画源").selectOption("fixture");
  await page.getByLabel("作品链接 / 短 ID").fill("demo");
  await page.getByRole("button", { name: "加入书架" }).click();
  const work = page.getByRole("article", { name: "demo · fixture" });
  await work.getByRole("button", { name: "开启自动追更" }).click();
  await expect(work.getByText("检查结果：成功")).toBeVisible();

  await rename(folder, moved);
  await shelf.append("while-folder-missing");
  const warning = page.getByText("漫画输出目录或挂载标记不可用", {
    exact: false,
  });
  await expect(warning).toBeVisible();
  await expect(work.getByText("待处理 1 章 · 已完成 0 章")).toBeVisible();
  await expect(stat(folder)).rejects.toMatchObject({ code: "ENOENT" });

  // The core accepts an existing replacement directory without a Web-created marker.
  await mkdir(folder);
  await expect(warning).toHaveCount(0);
  await expect(work.getByText("待处理 0 章 · 已完成 1 章")).toBeVisible({
    timeout: 70_000,
  });
  expect(await archiveFiles(folder)).toHaveLength(1);
  expect(
    (await shelf.archives()).every((name) => name.startsWith("Manga/")),
  ).toBe(true);
});

test("根目录挂载标记保护既有下载子目录", async ({ shelf, page }) => {
  await mkdir(join(shelf.output, "Manga"));
  await writeFile(shelf.marker, "");
  const service = await shelf.start({ marker: true, management: true });
  await page.goto(`${service.url}/settings`);
  await page.getByLabel("下载子目录").fill("Manga");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("服务设置已生效。")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("下载子目录")).toHaveValue("Manga");
  await page.getByRole("link", { name: "手动下载" }).click();
  await page.getByLabel("漫画源").selectOption("fixture");
  await page.getByLabel("作品或章节链接 / 短 ID").fill("demo");
  await page.getByRole("button", { name: "下载章节直链" }).click();
  await expect.poll(shelf.archives).toHaveLength(1);
  expect((await shelf.archives())[0]).toMatch(/^Manga\//);
  await unlink(shelf.marker);
  const denied = await page.request.post(`${service.url}/downloads`, {
    form: { intent: "chapter", source: "fixture", input: "demo" },
  });
  expect(denied.status()).toBe(503);
});

test("可选输出标记消失时拒绝手动下载、保留追更队列，恢复后继续下载", async ({
  shelf,
  page,
}) => {
  test.skip(
    process.env.COMIC_DL_WEB_TEST_OUTPUT_MARKER !== "1",
    "可选外部挂载场景",
  );
  test.setTimeout(90_000);
  await writeFile(shelf.marker, "");
  const service = await shelf.start({ marker: true });
  await page.goto(`${service.url}/shelf`);
  await page.getByText("通过链接添加作品").click();
  await page.getByLabel("漫画源").selectOption("fixture");
  await page.getByLabel("作品链接 / 短 ID").fill("demo");
  await page.getByRole("button", { name: "加入书架" }).click();
  const work = page.getByRole("article", { name: "demo · fixture" });
  await work.getByRole("button", { name: "开启自动追更", exact: true }).click();
  await expect(work.getByText("检查结果：成功")).toBeVisible();
  await unlink(shelf.marker);
  await shelf.append("on-nas");
  await expect(
    page.getByText("漫画输出目录或挂载标记不可用", { exact: false }),
  ).toBeVisible();
  await expect(work.getByText("待处理 1 章 · 已完成 0 章")).toBeVisible();
  const manual = await page.request.post(`${service.url}/downloads`, {
    form: { intent: "chapter", source: "fixture", input: "demo" },
  });
  expect(manual.status()).toBe(503);
  expect(await shelf.archives()).toEqual([]);
  await writeFile(shelf.marker, "");
  await expect(
    page.getByText("漫画输出目录或挂载标记不可用", { exact: false }),
  ).toHaveCount(0);
  // The core defers queued downloads when output is unavailable.
  await expect(work.getByText("待处理 0 章 · 已完成 1 章")).toBeVisible({
    timeout: 70_000,
  });
  expect(await shelf.archives()).toHaveLength(1);
});

test("手动检查未追更作品、保留发现的新章，独立配置检查与下载", async ({
  shelf,
  page,
}) => {
  const service = await shelf.start({ management: true });
  await page.goto(service.url);
  await page.getByText("通过链接添加作品").click();
  await page.getByLabel("漫画源").selectOption("fixture");
  await page.getByLabel("作品链接 / 短 ID").fill("demo");
  await page.getByRole("button", { name: "加入书架" }).click();
  const work = page.getByRole("article", { name: "demo · fixture" });
  await work.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(work.getByText("检查结果：成功")).toBeVisible();
  expect(await shelf.archives()).toEqual([]);
  await shelf.append("discovered");
  await page.getByRole("button", { name: "检查全部作品" }).click();
  await expect(work.getByText("新发现 1 章", { exact: false })).toBeVisible();
  await work.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(work.getByText("新发现 1 章", { exact: false })).toBeVisible();
  expect(await shelf.archives()).toEqual([]);

  await work.getByText("检查与下载策略").click();
  await work.getByLabel("自动下载新章").selectOption("on");
  await work.getByLabel("作品检查间隔（秒）").fill("120");
  await work.getByRole("button", { name: "保存策略" }).click();
  await expect(work.getByText("自动检查关闭 · 自动下载开启")).toBeVisible();
  await expect(
    work.getByText("有效间隔 120 秒", { exact: false }),
  ).toBeVisible();
  expect(await shelf.archives()).toEqual([]);
  await work.getByText("新发现与待处理章节").click();
  await work.getByRole("button", { name: "下载章节", exact: true }).click();
  await expect.poll(shelf.archives).toHaveLength(1);
  await shelf.append("manually-checked");
  await work.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect.poll(shelf.archives).toHaveLength(2);
  await page.goto(`${service.url}/settings`);
  await page.getByLabel("追更间隔（秒）").fill("60");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("服务设置已生效。")).toBeVisible();
  await page.goto(service.url);
  await expect(
    work.getByText("有效间隔 120 秒", { exact: false }),
  ).toBeVisible();
  await work.getByText("检查与下载策略").click();
  await work.getByLabel("作品检查间隔（秒）").fill("");
  await work.getByLabel("自动检查", { exact: true }).selectOption("on");
  await work.getByRole("button", { name: "保存策略" }).click();
  await expect(
    work.getByText("有效间隔 60 秒", { exact: false }),
  ).toBeVisible();
  await expect(
    work.getByText("下次检查：未安排", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^下载(?: \(\d+\))?$/ }).click();
  const drawer = page.getByRole("dialog", { name: "下载管理" });
  await expect(drawer.getByText("追更 · fixture · 单章").first()).toBeVisible();
  await expect(
    drawer.getByText("5-manually-checked", { exact: false }).first(),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "清除已结束记录" }).click();
  await expect(drawer.getByText("暂无下载任务。")).toBeVisible();
});
