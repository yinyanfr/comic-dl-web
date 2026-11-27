import { randomUUID } from "node:crypto";
import type { ChapterResult } from "comic-dl";

type TaskStatus =
  "queued" | "running" | "cancelling" | "cancelled" | "completed" | "failed";
type PublicChapterResult = Pick<ChapterResult, "chapterId" | "status">;

export interface DownloadTask {
  id: string;
  source: string;
  kind: "series" | "chapter";
  status: TaskStatus;
  results: PublicChapterResult[];
  failure?: "invalid-selection";
}

export type DownloadTaskSnapshot = DownloadTask & { resultCount: number };

type RunDownload = (
  signal: AbortSignal,
  record: (result: ChapterResult) => void,
) => Promise<void | "invalid-selection">;

export class DownloadQueue {
  #tasks = new Map<string, DownloadTask>();
  #pending = new Map<string, RunDownload>();
  #active?: { id: string; controller: AbortController };
  #listeners = new Set<() => void>();
  #draining?: Promise<void>;
  #closed = false;

  snapshot(): DownloadTaskSnapshot[] {
    return Array.from(this.#tasks.values(), (task) => ({
      ...task,
      resultCount: task.results.length,
      results: task.results.slice(-20),
    })).reverse();
  }

  results(id: string, offset: number) {
    const task = this.#tasks.get(id);
    if (!task) return undefined;
    return {
      id,
      offset,
      results: task.results.slice(offset, offset + 20),
      total: task.results.length,
    };
  }

  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  submit(source: string, kind: DownloadTask["kind"], run: RunDownload) {
    if (this.#closed || this.#pending.size >= 20) return undefined;
    if (this.#tasks.size >= 100) {
      for (const [id, task] of this.#tasks) {
        if (
          task.status === "completed" ||
          task.status === "failed" ||
          task.status === "cancelled"
        ) {
          this.#tasks.delete(id);
          break;
        }
      }
    }
    const id = randomUUID();
    this.#tasks.set(id, { id, source, kind, status: "queued", results: [] });
    this.#pending.set(id, run);
    this.#notify();
    this.#schedule();
    return id;
  }

  #schedule() {
    if (this.#closed || this.#draining) return;
    this.#draining = Promise.resolve()
      .then(() => this.#drain())
      .finally(() => {
        this.#draining = undefined;
        if (this.#pending.size) this.#schedule();
      });
  }

  async stop() {
    this.#closed = true;
    for (const id of this.#pending.keys()) this.cancel(id);
    if (this.#active) this.cancel(this.#active.id);
    await this.#draining;
  }

  cancel(id: string) {
    const task = this.#tasks.get(id);
    if (task?.status === "queued") {
      this.#pending.delete(id);
      task.status = "cancelled";
    } else if (task?.status === "running" && this.#active?.id === id) {
      task.status = "cancelling";
      this.#active.controller.abort();
    } else {
      return false;
    }
    this.#notify();
    return true;
  }

  #notify() {
    for (const listener of this.#listeners) listener();
  }

  async #drain() {
    for (const [id, run] of this.#pending) {
      const task = this.#tasks.get(id)!;
      this.#pending.delete(id);
      const controller = new AbortController();
      this.#active = { id, controller };
      task.status = "running";
      this.#notify();
      try {
        const failure = await run(
          controller.signal,
          ({ chapterId, status }) => {
            task.results.push({ chapterId, status });
            this.#notify();
          },
        );
        if (controller.signal.aborted) {
          task.status = "cancelled";
        } else if (failure) {
          task.failure = failure;
          task.status = "failed";
        } else {
          task.status = "completed";
        }
      } catch {
        task.status = controller.signal.aborted ? "cancelled" : "failed";
      } finally {
        this.#active = undefined;
        this.#notify();
      }
    }
  }
}
