import { data } from "react-router";
import { z } from "zod";
import { downloadQueue } from "./download-queue.server";
import {
  isOutputReady,
  resolveDownloadInput,
  withAppDownloader,
} from "./downloader.server";
import { sourceInput } from "./source-input.server";

interface DownloadActionData {
  error?: string;
  series?: { source: string; chapters: { id: string; title: string }[] };
  taskId?: string;
}

const respond = data<DownloadActionData>;

const chapterSelection = z
  .object({
    chapters: z.array(z.string().min(1).max(4096)).max(10_000),
    range: z.union([
      z.literal(""),
      z
        .string()
        .max(41)
        .regex(/^[0-9]+-[0-9]+$/),
    ]),
  })
  .refine(({ chapters, range }) => chapters.length > 0 || range.length > 0);

export async function handleDownloadAction(request: Request) {
  if (request.headers.get("Sec-Fetch-Site")?.endsWith("-site")) {
    return respond({ error: "请从本页面发起请求。" }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) return respond({ error: "无法读取表单。" }, { status: 400 });

  const intent = form.get("intent");
  if (intent === "cancel") {
    const id = z.uuid().safeParse(form.get("taskId"));
    if (!id.success || !downloadQueue.cancel(id.data)) {
      return respond({ error: "这个任务已结束或无法取消。" }, { status: 409 });
    }
    return respond({});
  }
  if (intent !== "list" && intent !== "series" && intent !== "chapter") {
    return respond({ error: "无法识别请求的操作。" }, { status: 400 });
  }

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
  const { input, source: explicitSource } = target.data;
  const kind = intent === "chapter" ? "chapter" : "series";
  let selections: string[] = [];
  if (intent === "series") {
    const rangeInput = form.get("range");
    const selection = chapterSelection.safeParse({
      chapters: form.getAll("chapterId"),
      range:
        typeof rangeInput === "string" ? rangeInput.trim() : (rangeInput ?? ""),
    });
    if (!selection.success) {
      return respond(
        { error: "请选择章节，或填写形如 2-4 的范围。" },
        { status: 400 },
      );
    }
    const { chapters, range } = selection.data;
    selections = range ? [...chapters, range] : chapters;
  }

  if (intent === "list") {
    try {
      const series = await withAppDownloader(async (downloader) => {
        const { locator, source } = resolveDownloadInput(
          downloader,
          input,
          kind,
          explicitSource,
        );
        const result = await downloader.list(locator, {
          source,
          signal: request.signal,
        });
        return {
          source,
          chapters: result.chapters.map(({ id, title }) => ({ id, title })),
        };
      }, request.signal);
      return respond({ series });
    } catch {
      return respond(
        { error: "无法获取章节。请检查链接、来源或服务端的来源配置。" },
        { status: 422 },
      );
    }
  }

  let source: string;
  try {
    source = await withAppDownloader(
      async (downloader) =>
        resolveDownloadInput(downloader, input, kind, explicitSource).source,
      request.signal,
    );
  } catch {
    return respond(
      { error: "无法确定来源。请检查输入或手动选择来源。" },
      { status: 422 },
    );
  }
  if (!(await isOutputReady())) {
    return respond(
      { error: "漫画输出目录的挂载标记不可用，请恢复挂载后再提交。" },
      { status: 503 },
    );
  }
  const taskId = downloadQueue.submit(source, kind, (signal, onResult) =>
    withAppDownloader(async (downloader) => {
      const { locator } = resolveDownloadInput(downloader, input, kind, source);
      if (!(await isOutputReady()))
        throw new Error("Output marker unavailable");
      const options = { source, signal, onResult };
      if (kind === "chapter")
        await downloader.downloadChapter(locator, options);
      else
        await downloader.download(locator, {
          ...options,
          chapters: selections,
        });
    }, signal),
  );
  if (!taskId) {
    return respond({ error: "下载队列已满，请稍后重试。" }, { status: 429 });
  }
  return respond({ taskId }, { status: 202 });
}
