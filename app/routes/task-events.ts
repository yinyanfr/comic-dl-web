import { downloadQueue } from "../download-queue.server";
import type { Route } from "./+types/task-events";

const encoder = new TextEncoder();
const changeEvent = encoder.encode("event: tasks\ndata: changed\n\n");
const heartbeat = encoder.encode(": keepalive\n\n");

export function loader({ request }: Route.LoaderArgs) {
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
      const unsubscribe = downloadQueue.subscribe(() => {
        pending = true;
        flush(controller);
      });
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
