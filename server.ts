import { createServer } from "node:http";
import process from "node:process";
import type { ServerBuild } from "react-router";

const development = process.argv.includes("--dev");
process.env.NODE_ENV ??= development ? "development" : "production";
const [{ createRequestHandler }, { default: express }] = await Promise.all([
  import("@react-router/express"),
  import("express"),
]);
const app = express();
app.disable("x-powered-by");
const server = createServer(app);

const vite = development ? await startVite() : undefined;
const { adminOrigin } = await import("./app/downloader.server.ts");

function allowProxyOrigin(build: ServerBuild): ServerBuild {
  return adminOrigin
    ? { ...build, allowedActionOrigins: [new URL(adminOrigin).host] }
    : build;
}

async function startVite() {
  const signals = ["SIGTERM", "SIGINT"] as const;
  const existing = signals.map((signal) => new Set(process.listeners(signal)));
  const { createServer, isRunnableDevEnvironment } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "custom",
  });
  const ssr = vite.environments.ssr;
  if (!isRunnableDevEnvironment(ssr)) {
    throw new Error("The Vite SSR environment must support a module runner.");
  }
  // React Router creates internal Vite servers whose signal handlers can exit
  // before the watcher finishes. Closing the outer server also closes them.
  for (const [index, signal] of signals.entries()) {
    for (const listener of process.listeners(signal)) {
      if (!existing[index].has(listener)) process.off(signal, listener);
    }
  }
  return { vite, ssr };
}
let build: ServerBuild | (() => Promise<ServerBuild>);
if (vite) {
  app.use(vite.vite.middlewares);
  build = async () =>
    allowProxyOrigin(
      (await vite.ssr.runner.import(
        "virtual:react-router/server-build",
      )) as ServerBuild,
    );
} else {
  const serverBuild = new URL("./build/server/index.js", import.meta.url);
  build = allowProxyOrigin((await import(serverBuild.href)) as ServerBuild);
  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
  );
  app.use(express.static("build/client"));
}

const { comicsContext, createComicRuntime } =
  await import("./app/comic-runtime.server.ts");
const { RouterContextProvider } = await import("react-router");
const comics = await createComicRuntime();
app.all(
  "*",
  createRequestHandler({
    build,
    getLoadContext: () => {
      const context = new RouterContextProvider();
      context.set(comicsContext, comics);
      return context;
    },
    mode: process.env.NODE_ENV,
  }),
);

const port = Number(process.env.PORT ?? (development ? 5173 : 3000));
const host = process.env.HOST ?? "127.0.0.1";
server.listen(port, host, () => {
  const address = server.address();
  if (address && typeof address !== "string") {
    const hostname = address.family === "IPv6" ? `[${host}]` : host;
    console.log(`comic-dl-web: http://${hostname}:${address.port}`);
  }
});

async function shutdown() {
  server.close();
  server.closeAllConnections();
  await comics.stop();
  await vite?.vite.close();
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
