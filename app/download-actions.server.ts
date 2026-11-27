import { createHash } from "node:crypto";
import { createDownloader } from "comic-dl";
import { extensionApiVersion, type Series } from "comic-dl/extension";
import { data } from "react-router";
import { z } from "zod";
import type { ComicRuntime } from "./comic-runtime.server";
import {
  isOutputReady,
  resolveDownloadInput,
  watchOptions,
} from "./downloader.server";
import { sourceInput } from "./source-input.server";

interface DownloadActionData {
  error?: string;
  series?: {
    source: string;
    catalog: string;
    chapters: { id: string; title: string }[];
  };
  taskId?: string;
}

const respond = data<DownloadActionData>;

const chapterSelection = z
  .object({
    catalog: z.string().regex(/^[a-f0-9]{64}$/),
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

function catalogVersion(series: Series, input: string, source: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        source,
        input,
        series.id,
        series.chapters.map(({ id }) => id),
      ]),
    )
    .digest("hex");
}

function selectChapters(
  series: Series,
  input: string,
  source: string,
  selection: z.infer<typeof chapterSelection>,
) {
  if (catalogVersion(series, input, source) !== selection.catalog) return;
  const ids = new Set(selection.chapters);
  if (selection.range) {
    const [first, last] = selection.range.split("-").map(Number);
    if (first < 1 || first > last || last > series.chapters.length) return;
    for (const chapter of series.chapters.slice(first - 1, last))
      ids.add(chapter.id);
  }
  const chapters = series.chapters.filter(({ id }) => ids.has(id));
  if (!chapters.length || chapters.length !== ids.size) return;
  return { ...series, chapters };
}

export async function handleDownloadAction(
  request: Request,
  { withDownloader, downloadQueue }: ComicRuntime,
) {
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
  let selections: z.infer<typeof chapterSelection> | undefined;
  if (intent === "series") {
    const rangeInput = form.get("range");
    const selection = chapterSelection.safeParse({
      chapters: form.getAll("chapterId"),
      catalog: form.get("catalog"),
      range:
        typeof rangeInput === "string" ? rangeInput.trim() : (rangeInput ?? ""),
    });
    if (!selection.success) {
      return respond(
        { error: "请选择章节，或填写形如 2-4 的范围。" },
        { status: 400 },
      );
    }
    selections = selection.data;
  }

  if (intent === "list") {
    try {
      const series = await withDownloader(async (downloader) => {
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
          catalog: catalogVersion(result, input, source),
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
    source = await withDownloader(
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
    withDownloader(async (downloader) => {
      const { locator } = resolveDownloadInput(downloader, input, kind, source);
      if (!(await isOutputReady()))
        throw new Error("Output marker unavailable");
      const options = { source, signal, onResult };
      if (!selections) {
        await downloader.downloadChapter(locator, options);
        return;
      }
      const current = await downloader.list(locator, options);
      const selected = selectChapters(current, input, source, selections);
      if (!selected) return "invalid-selection";
      // Give the public core API the exact catalog we validated, so it cannot
      // re-read a changing source or interpret a missing chapter ID as a range.
      const snapshot = createDownloader({ output: watchOptions.directory }).use(
        {
          apiVersion: extensionApiVersion,
          id: source,
          create: () => ({
            id: source,
            getSeries: async () => selected,
            getChapter: async () => {
              throw new Error("Only the selected series is available");
            },
          }),
        },
      );
      await snapshot.download(locator, options);
    }, signal),
  );
  if (!taskId) {
    return respond({ error: "下载队列已满，请稍后重试。" }, { status: 429 });
  }
  return respond({ taskId }, { status: 202 });
}
