import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createDownloader,
  fixtureExtension,
  planArchiveMigration,
  applyArchiveMigration,
} from "comic-dl";
import {
  createDownloader as createV3,
  fixtureExtension as fixtureV3,
} from "comic-dl-v3";
import { expect, it } from "vitest";
import {
  archiveSettings,
  defaultArchive,
  librarySettings,
} from "../../app/downloader.server";

it("升级旧书架保留策略、基线与队列，并继续识别旧哈希归档", async () => {
  const base = resolve("test-results/unit-migration");
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "case-"));
  try {
    const output = join(directory, "output");
    const comic = join(directory, "comic");
    const paused = join(directory, "paused");
    await Promise.all([mkdir(output), mkdir(comic), mkdir(paused)]);
    const blue = await readFile("tests/fixtures/comics/blue.png");
    const chapters = [{ id: "one", title: "第一话", pages: ["blue.png"] }];
    const manifest = (workId: string) => JSON.stringify({ workId, chapters });
    for (const [folder, id] of [
      [comic, "迁移漫画"],
      [paused, "暂停漫画"],
    ]) {
      await writeFile(join(folder, "blue.png"), blue);
      await writeFile(join(folder, "series.json"), manifest(id));
    }
    const file = join(directory, "shelf.sqlite");
    const old = createV3().use(fixtureV3);
    const previous = await old.openShelf({ file });
    const followed = await previous.add(comic, { source: "fixture" });
    const unfollowed = await previous.add(paused, { source: "fixture" });
    previous.follow(followed.id);
    await previous.check();
    chapters.push({ id: "two", title: "第二话", pages: ["blue.png"] });
    chapters.push({ id: "broken", title: "失败章节", pages: ["missing.png"] });
    await writeFile(join(comic, "series.json"), manifest("迁移漫画"));
    await previous.check();
    const controller = new AbortController();
    const watchOutput = join(directory, "watch-output");
    await mkdir(watchOutput);
    try {
      await previous.watch({
        directory: watchOutput,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        retries: 0,
        onTask: () => {
          const status = previous.status(followed.id)[0];
          if (status.complete === 1 && status.blocked === 1) controller.abort();
        },
      });
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
    expect(controller.signal.aborted).toBe(true);
    chapters.push({ id: "three", title: "第三话", pages: ["blue.png"] });
    await writeFile(join(comic, "series.json"), manifest("迁移漫画"));
    await previous.check();
    const oldStatus = previous.status(followed.id)[0];
    previous.close();
    const [downloaded] = await old.download(comic, {
      source: "fixture",
      directory: output,
      chapters: ["one"],
    });
    expect(downloaded.status).toBe("downloaded");
    const original = (await readdir(output)).find((name) =>
      name.endsWith(".cbz"),
    )!;
    expect(original).toBeTruthy();

    const current = createDownloader().use(fixtureExtension);
    const shelf = await current.openShelf({ file });
    try {
      expect(
        shelf.list().find((entry) => entry.id === followed.id),
      ).toMatchObject({ autoCheck: 1, autoDownload: 1 });
      expect(
        shelf.list().find((entry) => entry.id === unfollowed.id),
      ).toMatchObject({ autoCheck: 0, autoDownload: 0 });
      expect(shelf.status(followed.id)[0]).toMatchObject({
        lastSuccess: oldStatus.lastSuccess,
        pending: 1,
        complete: 1,
        blocked: 1,
      });
      expect(
        shelf
          .chapters(followed.id)
          .find((chapter) => chapter.chapterId === "three")?.state,
      ).toBe("queued");
      expect(
        shelf
          .chapters(followed.id)
          .find((chapter) => chapter.chapterId === "two")?.state,
      ).toBe("complete");
      expect(shelf.needsAttention(followed.id)).toContainEqual({
        id: "broken",
        state: "blocked",
      });
      expect((await shelf.check({ entryId: unfollowed.id })).checked).toBe(1);
    } finally {
      shelf.close();
    }

    const [existing] = await current.download(comic, {
      source: "fixture",
      directory: output,
      chapters: ["one"],
      archive: { ...defaultArchive, format: "zip", padding: 3 },
    });
    expect(existing.status).toBe("skipped");
    expect(
      (await readdir(output)).filter((name) => name.endsWith(".cbz")),
    ).toEqual([original]);
    const preview = await planArchiveMigration(
      output,
      [
        {
          identity: ["fixture", "迁移漫画", "one"],
          title: "迁移漫画",
          chapter: "第一话",
          number: 1,
        },
      ],
      { ...defaultArchive, padding: 3, format: "zip" },
    );
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      from: original,
      to: "迁移漫画/001-第一话.zip",
      status: "move",
    });
    expect((await readdir(output)).includes(original)).toBe(true);
    await applyArchiveMigration(output, preview);
    expect(
      (await readdir(output, { recursive: true })).includes(
        "迁移漫画/001-第一话.zip",
      ),
    ).toBe(true);
    expect(
      (
        await current.download(comic, {
          source: "fixture",
          directory: output,
          chapters: ["one"],
        })
      )[0].status,
    ).toBe("skipped");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("旧 Web 设置补齐归档默认值，拒绝越界模板及无效格式", () => {
  expect(
    librarySettings.parse({ folder: "", intervalSeconds: 60 }).archive,
  ).toEqual(defaultArchive);
  for (const template of [
    "../{title}",
    "/{title}",
    "{secret}",
    "{title}.cbz",
    "a/b/c/d/e",
    "a\\b",
  ]) {
    expect(
      archiveSettings.safeParse({ ...defaultArchive, template }).success,
    ).toBe(false);
  }
  expect(
    archiveSettings.safeParse({ ...defaultArchive, format: "tar" }).success,
  ).toBe(false);
});
