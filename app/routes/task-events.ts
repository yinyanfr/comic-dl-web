import { downloadQueue } from "../download-queue.server";
import type { Route } from "./+types/task-events";

const encoder = new TextEncoder();
const heartbeat = encoder.encode(": keepalive\n\n");

export function loader({ request, context }: Route.LoaderArgs) {
  const forShelf = new URL(request.url).searchParams.get("scope") === "shelf";
  const changeEvent = encoder.encode(
    `event: ${forShelf ? "shelf" : "tasks"}\ndata: changed\n\n`,
  );
  let cleanup: () => void;
  let pending = true;
  function flush(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (pending && (controller.desiredSize ?? 0) > 0) {
      pending = false;
      controller.enqueue(changeEvent);
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const publish = () => {
        pending = true;
        flush(controller);
      };
      const unsubscribe = forShelf
        ? context.comics.shelfWatcher.subscribe(publish)
        : downloadQueue.subscribe(publish);
      const interval = setInterval(() => {
        if ((controller.desiredSize ?? 0) > 0) controller.enqueue(heartbeat);
      }, 15_000);
      const abort = () => {
        cleanup();
        controller.close();
      };
      cleanup = () => {
        unsubscribe();
        clearInterval(interval);
        request.signal.removeEventListener("abort", abort);
      };
      if (request.signal.aborted) abort();
      else request.signal.addEventListener("abort", abort, { once: true });
    },
    pull: flush,
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
