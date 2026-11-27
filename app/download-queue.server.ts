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
}

type RunDownload = (
  signal: AbortSignal,
  record: (result: ChapterResult) => void,
) => Promise<void>;

export class DownloadQueue {
  #tasks = new Map<string, DownloadTask>();
  #pending = new Map<string, RunDownload>();
  #active?: { id: string; controller: AbortController };
  #listeners = new Set<() => void>();

  snapshot(): DownloadTask[] {
    return Array.from(this.#tasks.values(), (task) => ({
      ...task,
      results: [...task.results],
    })).reverse();
  }

  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  submit(source: string, kind: DownloadTask["kind"], run: RunDownload) {
    if (this.#pending.size >= 20) return undefined;
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
    queueMicrotask(() => {
      void this.#drain();
    });
    return id;
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
    if (this.#active) return;
    for (const [id, run] of this.#pending) {
      const task = this.#tasks.get(id)!;
      this.#pending.delete(id);
      const controller = new AbortController();
      this.#active = { id, controller };
      task.status = "running";
      this.#notify();
      try {
        await run(controller.signal, ({ chapterId, status }) => {
          task.results.push({ chapterId, status });
          this.#notify();
        });
        task.status = controller.signal.aborted ? "cancelled" : "completed";
      } catch {
        task.status = controller.signal.aborted ? "cancelled" : "failed";
      } finally {
        this.#active = undefined;
        this.#notify();
      }
    }
  }
}

export const downloadQueue = new DownloadQueue();
