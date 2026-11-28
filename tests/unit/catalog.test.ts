import { createDownloader } from "comic-dl";
import type { ChapterSource } from "comic-dl/extension";
import { expect, test } from "vitest";
import { loadCatalog } from "../../app/catalog.server";

test("聚合搜索保留可用来源的结果，并独立标注未配置和失败的来源", async () => {
  const downloader = createDownloader();
  function register(id: string, search: NonNullable<ChapterSource["search"]>) {
    downloader.use({
      apiVersion: 1,
      id,
      create: () => ({
        id,
        search,
        getSeries: async () => ({ id: "demo", chapters: [] }),
        getChapter: async () => {
          throw new Error("No chapters");
        },
      }),
    });
  }
  register("public-source", async (query) => ({
    results: [
      { title: query, url: "demo", coverUrl: "https://example.com/cover.png" },
      {
        title: "无需公开凭证",
        url: "other",
        coverUrl: "https://example.com/cover.png?token=private",
      },
    ],
    hasNext: true,
  }));
  register("broken-source", async () => {
    throw new Error("Unexpected response");
  });
  register("komga", async () => {
    throw new Error("Should be skipped");
  });
  register("kavita", async () => {
    throw new Error("Should be skipped");
  });
  const url = new URL("http://localhost/catalog?q=漫画");
  const result = await loadCatalog(url, new Request(url), {
    inspect: (run) => run(downloader, { settings: {}, credentials: {} }),
    usesBundledSource: () => true,
  });
  expect(result.groups).toEqual(
    expect.arrayContaining([
      {
        source: "public-source",
        hasNext: true,
        results: [
          {
            title: "漫画",
            input: "demo",
            coverUrl: "https://example.com/cover.png",
          },
          {
            title: "无需公开凭证",
            input: "other",
            coverUrl: "/covers?source=public-source&input=other",
          },
        ],
      },
      { source: "broken-source", issue: "unavailable" },
      { source: "komga", issue: "unconfigured" },
      { source: "kavita", issue: "unconfigured" },
    ]),
  );
});
