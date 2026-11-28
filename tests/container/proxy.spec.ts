import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execute = promisify(execFile);
const docker = async (...args: string[]) =>
  (await execute("docker", args, { timeout: 110_000 })).stdout.trim();

// Self-signed certificates are for this isolated test only, not deployment.
test.use({ ignoreHTTPSErrors: true });

test("HTTPS 代理示例支持登录、Origin 校验、Secure Cookie 和 SSE", async ({
  page,
  context,
}, info) => {
  const directory = resolve(info.outputPath("proxy"));
  const data = join(directory, "data");
  const output = join(directory, "downloads");
  await mkdir(data, { recursive: true });
  await mkdir(output, { recursive: true });
  await execute("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(directory, "tls.key"),
    "-out",
    join(directory, "tls.crt"),
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ]);
  const prefix = `comic-dl-web-proxy-${randomUUID()}`;
  const app = `${prefix}-app`;
  const proxy = `${prefix}-nginx`;
  const image = process.env.CONTAINER_IMAGE ?? "comic-dl-web:test";
  const proxyImage = process.env.PROXY_IMAGE ?? "nginx:1.30.8-alpine";
  const config = (await readFile("deploy/nginx.conf", "utf8"))
    .replace("http://127.0.0.1:3000", `http://${app}:3000`)
    .replaceAll("/etc/nginx/certs/comics.example.com.", "/certs/tls.");
  await writeFile(join(directory, "default.conf"), config);
  // Reserve an unused host port before configuring the exact browser Origin.
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  const port = address.port;
  await new Promise<void>((done) => reservation.close(() => done()));
  const url = `https://127.0.0.1:${port}`;
  const containers: string[] = [];
  let networkCreated = false;
  try {
    await docker("network", "create", prefix);
    networkCreated = true;
    await docker(
      "run",
      "--detach",
      "--name",
      app,
      "--network",
      prefix,
      "--init",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,size=512m,mode=1777",
      "--user",
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      "--mount",
      `type=bind,source=${data},target=/data`,
      "--mount",
      `type=bind,source=${output},target=/downloads`,
      "--env",
      "COMIC_DL_WEB_ADMIN_PASSWORD=proxy-test-password",
      "--env",
      `COMIC_DL_WEB_ADMIN_ORIGIN=${url}`,
      "--env",
      "COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT=1",
      "--health-interval=1s",
      "--health-start-period=5s",
      image,
    );
    containers.push(app);
    await expect
      .poll(() => docker("inspect", "--format={{.State.Health.Status}}", app), {
        timeout: 30_000,
      })
      .toBe("healthy");
    await docker(
      "run",
      "--detach",
      "--name",
      proxy,
      "--network",
      prefix,
      "--publish",
      `127.0.0.1:${port}:443`,
      "--mount",
      `type=bind,source=${directory},target=/certs,readonly`,
      "--mount",
      `type=bind,source=${join(directory, "default.conf")},target=/etc/nginx/conf.d/default.conf,readonly`,
      proxyImage,
    );
    containers.push(proxy);
    await docker("exec", proxy, "nginx", "-t");
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: "管理员登录" }),
    ).toBeVisible();
    expect((await page.request.get(`${url}/tasks/status`)).status()).toBe(401);
    expect(
      (await page.request.get(`${url}/manifest.webmanifest`)).status(),
    ).toBe(200);
    await page
      .getByLabel("管理员密码", { exact: true })
      .fill("proxy-test-password");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "书架", exact: true }),
    ).toBeVisible();
    const cookie = (await context.cookies()).find(
      ({ name }) => name === "comic_dl_web_session",
    );
    expect(cookie).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
    });
    await page.goto(`${url}/settings`);
    await page.getByLabel("追更间隔（秒）").fill("30");
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await expect(page.getByText("服务设置已生效。")).toBeVisible();
    const denied = await page.request.post(`${url}/settings`, {
      headers: { Origin: "https://other.example" },
      form: { intent: "save", folder: "", intervalSeconds: "30" },
    });
    expect([400, 403]).toContain(denied.status());
    for (let attempt = 0; attempt < 2; attempt++) {
      const stream = await page.evaluate(async () => {
        const response = await fetch("/tasks/events", {
          signal: AbortSignal.timeout(5000),
        });
        const reader = response.body!.getReader();
        const first = await reader.read();
        await reader.cancel();
        return {
          type: response.headers.get("content-type"),
          text: new TextDecoder().decode(first.value),
        };
      });
      expect(stream.type).toContain("text/event-stream");
      expect(stream.text).toContain("event: tasks");
    }
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "管理员登录" }),
    ).toBeVisible();
    expect((await page.request.get(`${url}/tasks/status`)).status()).toBe(401);
    await docker("stop", "--time=90", app);
    expect(await docker("inspect", "--format={{.State.ExitCode}}", app)).toBe(
      "0",
    );
  } finally {
    for (const name of containers.reverse()) {
      try {
        if (info.status !== info.expectedStatus) {
          await info.attach(`${name}.log`, {
            body: await docker("logs", name).catch(
              () => "Could not read logs.",
            ),
            contentType: "text/plain",
          });
        }
      } finally {
        await docker("rm", "--force", name);
      }
    }
    if (networkCreated) await docker("network", "rm", prefix);
  }
});
