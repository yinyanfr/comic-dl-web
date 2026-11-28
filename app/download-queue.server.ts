import { randomUUID } from "node:crypto";
import type {
  ChapterResult,
  DownloadEvent,
  DownloadTaskSnapshot as CoreTask,
} from "comic-dl";

type TaskStatus =
  "queued" | "running" | "cancelling" | "cancelled" | "completed" | "failed";
type ChapterLabel = { id: string; title: string; number: number };
type TaskWork = { id: string; title: string };
type PublicChapterResult = Pick<ChapterResult, "chapterId" | "status"> & {
  title?: string;
  number?: number;
};

export interface DownloadTask {
  id: string;
  source: string;
  kind: "series" | "chapter";
  status: TaskStatus;
  results: PublicChapterResult[];
  work?: TaskWork;
  chapterCount?: number;
  remaining?: ChapterLabel[];
  failure?: "invalid-selection";
  chapters?: CoreTask[];
  origin?: "manual" | "shelf";
  entryId?: string;
}

export type DownloadTaskSnapshot = DownloadTask & {
  resultCount: number;
  retryable?: boolean;
};

const finishedChapterStates = new Set([
  "downloaded",
  "skipped",
  "failed",
  "restricted",
  "cancelled",
]);

export function recentShelfTasks(chapters: CoreTask[]): CoreTask[] {
  const active = chapters.filter(
    (chapter) => !finishedChapterStates.has(chapter.state),
  );
  const finished = chapters
    .filter((chapter) => finishedChapterStates.has(chapter.state))
    .sort((a, b) => (b.readyAt ?? 0) - (a.readyAt ?? 0))
    .slice(0, 20);
  return [...active, ...finished];
}

function visibleChapters(chapters: CoreTask[] | undefined) {
  if (!chapters) return undefined;
  return [
    ...chapters.filter((chapter) =>
      ["starting", "reading", "archiving"].includes(chapter.state),
    ),
    ...chapters
      .filter((chapter) => ["queued", "retry"].includes(chapter.state))
      .slice(0, 10),
    ...chapters
      .filter((chapter) => finishedChapterStates.has(chapter.state))
      .slice(-20),
  ];
}

export function shelfDownloadTasks(
  chapters: CoreTask[],
): DownloadTaskSnapshot[] {
  return chapters.map((chapter) => {
    const result = ["downloaded", "skipped", "failed", "restricted"].includes(
      chapter.state,
    )
      ? [
          {
            chapterId: chapter.chapterId,
            title: chapter.chapterTitle,
            number: chapter.number,
            status: chapter.state as PublicChapterResult["status"],
          },
        ]
      : [];
    return {
      id: chapter.id,
      source: chapter.sourceId,
      kind: "chapter",
      origin: "shelf",
      entryId: chapter.entryId,
      work: { id: chapter.workId, title: chapter.workTitle },
      status:
        chapter.state === "cancelled"
          ? "cancelled"
          : ["failed", "restricted"].includes(chapter.state)
            ? "failed"
            : ["downloaded", "skipped"].includes(chapter.state)
              ? "completed"
              : ["queued", "retry"].includes(chapter.state)
                ? "queued"
                : "running",
      results: result,
      resultCount: result.length,
      chapterCount: 1,
      chapters: [chapter],
    };
  });
}

type RunDownload = (
  signal: AbortSignal,
  record: (result: ChapterResult) => void,
  describe: (work: TaskWork, chapters: ChapterLabel[]) => void,
  event: (event: DownloadEvent) => void,
  retryIds?: string[],
) => Promise<void | "invalid-selection">;

export class DownloadQueue {
  #tasks = new Map<string, DownloadTask>();
  #pending = new Map<string, RunDownload>();
  #active?: { id: string; controller: AbortController };
  #listeners = new Set<() => void>();
  #draining?: Promise<void>;
  #closed = false;
  #runs = new Map<string, RunDownload>();
  #retryIds = new Map<string, string[]>();
  #blocked = false;

