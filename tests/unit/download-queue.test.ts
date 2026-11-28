import { describe, expect, it, vi } from "vitest";
import {
  DownloadQueue,
  recentShelfTasks,
  shelfDownloadTasks,
} from "../../app/download-queue.server";
import type { DownloadTaskSnapshot } from "comic-dl";

describe("手动下载队列", () => {
  it("等待运行中的任务取消并退出后才启动下一个，同时保留已完成的逐章结果", async () => {
    const queue = new DownloadQueue();
    const drain = Promise.withResolvers<void>();
    const started = Promise.withResolvers<AbortSignal>();
    const first = queue.submit("offline", "series", async (signal, record) => {
      record({
        sourceId: "offline",
        workId: "demo",
        workTitle: "demo",
        chapterTitle: "ok",
        chapterId: "ok",
        status: "downloaded",
        path: "/private/output.cbz",
        attempts: 1,
      });
      record({
        sourceId: "offline",
        workId: "demo",
        workTitle: "demo",
        chapterTitle: "locked",
        chapterId: "locked",
        status: "restricted",
        error: "private credential",
        attempts: 1,
      });
      started.resolve(signal);
      await drain.promise;
      signal.throwIfAborted();
    });
    const queuedWork = vi.fn(async () => {});
    const cancelled = queue.submit("offline", "chapter", queuedWork)!;
    const nextWork = vi.fn(async () => {});
    const next = queue.submit("offline", "chapter", nextWork)!;

    const signal = await started.promise;
    expect(queue.cancel(cancelled)).toBe(true);
    expect(queue.cancel(first!)).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(nextWork).not.toHaveBeenCalled();
    expect(queue.snapshot().map(({ status }) => status)).toEqual([
      "queued",
      "cancelled",
      "cancelling",
    ]);

    drain.resolve();
    await vi.waitFor(() => {
      expect(queue.snapshot()).toEqual([
        {
          id: next,
          source: "offline",
          kind: "chapter",
          status: "completed",
          resultCount: 0,
          retryable: false,
          results: [],
        },
        {
          id: cancelled,
          source: "offline",
          kind: "chapter",
          status: "cancelled",
          resultCount: 0,
          retryable: true,
          results: [],
        },
        {
          id: first,
          source: "offline",
          kind: "series",
          status: "cancelled",
          resultCount: 2,
          retryable: true,
          results: [
            { chapterId: "ok", status: "downloaded" },
            { chapterId: "locked", status: "restricted" },
          ],
        },
      ]);
    });
    expect(queuedWork).not.toHaveBeenCalled();
    expect(nextWork).toHaveBeenCalledOnce();
  });

  it("停止时中止运行任务、取消等待任务并等待清理", async () => {
    const queue = new DownloadQueue();
    const started = Promise.withResolvers<AbortSignal>();
    const cleanup = Promise.withResolvers<void>();
    const run = vi.fn(async (signal: AbortSignal) => {
      started.resolve(signal);
      await cleanup.promise;
    });
    queue.submit("offline", "chapter", run);
    const pending = queue.submit("offline", "chapter", run);
    const signal = await started.promise;

    const stopped = vi.fn();
    const stopping = queue.stop().then(stopped);
    expect(signal.aborted).toBe(true);
    expect(queue.snapshot()[0]).toMatchObject({
      id: pending,
      status: "cancelled",
    });
    expect(queue.submit("offline", "chapter", run)).toBeUndefined();
    await Promise.resolve();
    expect(stopped).not.toHaveBeenCalled();

    cleanup.resolve();
    await stopping;
    expect(run).toHaveBeenCalledOnce();
    expect(queue.snapshot().map(({ status }) => status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
  });

  it("状态只返回最近的结果，历史结果仍可按页读取", async () => {
    const queue = new DownloadQueue();
    const id = queue.submit("offline", "series", async (_signal, record) => {
      for (let chapter = 1; chapter <= 23; chapter++) {
        record({
          sourceId: "offline",
          workId: "demo",
          workTitle: "demo",
          chapterTitle: String(chapter),
          chapterId: String(chapter),
          status: "skipped",
          path: "archive.cbz",
          attempts: 1,
        });
      }
    })!;
    await vi.waitFor(() => {
      expect(queue.snapshot()[0]).toMatchObject({
        status: "completed",
        resultCount: 23,
      });
    });
    expect(queue.snapshot()[0].results).toHaveLength(20);
    expect(queue.snapshot()[0].results[0].chapterId).toBe("4");
    expect(queue.results(id, 0)?.results.at(-1)?.chapterId).toBe("20");
    expect(
      queue.results(id, 20)?.results.map(({ chapterId }) => chapterId),
    ).toEqual(["21", "22", "23"]);
  });
});

it("安全任务事件展示页数、标记部分失败，重试只选择失败章节", async () => {
  const queue = new DownloadQueue();
  const snapshot = (
    chapterId: string,
    state: DownloadTaskSnapshot["state"],
  ): DownloadTaskSnapshot => ({
    id: `manual-${chapterId}`,
    origin: "manual",
    sourceId: "offline",
    workId: "demo",
    workTitle: "漫画",
    chapterId,
    chapterTitle: chapterId,
    number: chapterId === "one" ? 1 : 2,
    state,
    pagesDownloaded: state === "downloaded" ? 2 : 1,
    totalPages: 2,
    attempt: 1,
    retryable: state === "failed",
  });
  const selections: (string[] | undefined)[] = [];
  const id = queue.submit(
    "offline",
    "series",
    async (_signal, _record, _describe, onEvent, retryIds) => {
      selections.push(retryIds);
      if (!retryIds)
        onEvent({ type: "task", task: snapshot("one", "downloaded") });
      onEvent({
        type: "task",
        task: snapshot("two", retryIds ? "downloaded" : "failed"),
      });
    },
  )!;
  await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe("failed"));
  expect(queue.snapshot()[0].chapters?.[1]).toMatchObject({
    pagesDownloaded: 1,
    totalPages: 2,
  });
  expect(queue.retry(id)).toBe(true);
  await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe("completed"));
  expect(selections).toEqual([undefined, ["two"]]);
  expect(queue.snapshot()[0].chapters?.[1].attempt).toBe(2);
  expect(queue.retry(id)).toBe(false);
  await queue.stop();
});

