import { redirect } from "react-router";
import { comicsContext } from "../comic-runtime.server";
import { handleShelfAction } from "../shelf.server";
import type { Route } from "./+types/shelf-legacy";

export function loader({ url }: Route.LoaderArgs) {
  return redirect(`/${url.search}`);
}

export function action({ request, context }: Route.ActionArgs) {
  return handleShelfAction(request, context.get(comicsContext));
}
