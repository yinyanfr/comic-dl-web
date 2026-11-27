import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { expect, test as base } from "@playwright/test";

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
  const servers = new Set<() => Promise<void>>();

  async function start(options: { fixture?: boolean; marker?: boolean } = {}) {
    const child = spawn(process.execPath, ["server.ts"], {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
        NODE_ENV: "test",
        COMIC_DL_WEB_FIXTURE: options.fixture === false ? "0" : "1",
        COMIC_DL_WEB_FIXTURE_DIR: fixture,
        COMIC_DL_WEB_OUTPUT: output,
        COMIC_DL_WEB_SHELF: join(directory, "shelf.sqlite"),
        COMIC_DL_WEB_WATCH_INTERVAL: "1",
        // A second process can open the shelf even when its configured extension fails to load.
        COMIC_DL_WEB_EXTENSIONS:
          options.fixture === false ? "@fixture/missing-source" : "",
        ...(options.marker ? { COMIC_DL_WEB_OUTPUT_MARKER: ".nas-ready" } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    const exited = once(child, "exit");
    const stop = async () => {
      servers.delete(stop);
      child.kill("SIGTERM");
      try {
        const [code, signal] = await Promise.race([
          exited,
          once(child, "exit", { signal: AbortSignal.timeout(10_000) }),
        ]);
        expect([code, signal], stderr).toEqual([0, null]);
      } finally {
        child.kill("SIGKILL");
      }
    };
    servers.add(stop);
    const lines = createInterface({ input: child.stdout });
    const url = await Promise.race([
      once(lines, "line").then(([line]) => {
        const match = /^comic-dl-web: (http:\/\/127\.0\.0\.1:\d+)$/.exec(
          String(line),
        );
        if (!match) throw new Error(`Unexpected service output: ${line}`);
        return match[1];
      }),
      exited.then(() => {
        throw new Error(`Service stopped before listening: ${stderr}`);
      }),
    ]);
    return { url, stop };
  }

  return {
    fixture,
    output,
    marker,
    manifest,
    saveManifest,
    start,
    async stopServers() {
      await Promise.all([...servers].map((stop) => stop()));
    },
    async archives() {
      return (await readdir(output)).filter((filename) =>
        filename.endsWith(".cbz"),
      );
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
  await page.goto(service.url);
  await page.getByLabel("漫画源").selectOption("fixture");
  await page.getByLabel("作品或章节链接 / 短 ID").fill("demo");
  await page.getByRole("button", { name: "查看章节" }).click();
  await page.getByRole("button", { name: "加入书架" }).click();
  await expect(page.getByRole("status")).toHaveText("作品已在书架中。");
  await page.getByRole("link", { name: "书架" }).click();

  const work = page.getByRole("article", { name: "demo · fixture" });
  await expect(work.getByText("未订阅", { exact: true })).toBeVisible();
  await expect(work.getByText("尚未检查", { exact: false })).toBeVisible();
  await expect(work.getByLabel("作品输入")).toHaveValue("demo");
  const html = await page.request.get(`${service.url}/shelf`);
  expect(await html.text()).not.toContain(shelf.fixture);

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

  await work.getByRole("button", { name: "订阅", exact: true }).click();
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
  await expect(entry.getByText("已订阅", { exact: true })).toBeVisible();
  await expect(entry.getByText("待处理 0 章 · 已完成 2 章")).toBeVisible();

  await entry.getByRole("button", { name: "暂停订阅" }).click();
  await expect(entry.getByText("未订阅", { exact: true })).toBeVisible();
  await expect(
    reopened.getByRole("button", { name: "检查全部订阅" }),
  ).toBeDisabled();
  await shelf.append("while-paused");
  expect(await shelf.archives()).toHaveLength(2);
  await entry.getByRole("button", { name: "订阅", exact: true }).click();
  await expect(entry.getByText("待处理 0 章 · 已完成 3 章")).toBeVisible();

  await entry.getByRole("button", { name: "补下载历史" }).click();
  await expect(entry.getByText("待处理 0 章 · 已完成 6 章")).toBeVisible();
  expect(await shelf.archives()).toHaveLength(6);
  await reopened.getByRole("button", { name: "检查全部订阅" }).click();
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

test("NAS 标记消失时拒绝手动下载、保留追更队列，恢复后继续下载", async ({
  shelf,
  page,
}) => {
  test.setTimeout(90_000);
  await writeFile(shelf.marker, "");
  const service = await shelf.start({ marker: true });
  await page.goto(`${service.url}/shelf`);
  await page.getByLabel("漫画源").selectOption("fixture");
  await page.getByLabel("作品链接 / 短 ID").fill("demo");
  await page.getByRole("button", { name: "加入书架" }).click();
  const work = page.getByRole("article", { name: "demo · fixture" });
  await work.getByRole("button", { name: "订阅", exact: true }).click();
  await expect(work.getByText("检查结果：成功")).toBeVisible();
  await unlink(shelf.marker);
  await shelf.append("on-nas");
  await expect(
    page.getByText("漫画输出目录的挂载标记不可用", { exact: false }),
  ).toBeVisible();
  await expect(work.getByText("待处理 1 章 · 已完成 0 章")).toBeVisible();
  const manual = await page.request.post(`${service.url}/?index`, {
    form: { intent: "chapter", source: "fixture", input: "demo" },
  });
  expect(manual.status()).toBe(503);
  expect(await shelf.archives()).toEqual([]);
  await writeFile(shelf.marker, "");
  await expect(
    page.getByText("漫画输出目录的挂载标记不可用", { exact: false }),
  ).toHaveCount(0);
  // Core 3.2.0 defers queued downloads for one minute when the marker is missing.
  await expect(work.getByText("待处理 0 章 · 已完成 1 章")).toBeVisible({
    timeout: 70_000,
  });
  expect(await shelf.archives()).toHaveLength(1);
});
