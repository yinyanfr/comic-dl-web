import type { DownloadTaskSnapshot, ShelfHandle } from "comic-dl";
import { setTimeout } from "node:timers/promises";
import {
  outputReady as checkOutput,
  downloadOptions,
  outputDirectory,
  shelfFile,
  watchOptions,
  type LibrarySettings,
  type WithDownloader,
} from "./downloader.server.ts";

type WatcherState = "starting" | "running" | "locked" | "stopped";

export function createShelfWatcher(library: () => LibrarySettings) {
  const listeners = new Set<() => void>();
  let state: WatcherState = "stopped";
  let generation = 0;
  let active: { controller: AbortController; done: Promise<void> } | undefined;
  let closed = false;
  let outputReady = true;
  let checkingOutput = false;
  let liveShelf: ShelfHandle | undefined;
  let lastTasks: DownloadTaskSnapshot[] = [];

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
      const ready = await checkOutput(settings);
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
    tasks: () => liveShelf?.tasks() ?? lastTasks,
    hasLiveShelf: () => Boolean(liveShelf),
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
          let directory = await outputDirectory(settings.folder).catch(
            () => undefined,
          );
          while (!directory) {
            setOutput(false);
            await setTimeout(1000, undefined, { signal });
            directory = await outputDirectory(settings.folder).catch(
              () => undefined,
            );
          }
          signal.throwIfAborted();
          const shelf = await downloader.openShelf({ file: shelfFile });
          liveShelf = shelf;
          try {
            shelf.setDefaultInterval(settings.intervalSeconds);
            const watching = shelf.watch({
              ...(await downloadOptions(settings)),
              intervalSeconds: settings.intervalSeconds,
              signal,
              onCheck: notify,
              onTask: notify,
              onEvent: notify,
              onOutputUnavailable: () => setOutput(false),
            });
            state = "running";
            notify();
            await watching;
          } finally {
            lastTasks = shelf.tasks();
            liveShelf = undefined;
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
