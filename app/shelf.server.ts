import { createDownloader, type ShelfHandle } from "comic-dl";
import { data } from "react-router";
import { z } from "zod";
import {
  fixtureDirectory,
  resolveDownloadInput,
  shelfFile,
  withAppDownloader,
} from "./downloader.server";
import { sourceInput, workInput } from "./source-input.server";

interface ShelfActionData {
  message?: string;
  error?: string;
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

export async function readShelf() {
  return withShelf((shelf) => {
    const statuses = new Map(
      shelf
        .status()
        .map(({ id, lastCheck, lastSuccess, result, pending, complete }) => [
          id,
          { lastCheck, lastSuccess, result, pending, complete },
        ]),
    );
    return shelf.list().map(({ id, sourceId, input, title, following }) => ({
      id,
      sourceId,
      input:
        sourceId === "fixture"
          ? fixtureDirectory === input
            ? "demo"
            : ""
          : (workInput.safeParse(input).data ?? ""),
      title,
      following: Boolean(following),
      status: statuses.get(id),
      attention: shelf.needsAttention(id),
    }));
  });
}

export async function readShelfSources(signal: AbortSignal) {
  let unavailable = false;
  const ids: string[] = await withAppDownloader(
    async (downloader) => downloader.sources(),
    signal,
    () => {
      unavailable = true;
    },
  ).catch(() => {
    unavailable = true;
    return [];
  });
  return { ids, unavailable };
}

const entryAction = z.discriminatedUnion("intent", [
  z.object({
    intent: z.enum(["follow", "pause", "remove", "check", "history"]),
    entryId: z.uuid(),
  }),
  z.object({ intent: z.literal("check-all") }),
  z.object({ intent: z.literal("edit"), entryId: z.uuid(), input: workInput }),
  z.object({
    intent: z.literal("retry"),
    entryId: z.uuid(),
    chapterId: z.string().min(1),
  }),
]);

export async function handleShelfAction(request: Request, notify: () => void) {
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
      await withAppDownloader(
        async (downloader) => {
          const { locator, source } = resolveDownloadInput(
            downloader,
            target.data.input,
            "series",
            target.data.source,
          );
          await withShelf(
            (shelf) => shelf.add(locator, { source, signal }),
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
      await withAppDownloader(
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
      const result = await withAppDownloader(
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
        message: `已检查 ${result.checked} 项，${result.queued} 章入队，${result.failures} 项检查失败。`,
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
