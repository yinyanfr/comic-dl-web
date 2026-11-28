import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  manageExtensions,
  listManagedExtensions,
  checkExtensionUpdates,
  planArchiveMigration,
  applyArchiveMigration,
  type ArchiveMigrationItem,
  type ArchiveMigrationEntry,
  type Downloader,
  type ExtensionAction,
} from "comic-dl";
import type { OptionValues } from "comic-dl/extension";
import { createContext } from "react-router";
import { z } from "zod";
import {
  DownloadQueue,
  recentShelfTasks,
  shelfDownloadTasks,
} from "./download-queue.server.ts";
import { readShelfTasks } from "./shelf.server.ts";
import {
  extensionDirectory,
  defaultLibrarySettings,
  librarySettings,
  outputDirectory,
  downloadOptions,
  outputReady,
  resolveDownloadInput,
  sourceStateFile,
  shelfFile,
  usesBundledSource,
  withConfiguredDownloader,
  type ReportLoadError,
  type LibrarySettings,
  type WithDownloader,
} from "./downloader.server.ts";
import { createShelfWatcher } from "./shelf-watcher.server.ts";
import {
  normalizeCredentialTarget,
  sourceCredentials,
  type SourceCredentials,
} from "./source-credentials.server.ts";

const stateSchema = z.object({
  settings: z.record(
    z.string(),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  ),
  library: librarySettings.optional(),
  credentials: sourceCredentials.default({}),
});
type SourceState = z.infer<typeof stateSchema>;

async function readState(): Promise<SourceState> {
  const content = await readFile(sourceStateFile, "utf8").catch(
    (error: unknown) => {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }
      throw new Error("Could not read the Web source settings file.", {
        cause: error,
      });
    },
  );
  if (content === null) return stateSchema.parse({ settings: {} });
  const parsed = z
    .string()
    .transform((text): unknown => {
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    })
    .pipe(stateSchema)
    .safeParse(content);
  if (!parsed.success) throw new Error("Invalid Web source settings file.");
  return parsed.data;
}

