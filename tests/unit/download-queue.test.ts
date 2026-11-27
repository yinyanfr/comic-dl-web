import { describe, expect, it, vi } from "vitest";
import { DownloadQueue } from "../../app/download-queue.server";

describe("手动下载队列", () => {
  it("等待运行中的任务取消并退出后才启动下一个，同时保留已完成的逐章结果", async () => {
    const queue = new DownloadQueue();
    const drain = Promise.withResolvers<void>();
    const started = Promise.withResolvers<AbortSignal>();
    const first = queue.submit("offline", "series", async (signal, record) => {
      record({
        chapterId: "ok",
        status: "downloaded",
        path: "/private/output.cbz",
        attempts: 1,
      });
      record({
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
          results: [],
        },
        {
          id: cancelled,
          source: "offline",
          kind: "chapter",
          status: "cancelled",
          resultCount: 0,
          results: [],
        },
        {
          id: first,
          source: "offline",
          kind: "series",
          status: "cancelled",
          resultCount: 2,
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
