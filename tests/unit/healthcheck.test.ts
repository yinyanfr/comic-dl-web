import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import process from "node:process";
import { promisify } from "node:util";
import { expect, test } from "vitest";

test("容器健康检查不需凭据，仅接受预期的安装清单", async () => {
  let status = 200;
  let name = "comic-dl-web";
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    expect(request.headers.cookie).toBeUndefined();
    expect(request.headers.authorization).toBeUndefined();
    response.writeHead(status, {
      "Content-Type": "application/manifest+json",
      ...(status === 302 ? { Location: "/login" } : {}),
    });
    response.end(JSON.stringify({ name }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  const run = () =>
    promisify(execFile)(process.execPath, ["scripts/healthcheck.mjs"], {
      env: { ...process.env, PORT: String(address.port) },
    });
  try {
    await expect(run()).resolves.toMatchObject({ stdout: "", stderr: "" });
    name = "wrong-service";
    await expect(run()).rejects.toMatchObject({ code: 1 });
    name = "comic-dl-web";
    status = 503;
    await expect(run()).rejects.toMatchObject({ code: 1 });
    status = 302;
    await expect(run()).rejects.toMatchObject({ code: 1 });
    expect(requests).toEqual(Array(4).fill("/manifest.webmanifest"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
