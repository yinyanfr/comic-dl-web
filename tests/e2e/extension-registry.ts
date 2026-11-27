import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";

export const testPackage = "@fixture/catalog-source";

export async function startExtensionRegistry(directory: string) {
  const bundles = await Promise.all(
    ["1.0.0", "1.1.0", "2.0.0"].map(async (version) => {
      const project = join(directory, version);
      await mkdir(project, { recursive: true });
      const manifest = {
        name: testPackage,
        version,
        type: "module",
        exports: "./index.mjs",
      };
      await Promise.all([
        writeFile(join(project, "package.json"), JSON.stringify(manifest)),
        copyFile(
          "tests/fixtures/catalog-extension.mjs",
          join(project, "index.mjs"),
        ),
        copyFile("tests/fixtures/comics/blue.png", join(project, "blue.png")),
      ]);
      const { stdout } = await promisify(execFile)(
        "npm",
        ["pack", "--json", "--ignore-scripts"],
        { cwd: project },
      );
      const [bundle] = JSON.parse(stdout) as [{ filename: string }];
      const tarball = await readFile(join(project, bundle.filename));
      return {
        manifest,
        tarball,
        integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
      };
    }),
  );

  let updated = false;
  let updateGate: { requested: () => void; release: Promise<void> } | undefined;
  const registry = createServer((request, response) => {
    const path = decodeURIComponent(request.url ?? "");
    if (path === `/${testPackage}`) {
      if (updated && updateGate) {
        updateGate.requested();
        void updateGate.release.then(sendMetadata);
      } else {
        sendMetadata();
      }
      return;
    }

    function sendMetadata() {
      const available = updated ? bundles : bundles.slice(0, 1);
      const versions = Object.fromEntries(
        available.map(({ manifest, integrity }) => [
          manifest.version,
          {
            ...manifest,
            dist: { integrity, tarball: `${url}/${manifest.version}.tgz` },
          },
        ]),
      );
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(
        JSON.stringify({
          name: testPackage,
          "dist-tags": { latest: updated ? "2.0.0" : "1.0.0" },
          versions,
        }),
      );
    }
    const artifact = bundles.find(
      ({ manifest }) => path === `/${manifest.version}.tgz`,
    );
    response.writeHead(artifact ? 200 : 404, {
      "Content-Type": artifact
        ? "application/octet-stream"
        : "application/json",
    });
    response.end(artifact?.tarball ?? '{"error":"Not found"}');
  });
  registry.listen(0, "127.0.0.1");
  await once(registry, "listening");
  const address = registry.address();
  if (!address || typeof address === "string")
    throw new Error("Test registry has no TCP address");
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    publishUpdate() {
      updated = true;
    },
    holdUpdate() {
      const requested = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      updateGate = { requested: requested.resolve, release: release.promise };
      return {
        requested: requested.promise,
        release() {
          updateGate = undefined;
          release.resolve();
        },
      };
    },
    async stop() {
      const closed = once(registry, "close");
      registry.close();
      registry.closeAllConnections();
      await closed;
    },
  };
}
