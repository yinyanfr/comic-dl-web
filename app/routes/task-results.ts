import { data } from "react-router";
import type { Route } from "./+types/task-results";

export function loader({ params, context, request }: Route.LoaderArgs) {
  const requested = Number(
    new URL(request.url).searchParams.get("offset") ?? 0,
  );
  const offset =
    Number.isSafeInteger(requested) && requested >= 0 ? requested : 0;
  return data(context.comics.downloadQueue.results(params.id, offset) ?? null, {
    headers: { "Cache-Control": "no-store" },
  });
}