async function saveState(state: SourceState) {
  await mkdir(dirname(sourceStateFile), { recursive: true, mode: 0o700 });
  const temporary = `${sourceStateFile}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(state), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, sourceStateFile);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function createComicRuntime() {
  let state = await readState();
  const library = () => state.library ?? defaultLibrarySettings;
  const directory = () => outputDirectory(library().folder);
  const shelfWatcher = createShelfWatcher(library);
  const downloadQueue = new DownloadQueue();
  const shutdown = new AbortController();
  let transition: Promise<unknown> = Promise.resolve();
  let managingPackages = false;
  let archiveBusy = false;
  let migration:
    | {
        token: string;
        directory: string;
        settings: string;
        created: number;
        items: ArchiveMigrationItem[];
      }
    | undefined;
  const hiddenShelfTasks = new Map<string, string>();
  const current: WithDownloader = (run, signal, onLoadError) =>
    inspect((downloader) => run(downloader), signal, onLoadError);
  shelfWatcher.start(current);

  function change<T>(run: () => Promise<T>) {
    const result = transition
      .catch(() => {})
      .then(async () => {
        shutdown.signal.throwIfAborted();
        await shelfWatcher.pause();
        try {
          shutdown.signal.throwIfAborted();
          return await run();
        } finally {
          if (!shutdown.signal.aborted) shelfWatcher.start(current);
        }
      });
    transition = result;
    return result;
  }

  async function archiveOperation<T>(run: () => Promise<T>) {
    if (archiveBusy) throw new Error("Archive operation in progress");
    archiveBusy = true;
    downloadQueue.block(true);
    try {
      return await change(async () => {
        if (downloadQueue.busy) throw new Error("Wait for downloads to finish");
        if (!(await outputReady(library())))
          throw new Error("Output unavailable");
        return run();
      });
    } finally {
      archiveBusy = false;
      downloadQueue.block(false);
    }
  }

  function inspect<T>(
    run: (downloader: Downloader, snapshot: SourceState) => Promise<T>,
    signal?: AbortSignal,
    onLoadError?: ReportLoadError,
  ) {
    const active = signal
      ? AbortSignal.any([signal, shutdown.signal])
      : shutdown.signal;
    const snapshot = state;
    // The core pins the active extension generation for each read.
    return withConfiguredDownloader(
      snapshot.settings,
      (downloader) => run(downloader, snapshot),
      active,
      onLoadError,
      snapshot.library,
      snapshot.credentials,
    );
  }
  const withDownloader: WithDownloader = inspect;

  return {
    shelfWatcher,
    downloadQueue,
    async tasks() {
      const shelfTasks = shelfWatcher.hasLiveShelf()
        ? shelfWatcher.tasks()
        : await readShelfTasks().catch(() => []);
      const visible = shelfTasks.filter(
        (task) => hiddenShelfTasks.get(task.id) !== JSON.stringify(task),
      );
      return [
        ...downloadQueue.snapshot(),
        ...shelfDownloadTasks(recentShelfTasks(visible)),
      ];
    },
    async clearFinished() {
      downloadQueue.clearFinished();
      const tasks = shelfWatcher.hasLiveShelf()
        ? shelfWatcher.tasks()
        : await readShelfTasks();
      for (const task of tasks) {
        if (
          [
            "downloaded",
            "skipped",
            "failed",
            "restricted",
            "cancelled",
          ].includes(task.state)
        )
          hiddenShelfTasks.set(task.id, JSON.stringify(task));
      }
      shelfWatcher.notify();
    },
    previewMigration(target?: { input: string; source?: string }) {
      return archiveOperation(async () => {
        const settings = library();
        const { directory } = await downloadOptions(settings);
        const entries = await withDownloader(async (downloader) => {
          const shelf = await downloader.openShelf({ file: shelfFile });
          try {
            const targets = target
              ? [target]
              : shelf.list().map((entry) => ({
                  input: entry.sourceId === "fixture" ? "demo" : entry.input,
                  source: entry.sourceId,
                }));
            const entries: ArchiveMigrationEntry[] = [];
            const seen = new Set<string>();
            for (const target of targets) {
              const { source, locator } = resolveDownloadInput(
                downloader,
                target.input,
                "series",
                target.source,
              );
              const series = await downloader.list(locator, {
                source,
                signal: shutdown.signal,
              });
              const saved = shelf
                .list()
                .find(
                  (entry) =>
                    entry.sourceId === source && entry.workId === series.id,
                );
              series.chapters.forEach((chapter, index) => {
                const identity = [source, series.id, chapter.id] as const;
                if (seen.has(JSON.stringify(identity))) return;
                seen.add(JSON.stringify(identity));
                entries.push({
                  identity,
                  title: saved?.title ?? series.metadata?.title ?? series.id,
                  chapter: chapter.title,
                  number: index + 1,
                });
              });
            }
            return entries;
          } finally {
            shelf.close();
          }
        });
        const items = await planArchiveMigration(
          directory,
          entries,
          settings.archive,
          shutdown.signal,
        );
        const token = randomUUID();
        migration = {
          token,
          directory,
          settings: JSON.stringify(settings),
          created: Date.now(),
          items,
        };
        return {
          token,
          items: items.map(({ from, to, status }) => ({ from, to, status })),
        };
      });
    },
    applyMigration(token: string) {
      return archiveOperation(async () => {
        const preview = migration;
        if (
          !preview ||
          preview.token !== token ||
          Date.now() - preview.created > 600_000 ||
          preview.settings !== JSON.stringify(library()) ||
          preview.directory !== (await directory())
        )
          throw new Error("Preview expired");
        migration = undefined;
        await applyArchiveMigration(
          preview.directory,
          preview.items,
          shutdown.signal,
        );
      });
    },
    withDownloader,
    library,
    directory,
    inspect,
    usesBundledSource,
    saveLibrary(settings: LibrarySettings | undefined) {
      return change(async () => {
        if (settings) {
          await outputDirectory(settings.folder);
          if (settings.defaultSource) {
            const sources = await withDownloader(async (downloader) =>
              downloader.sources(),
            );
            if (!sources.includes(settings.defaultSource))
              throw new Error("Unknown default source");
          }
        }
        const next = { ...state, library: settings };
        await saveState(next);
        state = next;
      });
    },
    saveCredential(
      source: keyof SourceCredentials,
      value: string | undefined,
      expectedTarget: string | undefined,
    ) {
      return change(async () => {
        const credentials = { ...state.credentials };
        if (value) {
          const target = await withDownloader(async (downloader) => {
            if (!usesBundledSource(downloader, source)) return;
            const settings = downloader.validateSourceSettings(source);
            return normalizeCredentialTarget(
              source,
              settings[source === "zerobyw" ? "site-url" : "server-url"],
            );
          });
          if (!target || target !== expectedTarget)
            throw new Error("Credential target changed");
          credentials[source] = { target, value };
        } else {
          delete credentials[source];
        }
        const next = { ...state, credentials };
        await saveState(next);
        state = next;
      });
    },
    listPackages: (signal?: AbortSignal) =>
      listManagedExtensions({ directory: extensionDirectory, signal }),
    checkUpdates: (name?: string, signal?: AbortSignal) =>
      checkExtensionUpdates(name, { directory: extensionDirectory, signal }),
    manage(action: ExtensionAction, spec: string | undefined) {
      if (managingPackages) return;
      managingPackages = true;
      return change(async () => {
        const result = await manageExtensions(action, spec, {
          directory: extensionDirectory,
          signal: AbortSignal.any([
            shutdown.signal,
            AbortSignal.timeout(120_000),
          ]),
        });
        return { changed: result.changed };
      }).finally(() => {
        managingPackages = false;
      });
    },
    saveSettings(
      source: string,
      candidate: (downloader: Downloader) => OptionValues,
    ) {
      return change(async () => {
        // Validate a full replacement against the current schema and inherited defaults.
        const settings = { ...state.settings };
        delete settings[source];
        const values = await withConfiguredDownloader(
          settings,
          async (downloader) => {
            const values = candidate(downloader);
            downloader.validateSourceSettings(source, values);
            return values;
          },
          shutdown.signal,
          undefined,
          library(),
          state.credentials,
        );
        if (Object.keys(values).length) settings[source] = { ...values };
        const next = { ...state, settings };
        await saveState(next);
        state = next;
      });
    },
    async stop() {
      const downloads = downloadQueue.stop();
      shutdown.abort();
      await Promise.all([
        downloads,
        shelfWatcher.stop(),
        transition.catch(() => {}),
      ]);
    },
  };
}

export type ComicRuntime = Awaited<ReturnType<typeof createComicRuntime>>;

// The native HTTP server and the Vite SSR bundle load this module separately.
const contextKey = Symbol.for("comic-dl-web.runtime-context");
const processContext = globalThis as typeof globalThis & {
  [contextKey]?: ReturnType<typeof createContext<ComicRuntime>>;
};
export const comicsContext = (processContext[contextKey] ??=
  createContext<ComicRuntime>());
