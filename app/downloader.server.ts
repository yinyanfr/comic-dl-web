import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createDownloader,
  fixtureExtension,
  withManagedDownloader,
  type Downloader,
  type SettingsBySource,
} from "comic-dl";
import { z } from "zod";

const fixtureFlag = z.enum(["0", "1"]).default("0");
const path = z.string().trim().min(1);
export const packageName = z
  .string()
  .max(214)
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
  COMIC_DL_WEB_SOURCE_STATE: path.default("./data/sources.json"),
  COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT: z.enum(["0", "1"]).default("0"),
  COMIC_DL_WEB_ADMIN_ORIGIN: z
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        /^https?:$/.test(url.protocol) &&
        url.origin === value &&
        !url.hostname.includes("*")
      );
    })
    .optional(),
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
export const extensionDirectory = resolve(
  config.COMIC_DL_WEB_EXTENSION_DIR ?? "./data/extensions",
);
export const sourceStateFile = resolve(config.COMIC_DL_WEB_SOURCE_STATE);
export const extensionManagementEnabled =
  config.COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT === "1";
export const adminOrigin = config.COMIC_DL_WEB_ADMIN_ORIGIN;
export const deploymentPackages = config.COMIC_DL_WEB_EXTENSIONS;
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
export type ReportLoadError = (cause: unknown) => void;

export type WithDownloader = <T>(
  run: (downloader: Downloader) => Promise<T>,
  signal?: AbortSignal,
  onLoadError?: ReportLoadError,
) => Promise<T>;

export function withConfiguredDownloader<T>(
  sourceSettings: SettingsBySource,
  run: (downloader: Downloader) => Promise<T>,
  signal?: AbortSignal,
  onLoadError: ReportLoadError = () => {},
) {
  return withManagedDownloader(
    {
      extensions: deploymentPackages,
      extensionDirectory,
      sourceSettings,
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

export async function readSources(
  withDownloader: WithDownloader,
  signal: AbortSignal,
) {
  let failures = 0;
  let ids: string[];
  try {
    ids = await withDownloader(
      async (downloader) => downloader.sources(),
      signal,
      () => {
        failures++;
      },
    );
  } catch {
    ids = [];
    failures++;
  }
  return { ids, failures, unavailable: failures > 0 };
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
