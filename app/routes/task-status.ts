import { data } from "react-router";
import { comicsContext } from "../comic-runtime.server";
import { readShelf, shelfPage } from "../shelf.server";
import type { Route } from "./+types/task-status";

export async function loader({ url, context }: Route.LoaderArgs) {
  const { downloadQueue, shelfWatcher } = context.get(comicsContext);
  const headers = { "Cache-Control": "no-store" };
  if (url.searchParams.get("scope") === "shelf") {
    const requestedPage = shelfPage(url);
    const shelf = await readShelf(requestedPage).catch(() => null);
    return data(
      {
        scope: "shelf" as const,
        requestedPage,
        shelf,
        watcher: shelfWatcher.snapshot(),
      },
      { headers },
    );
  }
  return data(
    { scope: "tasks" as const, tasks: downloadQueue.snapshot() },
    { headers },
  );
}