  get busy() {
    return Boolean(this.#active || this.#pending.size);
  }
  block(value: boolean) {
    this.#blocked = value;
  }

  snapshot(): DownloadTaskSnapshot[] {
    return Array.from(this.#tasks.values(), (task) => ({
      ...task,
      chapters: visibleChapters(task.chapters),
      retryable:
        ["failed", "cancelled"].includes(task.status) &&
        (!task.chapters?.length ||
          task.chapters.some((chapter) => chapter.retryable)),
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

  clearFinished() {
    for (const [id, task] of this.#tasks) {
      if (
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled"
      )
        this.#tasks.delete(id);
      if (!this.#tasks.has(id)) this.#runs.delete(id);
      if (!this.#tasks.has(id)) this.#retryIds.delete(id);
    }
    this.#notify();
  }

  submit(source: string, kind: DownloadTask["kind"], run: RunDownload) {
    if (this.#closed || this.#blocked || this.#pending.size >= 20)
      return undefined;
    if (this.#tasks.size >= 100) {
      for (const [id, task] of this.#tasks) {
        if (
          task.status === "completed" ||
          task.status === "failed" ||
          task.status === "cancelled"
        ) {
          this.#tasks.delete(id);
          this.#runs.delete(id);
          this.#retryIds.delete(id);
          break;
        }
      }
    }
    const id = randomUUID();
    this.#tasks.set(id, { id, source, kind, status: "queued", results: [] });
    this.#pending.set(id, run);
    this.#runs.set(id, run);
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

  retry(id: string) {
    const task = this.#tasks.get(id);
    const run = this.#runs.get(id);
    if (
      this.#closed ||
      this.#blocked ||
      this.#pending.size >= 20 ||
      !task ||
      !run ||
      !["completed", "failed", "cancelled"].includes(task.status)
    )
      return false;
    const ids = task.chapters
      ?.filter((chapter) => chapter.retryable)
      .map((chapter) => chapter.chapterId);
    if (task.chapters?.length && !ids?.length) return false;
    if (ids?.length) this.#retryIds.set(id, ids);
    task.status = "queued";
    this.#pending.set(id, run);
    this.#notify();
    this.#schedule();
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
      delete task.failure;
      this.#notify();
      try {
        const attempts = new Map(
          task.chapters?.map((chapter) => [chapter.chapterId, chapter.attempt]),
        );
        let labels = new Map<string, ChapterLabel>();
        const failure = await run(
          controller.signal,
          ({ chapterId, status }) => {
            const label = labels.get(chapterId);
            task.results.push({
              chapterId,
              status,
              title: label?.title,
              number: label?.number,
            });
            labels.delete(chapterId);
            if (task.remaining?.some(({ id }) => id === chapterId)) {
              const next: ChapterLabel[] = [];
              for (const chapter of labels.values()) {
                next.push(chapter);
                if (next.length === 10) break;
              }
              task.remaining = next;
            }
            this.#notify();
          },
          (work, chapters) => {
            task.work = work;
            task.chapterCount = chapters.length;
            labels = new Map(chapters.map((chapter) => [chapter.id, chapter]));
            task.remaining = chapters.slice(0, 10);
            this.#notify();
          },
          ({ task: chapter }) => {
            chapter = {
              ...chapter,
              attempt: chapter.attempt + (attempts.get(chapter.chapterId) ?? 0),
            };
            task.chapters ??= [];
            const index = task.chapters.findIndex(
              (item) => item.chapterId === chapter.chapterId,
            );
            if (index < 0) task.chapters.push(chapter);
            else task.chapters[index] = chapter;
            task.work = { id: chapter.workId, title: chapter.workTitle };
            task.chapterCount = Math.max(
              task.chapterCount ?? 0,
              task.chapters.length,
            );
            task.remaining = task.chapters
              .filter((item) =>
                [
                  "queued",
                  "retry",
                  "starting",
                  "reading",
                  "archiving",
                ].includes(item.state),
              )
              .slice(0, 10)
              .map((item) => ({
                id: item.chapterId,
                title: item.chapterTitle,
                number: item.number ?? 0,
              }));
            const results: PublicChapterResult[] = [];
            for (const item of task.chapters) {
              if (
                ["downloaded", "skipped", "failed", "restricted"].includes(
                  item.state,
                )
              )
                results.push({
                  chapterId: item.chapterId,
                  title: item.chapterTitle,
                  number: item.number,
                  status: item.state as PublicChapterResult["status"],
                });
            }
            task.results = results;
            this.#notify();
          },
          this.#retryIds.get(id),
        );
        this.#retryIds.delete(id);
        if (controller.signal.aborted) {
          task.status = "cancelled";
        } else if (failure) {
          task.failure = failure;
          task.status = "failed";
        } else {
          task.status = task.chapters?.some((chapter) =>
            ["failed", "restricted"].includes(chapter.state),
          )
            ? "failed"
            : "completed";
        }
      } catch {
        task.status = controller.signal.aborted ? "cancelled" : "failed";
      } finally {
        this.#retryIds.delete(id);
        delete task.remaining;
        this.#active = undefined;
        this.#notify();
      }
    }
  }
}
