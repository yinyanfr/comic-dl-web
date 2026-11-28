import { useEffect, useEffectEvent, useRef } from "react";
import { useFetcher } from "react-router";
import type { loader } from "./routes/task-status";

export function useTaskUpdates(scope: "tasks" | "shelf", page = 1) {
  const fetcher = useFetcher<typeof loader>();
  const pending = useRef(false);
  const refresh = useEffectEvent(() => {
    if (!pending.current || fetcher.state !== "idle") return;
    pending.current = false;
    void fetcher.load(`/tasks/status?scope=${scope}&page=${page}`);
  });

  useEffect(() => {
    const events = new EventSource(`/tasks/events?scope=${scope}`);
    const controller = new AbortController();
    let checkingAuth = false;
    events.addEventListener("error", () => {
      if (checkingAuth || controller.signal.aborted) return;
      checkingAuth = true;
      // EventSource hides HTTP status. Probe through fetch so the common auth
      // handler can distinguish session loss from a temporary network failure.
      void fetch("/tasks/status", {
        signal: controller.signal,
        cache: "no-store",
      })
        .catch(() => {})
        .finally(() => {
          checkingAuth = false;
        });
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    events.addEventListener(scope, () => {
      timer ??= setTimeout(() => {
        timer = undefined;
        pending.current = true;
        refresh();
      }, 250);
    });
    return () => {
      clearTimeout(timer);
      events.close();
      controller.abort();
    };
  }, [scope]);

  useEffect(() => {
    refresh();
  }, [fetcher.state]);

  return fetcher.data;
}
