import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execute = promisify(execFile);

test("Compose 示例拒绝缺失路径和空密码，按非 root 身份启动并正常停止", async ({
  page,
}, info) => {
  const project = `comic-dl-web-compose-${randomUUID()}`;
  const root = resolve(info.outputPath("volumes"));
  const data = join(root, "data");
  const output = join(root, "downloads");
  await mkdir(output, { recursive: true });
  const environment = {
    ...process.env,
    IMAGE: process.env.CONTAINER_IMAGE ?? "comic-dl-web:test",
    LOCAL_UID: String(process.getuid?.() ?? 1000),
    LOCAL_GID: String(process.getgid?.() ?? 1000),
    DATA_DIRECTORY: data,
    DOWNLOAD_DIRECTORY: output,
    BIND_ADDRESS: "127.0.0.1",
    WEB_PORT: "0",
    COMIC_DL_WEB_ADMIN_PASSWORD: "compose-test-password",
    COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT: "0",
    COMIC_DL_WEB_WATCH_INTERVAL: "3600",
  };
  const args = [
    "compose",
    "--project-name",
    project,
    "--env-file",
    "/dev/null",
    "--file",
    resolve("compose.yaml"),
  ];
  const compose = async (...command: string[]) =>
    (
      await execute("docker", [...args, ...command], {
        env: environment,
        timeout: 110_000,
      })
    ).stdout.trim();
  const docker = async (...command: string[]) =>
    (await execute("docker", command, { timeout: 110_000 })).stdout.trim();
  try {
    await expect(
      execute("docker", [...args, "config", "--quiet"], {
        env: { ...environment, COMIC_DL_WEB_ADMIN_PASSWORD: "" },
      }),
    ).rejects.toThrow();
    await expect(compose("up", "--detach", "--pull=never")).rejects.toThrow();
    await expect(stat(data)).rejects.toMatchObject({ code: "ENOENT" });
    await mkdir(data, { recursive: true });
    await compose("up", "--wait", "--wait-timeout=60", "--pull=never");
    const id = await compose("ps", "--quiet", "comic-dl-web");
    expect(await docker("exec", id, "id", "-u")).toBe(environment.LOCAL_UID);
    expect(
      await docker("inspect", "--format={{.HostConfig.ReadonlyRootfs}}", id),
    ).toBe("true");
    const url = `http://${await compose("port", "comic-dl-web", "3000")}`;
    await page.goto(url);
    await page
      .getByLabel("管理员密码", { exact: true })
      .fill("compose-test-password");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "书架", exact: true }),
    ).toBeVisible();
    await compose("stop");
    expect(await docker("inspect", "--format={{.State.ExitCode}}", id)).toBe(
      "0",
    );
  } finally {
    try {
      if (info.status !== info.expectedStatus) {
        await info.attach("compose.log", {
          body: await compose("logs", "--no-color").catch(
            () => "Could not read logs.",
          ),
          contentType: "text/plain",
        });
      }
    } finally {
      await compose("down");
    }
  }
});
