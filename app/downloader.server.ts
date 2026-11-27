import { createDownloader, fixtureExtension } from "comic-dl";
import { z } from "zod";

const fixtureFlag = z.enum(["0", "1"]).default("0");

export function createAppDownloader(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const downloader = createDownloader();
  const allowFixture =
    environment.NODE_ENV === "development" || environment.NODE_ENV === "test";

  if (
    allowFixture &&
    fixtureFlag.parse(environment.COMIC_DL_WEB_FIXTURE) === "1"
  ) {
    downloader.use(fixtureExtension);
  }

  return downloader;
}

const downloader = createAppDownloader();

export function listSourceIds() {
  return downloader.sources();
}
