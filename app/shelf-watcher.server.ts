import {
  isOutputReady,
  shelfFile,
  watchOptions,
  withAppDownloader,
} from "./downloader.server.ts";

type WatcherState = "starting" | "running" | "locked" | "stopped";

export function startShelfWatcher() {
  const controller = new AbortController();
  const { signal } = controller;
  const listeners = new Set<() => void>();
  let state: WatcherState = "starting";
  let outputReady = true;
  let checkingOutput = false;

  function notify() {
    for (const listener of listeners) listener();
  }

  function setOutput(ready: boolean) {
    if (outputReady === ready || signal.aborted) return;
    outputReady = ready;
    notify();
  }

  async function refreshOutput() {
    if (checkingOutput) return;
    checkingOutput = true;
    try {
      setOutput(await isOutputReady());
    } finally {
      checkingOutput = false;
    }
  }

  const outputMonitor = watchOptions.outputMarker
    ? setInterval(() => void refreshOutput(), 1000).unref()
    : undefined;
  void refreshOutput();

  const done = withAppDownloader(
    async (downloader) => {
      signal.throwIfAborted();
      const shelf = await downloader.openShelf({ file: shelfFile });
      try {
        const watching = shelf.watch({
          ...watchOptions,
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
      console.warn("A comic source could not be loaded by the shelf watcher."),
  ).catch((error: unknown) => {
    if (signal.aborted) return;
    // The core wraps SQLite's lock contention error; it has no public lock error type.
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

  return {
    snapshot: () => ({ state, outputReady }),
    notify,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async stop() {
      clearInterval(outputMonitor);
      controller.abort();
      await done;
      state = "stopped";
      notify();
    },
  };
}

declare module "react-router" {
  interface AppLoadContext {
    shelfWatcher: ReturnType<typeof startShelfWatcher>;
  }
}