it("迁移写入门禁阻止提交和重试，但不丢弃现有记录", async () => {
  const queue = new DownloadQueue();
  const id = queue.submit("offline", "chapter", async () => {})!;
  await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe("completed"));
  queue.block(true);
  expect(queue.submit("offline", "chapter", async () => {})).toBeUndefined();
  expect(queue.retry(id)).toBe(false);
  expect(queue.snapshot()).toHaveLength(1);
  queue.block(false);
  await queue.stop();
});

it("书架任务保持来源、稳定身份和可重试状态", () => {
  const [task] = shelfDownloadTasks([
    {
      id: "persistent-id",
      origin: "shelf",
      entryId: "entry",
      sourceId: "offline",
      workId: "work",
      workTitle: "漫画",
      chapterId: "chapter",
      chapterTitle: "第一话",
      number: 1,
      state: "failed",
      pagesDownloaded: 1,
      totalPages: 2,
      attempt: 2,
      retryable: true,
    },
  ]);
  expect(task).toMatchObject({
    id: "persistent-id",
    origin: "shelf",
    entryId: "entry",
    status: "failed",
    work: { id: "work", title: "漫画" },
  });
});

function chapterSnapshot(
  number: number,
  state: DownloadTaskSnapshot["state"],
): DownloadTaskSnapshot {
  return {
    id: `chapter-${number}`,
    origin: "manual",
    sourceId: "offline",
    workId: "work",
    workTitle: "漫画",
    chapterId: String(number),
    chapterTitle: String(number),
    number,
    state,
    pagesDownloaded: 0,
    attempt: 1,
    readyAt: number,
    retryable: state === "failed",
  };
}

it("默认快照限制章节历史，但保留完整结果分页和隐藏章节的重试状态", async () => {
  const queue = new DownloadQueue();
  const selections: (string[] | undefined)[] = [];
  const id = queue.submit(
    "offline",
    "series",
    async (_signal, _record, _describe, event, retryIds) => {
      selections.push(retryIds);
      if (retryIds) {
        event({ type: "task", task: chapterSnapshot(1, "downloaded") });
        return;
      }
      for (let number = 1; number <= 60; number++)
        event({
          type: "task",
          task: chapterSnapshot(number, number === 1 ? "failed" : "downloaded"),
        });
    },
  )!;
  await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe("failed"));
  const task = queue.snapshot()[0];
  expect(task.chapters).toHaveLength(20);
  expect(task.chapters?.some((chapter) => chapter.retryable)).toBe(false);
  expect(task.retryable).toBe(true);
  expect(task.resultCount).toBe(60);
  expect(task.results).toHaveLength(20);
  expect(queue.results(id, 0)?.results[0].status).toBe("failed");
  expect(queue.retry(id)).toBe(true);
  await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe("completed"));
  expect(selections).toEqual([undefined, ["1"]]);
  await queue.stop();
});

it("追更默认只展示最近二十条历史，保留所有活动任务", () => {
  const history = Array.from({ length: 60 }, (_, index) =>
    chapterSnapshot(index + 1, "downloaded"),
  );
  const active = chapterSnapshot(0, "reading");
  const queued = chapterSnapshot(61, "queued");
  const tasks = recentShelfTasks([...history, active, queued]);
  expect(tasks).toHaveLength(22);
  expect(tasks.slice(0, 2)).toEqual([active, queued]);
  expect(tasks[2].number).toBe(60);
  expect(tasks.at(-1)?.number).toBe(41);
});
