import { createDownloader, type ShelfHandle } from "comic-dl";
import { readLocale, translator } from "./i18n.ts";
import { data } from "react-router";
import { z } from "zod";
import {
  fixtureDirectory,
  resolveDownloadInput,
  shelfFile,
} from "./downloader.server.ts";
import {
  reusableWebUrl,
  sourceInput,
  workInput,
} from "./source-input.server.ts";
import type { ComicRuntime } from "./comic-runtime.server";

interface ShelfActionData {
  message?: string;
  error?: string;
}

function publicInput(sourceId: string, input: string) {
  if (sourceId === "fixture") return fixtureDirectory === input ? "demo" : "";
  if (URL.canParse(input) && !reusableWebUrl(input)) return "";
  return workInput.safeParse(input).data ?? "";
}

export function findShelfWork(
  match: { id: string } | { sourceId: string; workId: string },
) {
  return withShelf((shelf) => {
    const entry = shelf
      .list()
      .find((entry) =>
        "id" in match
          ? entry.id === match.id
          : entry.sourceId === match.sourceId && entry.workId === match.workId,
      );
    if (!entry) return undefined;
    return { ...entry, input: publicInput(entry.sourceId, entry.input) };
  });
}

const respond = data<ShelfActionData>;
const offlineDownloader = createDownloader();

async function withShelf<T>(
  run: (shelf: ShelfHandle) => T | Promise<T>,
  downloader = offlineDownloader,
): Promise<T> {
  const shelf = await downloader.openShelf({ file: shelfFile });
  try {
    return await run(shelf);
  } finally {
    shelf.close();
  }
}

export function readShelfTasks() {
  return withShelf((shelf) => shelf.tasks());
}

export async function readShelf(requestedPage: number) {
  return withShelf((shelf) => {
    const all = shelf.list();
    const pageSize = 25;
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    const page = Math.min(requestedPage, pages);
    const statuses = new Map(
      shelf.status().map((status) => [status.id, status]),
    );
    const entries = all
      .slice((page - 1) * pageSize, page * pageSize)
      .map(
        ({
          id,
          sourceId,
          input,
          title,
          following,
          autoCheck,
          autoDownload,
          intervalSeconds,
        }) => {
          const status = statuses.get(id);
          return {
            id,
            sourceId,
            input: publicInput(sourceId, input),
            title,
            following: Boolean(following),
            autoCheck: Boolean(autoCheck),
            autoDownload: Boolean(autoDownload),
            intervalSeconds,
            chapters: shelf.chapters(id),
            status: status && {
              lastCheck: status.lastCheck,
              lastSuccess: status.lastSuccess,
              result: status.result,
              pending: status.pending,
              complete: status.complete,
              nextCheck: status.nextCheck,
              intervalSeconds: status.intervalSeconds,
              discovered: status.discovered,
            },
            attention:
              status && (status.restricted || status.blocked)
                ? shelf.needsAttention(id)
                : [],
          };
        },
      );
    return {
      entries,
      page,
      pages,
      hasSubscriptions: all.length > 0,
    };
  });
}

