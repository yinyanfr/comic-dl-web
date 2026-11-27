import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  cp,
  mkdir,
  open,
  readdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";
import {
  archiveDirectory,
  fixtureDirectory,
  fixtureURL,
} from "../../playwright.config";

test.use({ baseURL: fixtureURL });

function latestTask(page: Page) {
  return page
    .getByRole("region", { name: "下载任务" })
    .getByRole("article")
    .first();
}

async function listChapters(page: Page) {
  await page.getByLabel("漫画源").selectOption("fixture");
  await page.getByLabel("作品或章节链接 / 短 ID").fill("demo");
  await page.getByRole("button", { name: "查看章节" }).click();
  await expect(page.getByRole("heading", { name: "章节列表" })).toBeVisible();
}

async function archives() {
  return (await readdir(archiveDirectory)).filter((name) =>
    name.endsWith(".cbz"),
  );
}

test("关闭页面后生成 CBZ，刷新可见结果，重跑会跳过已有章节", async ({
  page,
  context,
}) => {
  // A named pipe keeps the first fixture page pending until the submitting tab is closed.
  test.skip(
    process.platform === "win32",
    "离线流程使用 POSIX 命名管道控制测试页完成时机",
  );
  await context.addInitScript(() => {
    Reflect.deleteProperty(Map, "groupBy");
  });
  const demo = "tests/fixtures/comics";
  await cp(demo, fixtureDirectory, { recursive: true });
  await mkdir(archiveDirectory, { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(demo, "series.json"), "utf8"),
  ) as {
    workId: string;
    chapters: { id: string; title: string; pages: string[] }[];
  };
  manifest.chapters.push({
    id: "broken",
    title: "缺页章节",
    pages: ["missing.png"],
  });
  await writeFile(
    join(fixtureDirectory, "series.json"),
    JSON.stringify(manifest),
  );
  const gate = join(fixtureDirectory, "blue.png");
  await unlink(gate);
  await promisify(execFile)("mkfifo", [gate]);

  await page.goto("/downloads");
  const badInput = await page.request.post("/downloads", {
    form: { intent: "list", source: "fixture", input: fixtureDirectory },
  });
  expect(badInput.status()).toBe(400);

  await listChapters(page);
  await page.getByRole("checkbox", { name: "1. 开篇" }).check();
  await page.getByRole("button", { name: "提交下载" }).click();
  await expect(latestTask(page).getByText("下载中")).toBeVisible();
  await expect(
    latestTask(page)
      .getByRole("region", { name: "待处理章节" })
      .getByText("1-开篇"),
  ).toBeVisible();
  await expect.poll(archives).toHaveLength(0);

  await page.getByRole("button", { name: "下载章节直链" }).click();
  await expect(latestTask(page).getByText("排队中")).toBeVisible();
  await latestTask(page).getByRole("button", { name: "取消任务" }).click();
  await expect(latestTask(page).getByText("已取消")).toBeVisible();
  await page.close();

  const blue = await readFile(join(demo, "blue.png"));
  await expect(async () => {
    const pipe = await open(gate, constants.O_WRONLY | constants.O_NONBLOCK);
    try {
      await pipe.writeFile(blue);
    } finally {
      await pipe.close();
    }
  }).toPass({ timeout: 5000 });
  await expect.poll(archives).toHaveLength(1);
  const [archive] = await archives();
  const zip = new ZipReader(
    new Uint8ArrayReader(await readFile(join(archiveDirectory, archive))),
  );
  try {
    const entries = await zip.getEntries();
    expect(entries).toHaveLength(2);
    const [first, second] = entries;
    if (first.directory || second.directory)
      throw new Error("CBZ 包含非页面条目");
    expect(await first.getData(new Uint8ArrayWriter())).toEqual(
      new Uint8Array(blue),
    );
    expect(await second.getData(new Uint8ArrayWriter())).toEqual(
      new Uint8Array(await readFile(join(demo, "gold.png"))),
    );
  } finally {
    await zip.close();
  }
  await unlink(gate);
  await writeFile(gate, blue);

  const reopened = await context.newPage();
  await reopened.goto("/downloads");
  const completed = reopened.getByRole("article").filter({ hasText: "1-开篇" });
  await expect(completed.getByText("已下载", { exact: true })).toBeVisible();

  const observer = await context.newPage();
  await observer.goto("/downloads");
  await expect(latestTask(observer).getByText("已取消")).toBeVisible();

  await listChapters(reopened);
  await reopened.getByRole("checkbox", { name: "2. 中篇" }).check();
  await reopened.getByLabel("章节范围（可选）").fill("2-9");
  await reopened.getByRole("button", { name: "提交下载" }).click();
  await expect(latestTask(reopened).getByText("任务失败")).toBeVisible();
  expect(await archives()).toHaveLength(1);

  await reopened.getByRole("checkbox", { name: "2. 中篇" }).uncheck();
  await reopened.getByRole("checkbox", { name: "1. 开篇" }).check();
  await reopened.getByLabel("章节范围（可选）").fill("2-4");
  await reopened.getByRole("button", { name: "提交下载" }).click();
  const result = latestTask(reopened);
  await expect(result.getByText("已结束")).toBeVisible();
  await expect(
    result.getByRole("listitem").filter({ hasText: "1-开篇" }),
  ).toContainText("跳过");
  await expect(
    result.getByRole("listitem").filter({ hasText: "2-中篇" }),
  ).toContainText("已下载");
  await expect(
    result.getByRole("listitem").filter({ hasText: "3-终篇" }),
  ).toContainText("已下载");
  await expect(
    result.getByRole("listitem").filter({ hasText: "4-缺页章节" }),
  ).toContainText("章节失败");
  await expect(latestTask(observer).getByText("章节失败")).toBeVisible();
  expect(await archives()).toHaveLength(3);

  await reopened.getByRole("button", { name: "下载章节直链" }).click();
  await expect(
    latestTask(reopened).getByText("已存在 · 跳过", { exact: true }),
  ).toHaveCount(1);
  await expect(latestTask(reopened).getByText("fixture · 单章")).toBeVisible();
  expect(await archives()).toHaveLength(3);

  manifest.chapters.push({
    id: "2-3",
    title: "有数字范围形状的 ID",
    pages: ["blue.png"],
  });
  const seriesFile = join(fixtureDirectory, "series.json");
  await writeFile(seriesFile, JSON.stringify(manifest));
  await listChapters(reopened);
  await reopened.getByLabel("章节范围（可选）").fill("2-3");
  await reopened.getByRole("button", { name: "提交下载" }).click();
  await expect(latestTask(reopened).getByRole("listitem")).toHaveCount(2);
  await expect(
    latestTask(reopened).getByRole("listitem").filter({ hasText: "2-中篇" }),
  ).toContainText("跳过");
  await expect(
    latestTask(reopened).getByRole("listitem").filter({ hasText: "3-终篇" }),
  ).toContainText("跳过");
  expect(await archives()).toHaveLength(3);

  manifest.chapters.reverse();
  await writeFile(seriesFile, JSON.stringify(manifest));
  await reopened.getByRole("button", { name: "提交下载" }).click();
  await expect(
    latestTask(reopened).getByText("章节目录或选择已失效。", { exact: false }),
  ).toBeVisible();
  expect(await archives()).toHaveLength(3);

  await reopened.getByLabel("作品或章节链接 / 短 ID").fill("another-work");
  await expect(reopened.getByRole("heading", { name: "章节列表" })).toHaveCount(
    0,
  );
  await expect(reopened.getByRole("button", { name: "加入书架" })).toHaveCount(
    0,
  );

  await listChapters(reopened);
  await reopened.getByRole("button", { name: "加入书架" }).click();
  await expect(reopened.getByText("作品已在书架中。")).toBeVisible();
  await reopened.getByRole("link", { name: "书架", exact: true }).click();
  await reopened.getByRole("link", { name: "demo", exact: true }).click();
  await expect(reopened.getByText("已在书架中")).toBeVisible();
  await reopened.getByRole("button", { name: "下载全部未下载章节" }).click();
  await expect(
    reopened.getByText("已提交任务：", { exact: false }),
  ).toBeVisible();
  await reopened.getByRole("button", { name: /^下载(?: \(\d+\))?$/ }).click();
  const drawer = reopened.getByRole("dialog", { name: "下载管理" });
  await expect(
    drawer.getByRole("heading", { name: "demo", exact: true }),
  ).toBeVisible();
  const backfill = latestTask(reopened);
  await expect(backfill.getByText("已结束")).toBeVisible();
  await expect(
    backfill.getByRole("listitem").filter({ hasText: "5-开篇" }),
  ).toContainText("跳过");
  await expect(
    backfill.getByRole("listitem").filter({ hasText: "1-有数字范围形状的 ID" }),
  ).toContainText("已下载");
  expect(await archives()).toHaveLength(4);
  await drawer.getByRole("button", { name: "清除已结束记录" }).click();
  await expect(drawer.getByText("暂无下载任务。")).toBeVisible();
});
