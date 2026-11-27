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
          results: [],
        },
        {
          id: cancelled,
          source: "offline",
          kind: "chapter",
          status: "cancelled",
          results: [],
        },
        {
          id: first,
          source: "offline",
          kind: "series",
          status: "cancelled",
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
});
