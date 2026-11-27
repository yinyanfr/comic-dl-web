import type {
  OptionChoice,
  OptionDefinition,
  OptionValues,
} from "comic-dl/extension";
import { z } from "zod";
import type { ComicRuntime } from "./comic-runtime.server";
import { readOptionFields } from "./option-fields.server";
import { reusableWebUrl, sourceId, workInput } from "./source-input.server";

const queryParams = z.object({
  source: sourceId.optional(),
  query: z.string().trim().max(200),
  page: z.coerce.number().int().safe().positive(),
  sort: z.string().max(200).optional(),
});

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
  results?: { title: string; input: string }[];
  hasNext: boolean;
  error?: string;
}

export async function loadCatalog(
  request: Request,
  { withDownloader }: ComicRuntime,
): Promise<CatalogData> {
  const params = new URL(request.url).searchParams;
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
  return withDownloader(async (downloader) => {
    const sources = downloader.sources();
    if (!parsed.success)
      return { ...initial, sources, error: "目录查询参数无效。" };
    const selection = parsed.data;
    const result: CatalogData = { ...initial, sources, ...selection };
    const { source, query, page, sort } = selection;
    if (!source) return result;
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
      result.results = search.results.flatMap(({ title, url }) => {
        const input = workInput.safeParse(url).data;
        if (!input || (URL.canParse(input) && !reusableWebUrl(input)))
          return [];
        return [{ title: title.slice(0, 512) || input, input }];
      });
      result.hasNext = search.hasNext;
      return result;
    } catch (error) {
      const unsupported =
        error instanceof Error &&
        error.message === `Source ${source} does not support search`;
      return {
        ...result,
        error: unsupported
          ? "这个来源不支持目录浏览或搜索，可在首页直接输入作品。"
          : "无法获取目录结果。请检查关键词、筛选条件和来源设置。",
      };
    }
  }, signal).catch(() => ({ ...initial, error: "无法加载漫画来源。" }));
}
