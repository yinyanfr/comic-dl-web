import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
const id = "catalog-test";
const chapter = (id) => ({
  id,
  title: id,
  async getPages() {
    return [
      {
        id: "blue",
        extension: "png",
        read: (signal) =>
          readFile(new URL("./blue.png", import.meta.url), { signal }),
      },
    ];
  },
});

export default {
  id,
  apiVersion: 1,
  settings: {
    layout: {
      type: "select",
      label: "展示样式",
      default: "default",
      choices: [
        { id: "default", label: "默认样式" },
        { id: "compact", label: "紧凑样式" },
      ],
    },
    label: { type: "text", label: "显示标签", env: "COMIC_TEST_LABEL" },
  },
  catalog: {
    browse: {
      sorts: [{ id: "new", label: "最新" }],
      filters: { group: { type: "dynamic-select", label: "分组" } },
    },
    search: {
      filters: { group: { type: "dynamic-select", label: "分组" } },
    },
  },
  create(_api, settings) {
    return {
      id,
      async catalogChoices(_filter, mode) {
        return mode === "browse"
          ? [{ id: "popular", label: "热门组" }]
          : [{ id: "matched", label: "匹配组" }];
      },
      async search(query, page, _signal, { sort, filters } = {}) {
        return {
          hasNext: page === 1,
          results: [
            {
              title: [
                version,
                settings.layout,
                query || "browse",
                sort || "default",
                filters?.group || "all",
                page,
              ].join(" "),
              url: `https://catalog.example/demo?group=${filters?.group || "all"}`,
            },
            {
              title: "带凭据的结果",
              url: "https://catalog.example/demo?access_token=private-example",
            },
          ],
        };
      },
      async getSeries(input) {
        const chapters = [chapter("opening")];
        if (version === "1.1.0") chapters.push(chapter("new-release"));
        if (settings.layout === "compact")
          chapters.push(chapter("compact-only"));
        if (new URL(input).searchParams.get("group") === "different") {
          return { id: "different-work", chapters };
        }
        return { id: "demo", chapters };
      },
      async getChapter() {
        return { workId: "demo", chapter: chapter("opening") };
      },
    };
  },
};
