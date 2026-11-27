import { data } from "react-router";
import { readShelf, shelfPage } from "../shelf.server";
import type { Route } from "./+types/task-status";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { downloadQueue, shelfWatcher } = context.comics;
  const headers = { "Cache-Control": "no-store" };
  if (new URL(request.url).searchParams.get("scope") === "shelf") {
    const requestedPage = shelfPage(request);
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
