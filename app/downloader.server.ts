import copymanga from "@comic-dl/copymanga";
import dm5 from "@comic-dl/dm5";
import kavita from "@comic-dl/kavita";
import komga from "@comic-dl/komga";
import zerobyw from "@comic-dl/zerobyw";
import { lstat, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createDownloader,
  fixtureExtension,
  withManagedDownloader,
  type Downloader,
  type SettingsBySource,
} from "comic-dl";
import { z } from "zod";
import { sourceId } from "./source-input.server.ts";
import {
  withSourceCredential,
  type SourceCredentials,
} from "./source-credentials.server.ts";

const bundled = [copymanga, zerobyw, dm5, komga, kavita];
const bundledSources = new WeakMap<Downloader, Set<string>>();
export function usesBundledSource(downloader: Downloader, id: string) {
  return bundledSources.get(downloader)?.has(id) ?? false;
}

const fixtureFlag = z.enum(["0", "1"]).default("0");
const path = z.string().trim().min(1);
const watchInterval = z.coerce.number().int().min(1).max(31_536_000);
export const archiveSettings = z.object({
  template: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => {
      const parts = value.split("/");
      return (
        parts.length <= 4 &&
        parts.every(
          (part) =>
            part.length > 0 &&
            part !== "." &&
            part !== ".." &&
            !/[\\:\p{Cc}]/u.test(part) &&
            !/\{(?!title\}|chapter\}|number\}|workId\}|chapterId\})/.test(
              part,
            ) &&
            !/[{}]/.test(
              part.replace(
                /\{(?:title|chapter|number|workId|chapterId)\}/g,
                "",
              ),
            ),
        ) &&
        !/\.(?:cbz|zip)$/i.test(value)
      );
    }),
  padding: z.coerce.number().int().min(0).max(12),
  format: z.enum(["cbz", "zip"]),
});
export const defaultArchive = {
  template: "{title}/{number}-{chapter}",
  padding: 0,
  format: "cbz" as const,
};
export const librarySettings = z.object({
  folder: z
    .string()
    .trim()
    .max(512)
    .refine(
      (value) =>
        !value ||
        value
          .split("/")
          .every(
            (segment) =>
              Boolean(segment) &&
              segment !== "." &&
              segment !== ".." &&
              !/[:\\\p{Cc}]/u.test(segment),
          ),
    ),
  intervalSeconds: watchInterval,
  defaultSource: sourceId.optional(),
  archive: archiveSettings.default(defaultArchive),
});
export type LibrarySettings = z.infer<typeof librarySettings>;
export const packageName = z
  .string()
  .max(214)
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/);
const environmentSchema = z.object({
  COMIC_DL_WEB_OUTPUT: path.default("./downloads"),
  COMIC_DL_WEB_SHELF: path.default("./data/shelf.sqlite"),
  COMIC_DL_WEB_WATCH_INTERVAL: watchInterval.default(3600),
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
export const defaultLibrarySettings = {
  folder: "",
  intervalSeconds: watchOptions.intervalSeconds,
  defaultSource: config.COMIC_DL_WEB_DEFAULT_SOURCE,
  archive: defaultArchive,
};

export function isAdminRequest(request: Request) {
  return (
    request.method === "POST" &&
    !request.headers.get("Sec-Fetch-Site")?.endsWith("-site") &&
    request.headers.get("Origin") ===
      (adminOrigin ?? new URL(request.url).origin)
  );
}

export async function outputDirectory(folder: string) {
  if (!folder) return watchOptions.directory;
  const requested = join(watchOptions.directory, folder);
  const root = await realpath(watchOptions.directory);
  const directory = await realpath(requested);
  if (
    directory !== join(root, folder) ||
    !(await stat(directory)).isDirectory()
  )
    throw new Error("Invalid output subfolder");
  return directory;
}
export async function downloadOptions(settings: LibrarySettings) {
  return {
    directory: await outputDirectory(settings.folder),
    outputRoot: watchOptions.directory,
    outputMarker: watchOptions.outputMarker,
    archive: settings.archive,
  };
}

export async function outputReady(settings: LibrarySettings) {
  try {
    const directory = await outputDirectory(settings.folder);
    return (
      (await stat(directory)).isDirectory() &&
      (await isOutputReady(watchOptions.directory))
    );
  } catch {
    return false;
  }
}
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
  library: LibrarySettings = defaultLibrarySettings,
  credentials: SourceCredentials = {},
) {
  return withManagedDownloader(
    {
      extensions: deploymentPackages,
      extensionDirectory,
      sourceSettings,
      source: library.defaultSource,
      signal,
      onLoadError,
    },
    async (downloader) => {
      const loaded = downloader.sources();
      const registered = new Set<string>();
      bundledSources.set(downloader, registered);
      for (const extension of bundled) {
        if (loaded.includes(extension.id)) continue;
        try {
          downloader.use({
            ...extension,
            create: (api, settings) =>
              withSourceCredential(extension.id, credentials, () =>
                extension.create(api, settings),
              ),
          });
          registered.add(extension.id);
        } catch (cause) {
          // The core also rejects registration when it has excluded an ambiguous ID.
          onLoadError(cause);
        }
      }
      if (fixtureDirectory) downloader.use(fixtureExtension);
      return run(downloader);
    },
  );
}

export async function isOutputReady(
  directory: string,
  outputMarker = watchOptions.outputMarker,
) {
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
