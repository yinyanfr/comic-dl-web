import { createDownloader } from "comic-dl";
import { extensionApiVersion, type SourceExtension } from "comic-dl/extension";
import { describe, expect, it } from "vitest";
import {
  createAppDownloader,
  resolveDownloadInput,
} from "../../app/downloader.server";

describe("测试源注册", () => {
  it.each(["development", "test"])(
    "在 %s 环境中显式启用后注册 fixture",
    (mode) => {
      const downloader = createAppDownloader({
        NODE_ENV: mode,
        COMIC_DL_WEB_FIXTURE: "1",
      });

      expect(downloader.sources()).toEqual(["fixture"]);
    },
  );

  it("默认不注册 fixture", () => {
    expect(createAppDownloader({ NODE_ENV: "development" }).sources()).toEqual(
      [],
    );
  });

  it("在生产环境中不注册 fixture", () => {
    const downloader = createAppDownloader({
      NODE_ENV: "production",
      COMIC_DL_WEB_FIXTURE: "1",
    });

    expect(downloader.sources()).toEqual([]);
  });
});

it("按显式来源、默认来源、链接识别的顺序选源", () => {
  const extension = (id: string, hostname: string): SourceExtension => ({
    id,
    apiVersion: extensionApiVersion,
    matchesUrl: (url) => url.hostname === hostname,
    create: () => {
      throw new Error("选源不应读取章节");
    },
  });
  const linked = extension("linked", "comics.example");
  const fallback = extension("fallback", "other.example");
  const url = "https://comics.example/series";

  const withDefault = createDownloader({ source: "fallback" })
    .use(linked)
    .use(fallback);
  expect(
    resolveDownloadInput(withDefault, "short-id", "series", "linked").source,
  ).toBe("linked");
  expect(resolveDownloadInput(withDefault, url, "series").source).toBe(
    "fallback",
  );
  expect(
    resolveDownloadInput(createDownloader().use(linked), url, "series").source,
  ).toBe("linked");
});
