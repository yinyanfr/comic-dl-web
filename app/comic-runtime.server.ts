import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  manageExtensions,
  type Downloader,
  type ExtensionAction,
} from "comic-dl";
import type { OptionValues } from "comic-dl/extension";
import { z } from "zod";
import {
  extensionDirectory,
  packageName,
  sourceStateFile,
  withConfiguredDownloader,
  type ReportLoadError,
  type WithDownloader,
} from "./downloader.server.ts";
import { createShelfWatcher } from "./shelf-watcher.server.ts";

const stateSchema = z.object({
  settings: z.record(
    z.string(),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  ),
  installed: z.array(packageName).nullable(),
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
  if (content === null) return { settings: {}, installed: null };
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
  const shelfWatcher = createShelfWatcher();
  const shutdown = new AbortController();
  let transition: Promise<unknown> = Promise.resolve();
  const opening = new Set<Promise<void>>();
  const current: WithDownloader = (run, signal, onLoadError) =>
    withConfiguredDownloader(state.settings, run, signal, onLoadError);
  shelfWatcher.start(current);

  function change<T>(run: () => Promise<T>) {
    const result = transition
      .catch(() => {})
      .then(async () => {
        shutdown.signal.throwIfAborted();
        await shelfWatcher.pause();
        try {
          // Once these calls enter their callbacks, the core retains their
          // extension generation until they finish, even across an update.
          await Promise.all(opening);
          shutdown.signal.throwIfAborted();
          return await run();
        } finally {
          if (!shutdown.signal.aborted) shelfWatcher.start(current);
        }
      });
    transition = result;
    return result;
  }

  async function inspect<T>(
    run: (downloader: Downloader, snapshot: SourceState) => Promise<T>,
    signal?: AbortSignal,
    onLoadError?: ReportLoadError,
  ) {
    let observed: Promise<unknown>;
    do {
      observed = transition;
      await observed.catch(() => {});
    } while (observed !== transition);
    shutdown.signal.throwIfAborted();
    signal?.throwIfAborted();
    const snapshot = state;
    const ready = Promise.withResolvers<void>();
    opening.add(ready.promise);
    const opened = () => {
      opening.delete(ready.promise);
      ready.resolve();
    };
    return withConfiguredDownloader(
      snapshot.settings,
      (downloader) => {
        opened();
        return run(downloader, snapshot);
      },
      signal,
      onLoadError,
    ).finally(opened);
  }
  const withDownloader: WithDownloader = inspect;

  return {
    shelfWatcher,
    withDownloader,
    inspect,
    lastManagedPackages: () => state.installed,
    manage(action: ExtensionAction, spec: string | undefined) {
      return change(async () => {
        const result = await manageExtensions(action, spec, {
          directory: extensionDirectory,
          signal: shutdown.signal,
        });
        const next = { ...state, installed: [...result.installed].sort() };
        state = next;
        const saved = await saveState(next).then(
          () => true,
          () => false,
        );
        return { changed: result.changed, saved };
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
        );
        if (Object.keys(values).length) settings[source] = { ...values };
        const next = { ...state, settings };
        await saveState(next);
        state = next;
      });
    },
    async stop() {
      shutdown.abort();
      await transition.catch(() => {});
      await shelfWatcher.stop();
    },
  };
}

export type ComicRuntime = Awaited<ReturnType<typeof createComicRuntime>>;

declare module "react-router" {
  interface AppLoadContext {
    comics: ComicRuntime;
  }
}
