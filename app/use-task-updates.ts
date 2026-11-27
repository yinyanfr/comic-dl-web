import { useEffect } from "react";
import { useRevalidator } from "react-router";

export function useTaskUpdates(scope: "tasks" | "shelf") {
  const { revalidate } = useRevalidator();

  useEffect(() => {
    const events = new EventSource(`/tasks/events?scope=${scope}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    events.addEventListener(scope, () => {
      timer ??= setTimeout(() => {
        timer = undefined;
        void revalidate();
      }, 100);
    });
    return () => {
      clearTimeout(timer);
      events.close();
    };
  }, [revalidate, scope]);
}
