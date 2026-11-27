import { describe, expect, it } from "vitest";
import { createAppDownloader } from "../../app/downloader.server";

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
