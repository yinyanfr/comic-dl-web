import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execute = promisify(execFile);

test("单文件 Compose 示例拒绝缺失路径，按非 root 身份启动并正常停止", async ({
  page,
}, info) => {
  const project = `comic-dl-web-compose-${randomUUID()}`;
  const root = resolve(info.outputPath("volumes"));
  const data = join(root, "data");
  const output = join(root, "downloads");
  await mkdir(output, { recursive: true });
  const uid = String(process.getuid?.() ?? 1000);
  const gid = String(process.getgid?.() ?? 1000);
  const composeFile = resolve(info.outputPath("docker-compose.yml"));
  const template = await readFile("docker-compose.yml", "utf8");
  await writeFile(
    composeFile,
    template
      .replace(
        "ghcr.io/yinyanfr/comic-dl-web:0.1.0",
        process.env.CONTAINER_IMAGE ?? "comic-dl-web:test",
      )
      .replace('"1000:1000"', `"${uid}:${gid}"`)
      .replace('"127.0.0.1:3000:3000"', '"127.0.0.1:0:3000"')
      .replace("/srv/comic-dl-web/data", JSON.stringify(data))
      .replace("/srv/comics", JSON.stringify(output))
      .replace(
        "replace-with-a-strong-random-password",
        "compose-test-password",
      ),
  );
  const args = [
    "compose",
    "--project-name",
    project,
    "--env-file",
    "/dev/null",
    "--file",
    composeFile,
  ];
  const compose = async (...command: string[]) =>
    (
      await execute("docker", [...args, ...command], {
        timeout: 110_000,
      })
    ).stdout.trim();
  const docker = async (...command: string[]) =>
    (await execute("docker", command, { timeout: 110_000 })).stdout.trim();
  try {
    await compose("config", "--quiet");
    await expect(compose("up", "--detach", "--pull=never")).rejects.toThrow();
    await expect(stat(data)).rejects.toMatchObject({ code: "ENOENT" });
    await mkdir(data, { recursive: true });
    await compose("up", "--wait", "--wait-timeout=60", "--pull=never");
    const id = await compose("ps", "--quiet", "comic-dl-web");
    expect(await docker("exec", id, "id", "-u")).toBe(uid);
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
