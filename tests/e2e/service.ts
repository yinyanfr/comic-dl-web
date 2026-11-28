import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { expect } from "@playwright/test";

export async function archiveFiles(directory: string) {
  const files: string[] = [];
  async function visit(relative: string) {
    const entries = await readdir(join(directory, relative), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const name = join(relative, entry.name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile() && /\.(cbz|zip)$/.test(entry.name))
        files.push(name);
    }
  }
  await visit("");
  return files;
}

export function testServices(directory: string) {
  const servers = new Set<() => Promise<void>>();

  return {
    async start(environment: NodeJS.ProcessEnv = {}) {
      await mkdir(join(directory, "archives"), { recursive: true });
      const child = spawn(process.execPath, ["server.ts"], {
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: "0",
          NODE_ENV: "test",
          COMIC_DL_WEB_FIXTURE: "0",
          COMIC_DL_WEB_EXTENSIONS: "",
          COMIC_DL_WEB_EXTENSION_DIR: join(directory, "extensions"),
          COMIC_DL_WEB_SOURCE_STATE: join(directory, "sources.json"),
          COMIC_DL_WEB_SHELF: join(directory, "shelf.sqlite"),
          COMIC_DL_WEB_OUTPUT: join(directory, "archives"),
          COMIC_DL_WEB_WATCH_INTERVAL: "1",
          COMIC_DL_WEB_OUTPUT_MARKER: undefined,
          COMIC_DL_WEB_ADMIN_ORIGIN: undefined,
          COMIC_DL_WEB_ADMIN_PASSWORD: undefined,
          COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT: "0",
          ...environment,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
      });
      const exited = once(child, "exit");
      const stop = async () => {
        servers.delete(stop);
        child.kill("SIGTERM");
        try {
          const [code, signal] = await Promise.race([
            exited,
            once(child, "exit", { signal: AbortSignal.timeout(10_000) }),
          ]);
          expect([code, signal], stderr).toEqual([0, null]);
        } finally {
          child.kill("SIGKILL");
        }
      };
      servers.add(stop);
      const lines = createInterface({ input: child.stdout });
      const url = await Promise.race([
        (async () => {
          for await (const line of lines) {
            const match = /^comic-dl-web: (http:\/\/127\.0\.0\.1:\d+)$/.exec(
              line,
            );
            if (match) return match[1];
          }
          throw new Error(`Service stopped before listening: ${stderr}`);
        })(),
        exited.then(() => {
          throw new Error(`Service stopped before listening: ${stderr}`);
        }),
      ]);
      return { url, stop };
    },
    async stopServers() {
      await Promise.all([...servers].map((stop) => stop()));
    },
  };
}
