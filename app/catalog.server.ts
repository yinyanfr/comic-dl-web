import type {
  OptionChoice,
  OptionDefinition,
  OptionValues,
  SearchPage,
} from "comic-dl/extension";
import { z } from "zod";
import type { ComicRuntime } from "./comic-runtime.server";
import { readOptionFields } from "./option-fields.server";
import { reusableWebUrl, sourceId, workInput } from "./source-input.server";
import {
  hasSourceCredential,
  normalizeCredentialTarget,
} from "./source-credentials.server";

const queryParams = z.object({
  source: sourceId.optional(),
  query: z.string().trim().max(200),
  page: z.coerce.number().int().positive(),
  sort: z.string().max(200).optional(),
});

export type CatalogWork = { title: string; input: string; coverUrl?: string };

type SourceResults = {
  source: string;
  results?: CatalogWork[];
  hasNext?: boolean;
  issue?: "unconfigured" | "unavailable";
};

interface CatalogData {
  sources: string[];
  source?: string;
  query: string;
  page: number;
  sort?: string;
  filters: OptionValues;
  options?: {
    sorts: readonly OptionChoice[];
    filters: Record<string, OptionDefinition>;
  };
  results?: CatalogWork[];
  groups?: SourceResults[];
  hasNext: boolean;
  error?: string;
}

function publicWorks(search: SearchPage, source: string) {
  return search.results.flatMap((work): CatalogWork[] => {
    const input = workInput.safeParse(work.url).data;
    if (!input || (URL.canParse(input) && !reusableWebUrl(input))) return [];
    // Cover metadata is optional for independently published source extensions.
    const cover = work.coverUrl;
    const coverUrl =
      typeof cover === "string" && cover.length <= 4096 && reusableWebUrl(cover)
        ? cover
        : undefined;
    return [
      {
        title: work.title.slice(0, 512) || input,
        input,
        coverUrl:
          work.coverId && work.coverId.length <= 4096
            ? `/covers?${new URLSearchParams({ source, id: work.coverId })}`
            : (coverUrl ?? `/covers?${new URLSearchParams({ source, input })}`),
      },
    ];
  });
}

export async function loadCatalog(
  url: URL,
  request: Request,
  {
    inspect,
    usesBundledSource,
  }: Pick<ComicRuntime, "inspect" | "usesBundledSource">,
): Promise<CatalogData> {
  const params = url.searchParams;
  const parsed = queryParams.safeParse({
    source: params.get("source") || undefined,
    query: params.get("q") ?? "",
    page: params.get("page") ?? 1,
    sort: params.get("sort") || undefined,
  });
  const initial = {
    sources: [],
    query: "",
    page: 1,
    filters: {},
    hasNext: false,
  };
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  return inspect(async (downloader, { credentials }) => {
    const sources = downloader.sources();
    if (!parsed.success)
      return { ...initial, sources, error: "目录查询参数无效。" };
    const selection = parsed.data;
    const result: CatalogData = { ...initial, sources, ...selection };
    const { source, query, page, sort } = selection;
    if (!source) {
      if (!query) return result;
      result.groups = await Promise.all(
        sources.map(async (id): Promise<SourceResults> => {
          try {
            if (
              (id === "komga" || id === "kavita") &&
              usesBundledSource(downloader, id)
            ) {
              const settings = downloader.validateSourceSettings(id);
              const target = normalizeCredentialTarget(
                id,
                settings["server-url"],
              );
              if (!target || !hasSourceCredential(id, credentials, target))
                return { source: id, issue: "unconfigured" };
            }
            const search = await downloader.search(query, {
              source: id,
              page: 1,
              signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
            });
            return {
              source: id,
              results: publicWorks(search, id),
              hasNext: search.hasNext,
            };
          } catch {
            return { source: id, issue: "unavailable" };
          }
        }),
      );
      return result;
    }
    if (!sources.includes(source))
      return { ...result, error: "所选漫画源当前不可用。" };
    try {
      const { sorts, filters } = await downloader.catalogOptions(
        source,
        query,
        signal,
      );
      result.options = {
        sorts,
        filters: Object.fromEntries(
          Object.entries(filters).flatMap(([key, field]) =>
            field.type === "dynamic-select" ? [] : [[key, field]],
          ),
        ),
      };
    } catch {
      return {
        ...result,
        error: "无法读取目录选项。请检查来源设置和访问权限。",
      };
    }
    try {
      result.filters = readOptionFields(result.options.filters, params);
      const search = await downloader.search(query, {
        source,
        page,
        sort,
        filters: result.filters,
        signal,
      });
      result.results = publicWorks(search, source);
      result.hasNext = search.hasNext;
      return result;
    } catch (error) {
      const unsupported =
        error instanceof Error &&
        error.message === `Source ${source} does not support search`;
      return {
        ...result,
        error: unsupported
          ? "这个来源不支持目录浏览或搜索，可通过手动下载输入作品。"
          : "无法获取目录结果。请检查关键词、筛选条件和来源设置。",
      };
    }
  }, signal).catch(() => ({ ...initial, error: "无法加载漫画来源。" }));
}
