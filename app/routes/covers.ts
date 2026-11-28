import { comicsContext } from "../comic-runtime.server";
import { resolveDownloadInput } from "../downloader.server";
import { findShelfWork } from "../shelf.server";
import { reusableWebUrl, sourceId, workInput } from "../source-input.server";
import type { Route } from "./+types/covers";

export async function loader({ request, url, context }: Route.LoaderArgs) {
  const entryId = url.searchParams.get("entry");
  const entry = entryId
    ? await findShelfWork({ id: entryId }).catch(() => undefined)
    : undefined;
  const source = sourceId.safeParse(
    entry?.sourceId ?? url.searchParams.get("source"),
  ).data;
  const id = url.searchParams.get("id");
  const input = workInput.safeParse(
    entry?.input ?? url.searchParams.get("input"),
  ).data;
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (
    !source ||
    (entryId && !entry) ||
    (!id && !input) ||
    (id && id.length > 4096) ||
    (input && URL.canParse(input) && !reusableWebUrl(input))
  )
    return new Response(null, { status: 400, headers });
  try {
    const image = await context
      .get(comicsContext)
      .withDownloader(async (downloader) => {
        const signal = AbortSignal.any([
          request.signal,
          AbortSignal.timeout(15_000),
        ]);
        let coverId = id;
        if (!coverId && input) {
          const { locator } = resolveDownloadInput(
            downloader,
            input,
            "series",
            source,
          );
          const series = await downloader.list(locator, { source, signal });
          if (entry && series.id !== entry.workId)
            throw new Error("Wrong work");
          coverId = series.metadata?.coverId ?? null;
          if (!coverId) {
            const coverUrl = series.metadata?.coverUrl;
            if (
              !coverUrl ||
              coverUrl.length > 4096 ||
              !reusableWebUrl(coverUrl)
            )
              throw new Error("No public cover");
            return new Response(null, {
              status: 302,
              headers: {
                ...headers,
                Location: coverUrl,
                "Referrer-Policy": "no-referrer",
              },
            });
          }
        }
        if (!coverId) throw new Error("No cover");
        return downloader.readCover(coverId, { source, signal });
      }, request.signal);
    if (image instanceof Response) return image;
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/avif",
      ].includes(image.contentType)
    )
      return new Response(null, { status: 415, headers });
    return new Response(new Uint8Array(image.bytes), {
      headers: { ...headers, "Content-Type": image.contentType },
    });
  } catch {
    return new Response(null, { status: 404, headers });
  }
}
