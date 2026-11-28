import { createHash, randomUUID } from "node:crypto";
import { createDownloader } from "comic-dl";
import { extensionApiVersion, type Series } from "comic-dl/extension";
import { data } from "react-router";
import { z } from "zod";
import type { ComicRuntime } from "./comic-runtime.server";
import { readLocale, translator } from "./i18n.ts";
import {
  outputReady,
  downloadOptions,
  resolveDownloadInput,
  type WithDownloader,
} from "./downloader.server";
import { reusableWebUrl, sourceInput } from "./source-input.server";
import { findShelfWork } from "./shelf.server";

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
const workMetadata = z.object({
  title: z.string().trim().min(1).max(512).optional().catch(undefined),
  authors: z
    .array(z.string().trim().min(1).max(128))
    .max(30)
    .optional()
    .catch(undefined),
  summary: z.string().trim().min(1).max(10_000).optional().catch(undefined),
  tags: z
    .array(z.string().trim().min(1).max(128))
    .max(50)
    .optional()
    .catch(undefined),
  coverUrl: z
    .string()
    .max(4096)
    .refine(reusableWebUrl)
    .optional()
    .catch(undefined),
  coverId: z.string().min(1).max(4096).optional().catch(undefined),
});

function readWorkMetadata(series: Series, source: string) {
  const metadata = workMetadata.safeParse(series.metadata).data;
  if (!metadata) return;
  return {
    ...metadata,
    coverId: undefined,
    coverUrl: metadata.coverId
      ? `/covers?${new URLSearchParams({ source, id: metadata.coverId })}`
      : metadata.coverUrl,
  };
}

const chapterSelection = z
  .object({
    catalog: z.string().regex(/^[a-f0-9]{64}$/),
    all: z.boolean(),
    chapters: z.array(z.string().min(1).max(4096)).max(10_000),
    range: z.union([
      z.literal(""),
      z
        .string()
        .max(41)
        .regex(/^[0-9]+-[0-9]+$/),
    ]),
  })
  .refine(
    ({ chapters, range, all }) =>
      all || chapters.length > 0 || range.length > 0,
  );

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
  if (selection.all) return series.chapters.length ? series : undefined;
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

export function readWork(
  withDownloader: WithDownloader,
  input: string,
  explicitSource: string | undefined,
  requestSignal: AbortSignal,
) {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(30_000)]);
  return withDownloader(async (downloader) => {
    const { locator, source } = resolveDownloadInput(
      downloader,
      input,
      "series",
      explicitSource,
    );
    const result = await downloader.list(locator, { source, signal });
    return {
      workId: result.id,
      metadata: readWorkMetadata(result, source),
      series: {
        source,
        catalog: catalogVersion(result, input, source),
        chapters: result.chapters.map(({ id, title }) => ({ id, title })),
      },
    };
  }, signal);
}

export async function handleDownloadAction(
  request: Request,
  { withDownloader, downloadQueue, library, clearFinished }: ComicRuntime,
) {
  if (request.headers.get("Sec-Fetch-Site")?.endsWith("-site")) {
    return respond({ error: "请从本页面发起请求。" }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) return respond({ error: "无法读取表单。" }, { status: 400 });

  const intent = form.get("intent");
  if (intent === "clear-finished") {
    await clearFinished();
    return respond({});
  }
  if (intent === "cancel" || intent === "retry-task") {
    const id = z.uuid().safeParse(form.get("taskId"));
    if (
      !id.success ||
      !(intent === "cancel"
        ? downloadQueue.cancel(id.data)
        : downloadQueue.retry(id.data))
    ) {
      return respond({ error: "这个任务已结束或无法取消。" }, { status: 409 });
    }
    return respond({});
  }
  if (
    intent !== "list" &&
    intent !== "series" &&
    intent !== "missing" &&
    intent !== "chapter"
  ) {
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
  if (intent === "series" || intent === "missing") {
    const rangeInput = form.get("range");
    const selection = chapterSelection.safeParse({
      chapters: intent === "missing" ? [] : form.getAll("chapterId"),
      all: intent === "missing",
      catalog: form.get("catalog"),
      range:
        intent === "missing"
          ? ""
          : typeof rangeInput === "string"
            ? rangeInput.trim()
            : (rangeInput ?? ""),
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
      const { series } = await readWork(
        withDownloader,
        input,
        explicitSource,
        request.signal,
      );
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
  if (!(await outputReady(library()))) {
    return respond(
      { error: "漫画输出目录或挂载标记不可用，请恢复后再提交。" },
      { status: 503 },
    );
  }
  const title = z
    .string()
    .trim()
    .min(1)
    .max(512)
    .safeParse(form.get("title")).data;
  const taskScope = randomUUID();
  const taskId = downloadQueue.submit(
    source,
    kind,
    (signal, _onResult, describe, onEvent, retryIds) =>
      withDownloader(async (downloader) => {
        const { locator } = resolveDownloadInput(
          downloader,
          input,
          kind,
          source,
        );
        const settings = library();
        if (!(await outputReady(settings)))
          throw new Error("Output marker unavailable");
        const options = {
          source,
          signal,
          onEvent,
          ...(await downloadOptions(settings)),
          taskScope,
        };
        if (!selections) {
          const task = downloader.startDownload(locator, {
            ...options,
            direct: true,
          });
          await task.done;
          return;
        }
        const current = await downloader.list(locator, options);
        const selected = selectChapters(current, input, source, selections);
        if (!selected) return "invalid-selection";
        const saved = await findShelfWork({
          sourceId: source,
          workId: current.id,
        }).catch(() => undefined);
        const ids = new Set(selected.chapters.map(({ id }) => id));
        describe(
          {
            id: current.id,
            title:
              saved?.title ??
              readWorkMetadata(current, source)?.title ??
              title ??
              (!URL.canParse(input) ? input.slice(0, 128) : undefined) ??
              translator(readLocale(request.headers.get("cookie")))(
                "作品 · {source}",
                { source },
              ),
          },
          current.chapters.flatMap(({ id, title }, index) =>
            ids.has(id) ? [{ id, title, number: index + 1 }] : [],
          ),
        );
        // Give the public core API the exact catalog we validated, so it cannot
        // re-read a changing source or interpret a missing chapter ID as a range.
        const snapshot = createDownloader().use({
          apiVersion: extensionApiVersion,
          id: source,
          create: () => ({
            id: source,
            getSeries: async () => ({
              ...current,
              metadata: {
                ...current.metadata,
                title:
                  saved?.title ??
                  current.metadata?.title ??
                  title ??
                  current.id,
              },
            }),
            getChapter: async () => {
              throw new Error("Only the selected series is available");
            },
          }),
        });
        const selectedIds = new Set(
          retryIds ?? selected.chapters.map(({ id }) => id),
        );
        const chapters = current.chapters.flatMap((chapter) =>
          selectedIds.has(chapter.id) ? [chapter.id] : [],
        );
        if (!chapters.length) return "invalid-selection";
        const task = snapshot.startDownload(locator, { ...options, chapters });
        await task.done;
      }, signal),
  );
  if (!taskId) {
    return respond({ error: "下载队列已满，请稍后重试。" }, { status: 429 });
  }
  return respond({ taskId }, { status: 202 });
}
