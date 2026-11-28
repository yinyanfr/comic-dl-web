// A local HTTP check, not a source-site, output-mount or watcher health probe.
// The public installation manifest requires no administrator credentials.
import process from "node:process";

const { fetch, AbortSignal } = globalThis;

try {
  const response = await fetch(
    `http://127.0.0.1:${process.env.PORT ?? "3000"}/manifest.webmanifest`,
    { signal: AbortSignal.timeout(4000), redirect: "error" },
  );
  if (!response.ok || (await response.json()).name !== "comic-dl-web") {
    process.exitCode = 1;
  }
} catch {
  process.exitCode = 1;
}