export function shelfPage(url: URL) {
  const page = Number(url.searchParams.get("page") ?? 1);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

const entryAction = z.discriminatedUnion("intent", [
  z.object({
    intent: z.enum(["follow", "pause", "remove", "check", "history"]),
    entryId: z.uuid(),
  }),
  z.object({ intent: z.literal("check-all") }),
  z.object({ intent: z.literal("edit"), entryId: z.uuid(), input: workInput }),
  z.object({
    intent: z.enum(["retry", "enqueue", "cancel-chapter"]),
    entryId: z.uuid(),
    chapterId: z.string().min(1),
  }),
  z.object({
    intent: z.literal("configure"),
    entryId: z.uuid(),
    autoCheck: z.enum(["on", "off"]),
    autoDownload: z.enum(["on", "off"]),
    intervalSeconds: z.union([
      z.literal(""),
      z.coerce.number().int().min(1).max(31_536_000),
    ]),
  }),
]);

export async function handleShelfAction(
  request: Request,
  { withDownloader, shelfWatcher: { notify } }: ComicRuntime,
) {
  if (request.headers.get("Sec-Fetch-Site")?.endsWith("-site")) {
    return respond({ error: "请从本页面发起请求。" }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) return respond({ error: "无法读取表单。" }, { status: 400 });

  const intent = form.get("intent");
  const { signal } = request;
  try {
    if (intent === "add") {
      const target = sourceInput.safeParse({
        input: form.get("input"),
        source: form.get("source") || undefined,
      });
      if (!target.success) {
        return respond(
          { error: "请输入 HTTP(S) 链接或短 ID，并确认所选来源。" },
          { status: 400 },
        );
      }
      const title = z
        .string()
        .trim()
        .min(1)
        .max(512)
        .safeParse(form.get("title")).data;
      await withDownloader(
        async (downloader) => {
          const { locator, source } = resolveDownloadInput(
            downloader,
            target.data.input,
            "series",
            target.data.source,
          );
          await withShelf(
            (shelf) => shelf.add(locator, { source, signal, title }),
            downloader,
          );
        },
        signal,
        () => {},
      );
      notify();
      return respond({ message: "作品已在书架中。" });
    }

    const parsed = entryAction.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      return respond({ error: "书架操作参数无效。" }, { status: 400 });
    const operation = parsed.data;

    if (operation.intent === "edit") {
      await withDownloader(
        async (downloader) => {
          await withShelf(async (shelf) => {
            const entry = shelf
              .list()
              .find(({ id }) => id === operation.entryId);
            if (!entry) throw new Error("Missing shelf entry");
            const { locator } = resolveDownloadInput(
              downloader,
              operation.input,
              "series",
              entry.sourceId,
            );
            await shelf.setInput(entry.id, locator, { signal });
          }, downloader);
        },
        signal,
        () => {},
      );
      notify();
      return respond({ message: "已保存作品输入。" });
    }

    if (
      operation.intent === "check" ||
      operation.intent === "check-all" ||
      operation.intent === "history"
    ) {
      const result = await withDownloader(
        (downloader) =>
          withShelf(
            (shelf) =>
              shelf.check({
                signal,
                entryId:
                  operation.intent === "check-all"
                    ? undefined
                    : operation.entryId,
                includeHistory: operation.intent === "history",
                onCheck: notify,
              }),
            downloader,
          ),
        signal,
        () => {},
      );
      return respond({
        message: translator(readLocale(request.headers.get("cookie")))(
          "已检查 {checked} 项，{queued} 章入队，{failures} 项检查失败。",
          {
            checked: result.checked,
            queued: result.queued,
            failures: result.failures,
          },
        ),
      });
    }

    const changed = await withShelf((shelf) => {
      switch (operation.intent) {
        case "follow":
          shelf.follow(operation.entryId);
          return true;
        case "pause":
          shelf.unfollow(operation.entryId);
          return true;
        case "remove":
          shelf.remove(operation.entryId);
          return true;
        case "retry":
          return shelf.retry(operation.entryId, operation.chapterId);
        case "enqueue":
          return shelf.enqueue(operation.entryId, operation.chapterId);
        case "cancel-chapter":
          return shelf.cancel(operation.entryId, operation.chapterId);
        case "configure":
          shelf.configure(operation.entryId, {
            autoCheck: operation.autoCheck === "on",
            autoDownload: operation.autoDownload === "on",
            intervalSeconds:
              operation.intervalSeconds === ""
                ? null
                : operation.intervalSeconds,
          });
          return true;
      }
    });
    if (!changed)
      return respond(
        { error: "章节已更新，或当前作品未订阅。" },
        { status: 409 },
      );
    notify();
    return respond({
      message:
        operation.intent === "retry" ? "章节已重新入队。" : "书架已更新。",
    });
  } catch {
    const error =
      intent === "edit"
        ? "无法修改作品输入。请确认来源可用，且新输入指向同一作品。"
        : intent === "add"
          ? "无法收藏作品。请检查作品输入、来源和书架配置。"
          : "无法完成书架操作。请检查条目、订阅状态和服务端配置。";
    return respond({ error }, { status: 422 });
  }
}
