import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
  isOutputReady,
  outputDirectory,
  shelfFile,
  watchOptions,
  type LibrarySettings,
  type WithDownloader,
} from "./downloader.server.ts";

type WatcherState = "starting" | "running" | "locked" | "stopped";

// The core checks this file before preparing the output directory and again
// before committing an archive. Creating it never creates the subfolder.
const subfolderMarker = ".comic-dl-web-output";

async function prepareOutput(folder: string) {
  const directory = await outputDirectory(folder);
  if (folder && !(await isOutputReady(directory, subfolderMarker))) {
    await writeFile(join(directory, subfolderMarker), "", {
      flag: "wx",
      mode: 0o600,
    }).catch((error: unknown) => {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ))
        throw error;
    });
    if (!(await isOutputReady(directory, subfolderMarker)))
      throw new Error("Invalid watcher output marker");
  }
  return directory;
}

export function createShelfWatcher(library: () => LibrarySettings) {
  const listeners = new Set<() => void>();
  let state: WatcherState = "stopped";
  let generation = 0;
  let active: { controller: AbortController; done: Promise<void> } | undefined;
  let closed = false;
  let outputReady = true;
  let checkingOutput = false;

  function notify() {
    for (const listener of listeners) listener();
  }

  function setOutput(ready: boolean) {
    if (outputReady === ready || closed) return;
    outputReady = ready;
    notify();
  }

  async function refreshOutput() {
    if (checkingOutput) return;
    checkingOutput = true;
    try {
      const settings = library();
      const ready = await prepareOutput(settings.folder)
        .then((directory) =>
          isOutputReady(
            directory,
            settings.folder ? subfolderMarker : undefined,
          ),
        )
        .catch(() => false);
      if (settings === library()) setOutput(ready);
    } finally {
      checkingOutput = false;
    }
  }

  const outputMonitor = setInterval(() => {
    if (watchOptions.outputMarker || library().folder || !outputReady)
      void refreshOutput();
  }, 1000).unref();
  void refreshOutput();

  async function pause() {
    active?.controller.abort();
    await active?.done;
    active = undefined;
    state = "stopped";
    notify();
  }

  return {
    snapshot: () => ({ state, outputReady, generation }),
    notify,
    pause,
    start(withDownloader: WithDownloader) {
      if (closed || active) return;
      generation++;
      state = "starting";
      notify();
      const controller = new AbortController();
      const { signal } = controller;
      const settings = library();
      void refreshOutput();
      const done = withDownloader(
        async (downloader) => {
          let directory = await prepareOutput(settings.folder).catch(
            () => undefined,
          );
          while (!directory) {
            setOutput(false);
            await setTimeout(1000, undefined, { signal });
            directory = await prepareOutput(settings.folder).catch(
              () => undefined,
            );
          }
          signal.throwIfAborted();
          const shelf = await downloader.openShelf({ file: shelfFile });
          try {
            const watching = shelf.watch({
              ...watchOptions,
              directory,
              outputMarker: settings.folder
                ? subfolderMarker
                : watchOptions.outputMarker,
              intervalSeconds: settings.intervalSeconds,
              signal,
              onCheck: notify,
              onTask: notify,
              onOutputUnavailable: () => setOutput(false),
            });
            state = "running";
            notify();
            await watching;
          } finally {
            shelf.close();
          }
        },
        signal,
        () =>
          console.warn(
            "A comic source could not be loaded by the shelf watcher.",
          ),
      ).catch((error: unknown) => {
        if (signal.aborted) return;
        // The core wraps SQLite's lock contention error.
        const cause = error instanceof Error ? error.cause : undefined;
        if (
          cause instanceof Error &&
          "code" in cause &&
          cause.code === "SQLITE_BUSY"
        ) {
          state = "locked";
        } else {
          state = "stopped";
          console.error(
            "The shelf watcher could not run. Check the service configuration.",
          );
        }
        notify();
      });
      active = { controller, done };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async stop() {
      closed = true;
      clearInterval(outputMonitor);
      await pause();
    },
  };
}
