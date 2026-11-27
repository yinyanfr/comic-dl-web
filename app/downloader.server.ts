import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createDownloader,
  fixtureExtension,
  withManagedDownloader,
  type Downloader,
} from "comic-dl";
import { z } from "zod";

const fixtureFlag = z.enum(["0", "1"]).default("0");
const path = z.string().trim().min(1);
const packageName = z
  .string()
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/);
const environmentSchema = z.object({
  COMIC_DL_WEB_OUTPUT: path.default("./downloads"),
  COMIC_DL_WEB_SHELF: path.default("./data/shelf.sqlite"),
  COMIC_DL_WEB_WATCH_INTERVAL: z.coerce
    .number()
    .int()
    .min(1)
    .max(31_536_000)
    .default(3600),
  COMIC_DL_WEB_OUTPUT_MARKER: path
    .refine((name) => !/[/\\\0]/.test(name) && name !== "." && name !== "..")
    .optional(),
  COMIC_DL_WEB_EXTENSION_DIR: path.optional(),
  COMIC_DL_WEB_EXTENSIONS: z
    .string()
    .optional()
    .transform((value) =>
      value ? value.split(",").map((name) => name.trim()) : [],
    )
    .pipe(z.array(packageName)),
  COMIC_DL_WEB_DEFAULT_SOURCE: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
});

function fixtureEnabled(environment: NodeJS.ProcessEnv) {
  return (
    (environment.NODE_ENV === "development" ||
      environment.NODE_ENV === "test") &&
    fixtureFlag.parse(environment.COMIC_DL_WEB_FIXTURE) === "1"
  );
}

export function createAppDownloader(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const config = environmentSchema.parse(environment);
  const downloader = createDownloader({
    source: config.COMIC_DL_WEB_DEFAULT_SOURCE,
    output: resolve(config.COMIC_DL_WEB_OUTPUT),
  });
  if (fixtureEnabled(environment)) {
    downloader.use(fixtureExtension);
  }
  return downloader;
}

const config = environmentSchema.parse(process.env);
export const shelfFile = resolve(config.COMIC_DL_WEB_SHELF);
export const watchOptions = {
  directory: resolve(config.COMIC_DL_WEB_OUTPUT),
  intervalSeconds: config.COMIC_DL_WEB_WATCH_INTERVAL,
  outputMarker: config.COMIC_DL_WEB_OUTPUT_MARKER,
};
export const fixtureDirectory = fixtureEnabled(process.env)
  ? resolve(
      path.parse(
        process.env.COMIC_DL_WEB_FIXTURE_DIR ?? "./tests/fixtures/comics",
      ),
    )
  : undefined;
const localDownloader = createAppDownloader();

export async function withAppDownloader<T>(
  run: (downloader: Downloader) => Promise<T>,
  signal?: AbortSignal,
  onLoadError?: (cause: unknown) => void,
) {
  if (
    !config.COMIC_DL_WEB_EXTENSION_DIR &&
    config.COMIC_DL_WEB_EXTENSIONS.length === 0
  ) {
    return run(localDownloader);
  }
  return withManagedDownloader(
    {
      extensions: config.COMIC_DL_WEB_EXTENSIONS,
      extensionDirectory: resolve(
        config.COMIC_DL_WEB_EXTENSION_DIR ?? "./data/extensions",
      ),
      source: config.COMIC_DL_WEB_DEFAULT_SOURCE,
      output: resolve(config.COMIC_DL_WEB_OUTPUT),
      signal,
      onLoadError,
    },
    async (downloader) => {
      if (fixtureDirectory) downloader.use(fixtureExtension);
      return run(downloader);
    },
  );
}

export async function isOutputReady() {
  const { directory, outputMarker } = watchOptions;
  if (!outputMarker) return true;
  const marker = await lstat(join(directory, outputMarker)).catch(() => null);
  return marker?.isFile() ?? false;
}

export function resolveDownloadInput(
  downloader: Downloader,
  input: string,
  kind: "series" | "chapter",
  explicitSource?: string,
) {
  const source = downloader.resolveSource(input, kind, explicitSource);
  if (source === "fixture") {
    if (!fixtureDirectory || input !== "demo")
      throw new Error("Invalid fixture alias");
    return { locator: fixtureDirectory, source };
  }
  return { locator: input, source };
}
