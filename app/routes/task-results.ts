import { data } from "react-router";
import { comicsContext } from "../comic-runtime.server";
import type { Route } from "./+types/task-results";

export function loader({ params, context, url }: Route.LoaderArgs) {
  const requested = Number(url.searchParams.get("offset") ?? 0);
  const offset =
    Number.isSafeInteger(requested) && requested >= 0 ? requested : 0;
  return data(
    context.get(comicsContext).downloadQueue.results(params.id, offset) ?? null,
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
