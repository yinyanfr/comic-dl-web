import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { archiveFiles } from "../e2e/service";
import { startExtensionRegistry, testPackage } from "../e2e/extension-registry";

const execute = promisify(execFile);
const image = process.env.CONTAINER_IMAGE ?? "comic-dl-web:test";
const docker = async (...args: string[]) =>
  (await execute("docker", args, { timeout: 110_000 })).stdout.trim();

for (const fixture of [false, true]) {
  test(`容器运行与持久化（${fixture ? "显式离线测试源" : "生产配置"}）`, async ({
    page,
    context,
  }, info) => {
    const root = resolve(info.outputPath("volumes"));
    const data = join(root, "data");
    const output = join(root, "downloads");
    const comics = join(root, "fixture");
    await mkdir(data, { recursive: true });
    await mkdir(output, { recursive: true });
    if (fixture) await cp("tests/fixtures/comics", comics, { recursive: true });
    const name = `comic-dl-web-test-${randomUUID()}`;
    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    expect(uid, "Run container acceptance as a non-root host user.").not.toBe(
      0,
    );
    const registry = fixture
      ? undefined
      : await startExtensionRegistry(info.outputPath("registry"), {
          host: "0.0.0.0",
          advertisedHost: "host.docker.internal",
        });
    const args = [
      "--name",
      name,
      "--detach",
      "--init",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,size=512m,mode=1777",
      "--user",
      `${uid}:${gid}`,
      "--publish",
      "127.0.0.1::3000",
      "--health-interval=1s",
      "--health-start-period=5s",
      "--mount",
      `type=bind,source=${data},target=/data`,
      "--mount",
      `type=bind,source=${output},target=/downloads`,
      "--env",
      "COMIC_DL_WEB_ADMIN_PASSWORD=container-test-password",
      "--env",
      "COMIC_DL_WEB_ENABLE_EXTENSION_MANAGEMENT=1",
      "--env",
      "COMIC_DL_WEB_WATCH_INTERVAL=1",
      ...(registry
        ? [
            "--add-host",
            "host.docker.internal:host-gateway",
            "--env",
            `npm_config_registry=${registry.url}`,
            "--env",
            "npm_config_update_notifier=false",
          ]
        : []),
      ...(fixture
        ? [
            "--env",
            "NODE_ENV=test",
            "--env",
            "COMIC_DL_WEB_FIXTURE=1",
            "--env",
            "COMIC_DL_WEB_FIXTURE_DIR=/fixture",
            "--mount",
            `type=bind,source=${comics},target=/fixture,readonly`,
          ]
        : []),
      image,
    ];
    let created = false;
    async function start() {
      await docker("run", ...args);
      created = true;
      await expect
        .poll(
          () => docker("inspect", "--format={{.State.Health.Status}}", name),
          { timeout: 30_000 },
        )
        .toBe("healthy");
      return `http://${await docker("port", name, "3000/tcp")}`;
    }
    async function stop() {
      await docker("stop", "--time=90", name);
      expect(
        await docker("inspect", "--format={{.State.ExitCode}}", name),
      ).toBe("0");
      await docker("rm", name);
      created = false;
    }
    async function login(url: string) {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: "管理员登录" }),
      ).toBeVisible();
      await page
        .getByLabel("管理员密码", { exact: true })
        .fill("container-test-password");
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "书架", exact: true }),
      ).toBeVisible();
    }
    try {
      expect(
        await docker("image", "inspect", "--format={{.Config.User}}", image),
      ).toBe("node");
      let url = await start();
      expect(await docker("exec", name, "id", "-u")).toBe(String(uid));
      await docker(
        "exec",
        name,
        "node",
        "--input-type=module",
        "-e",
        "for (const p of ['vite','@react-router/dev','vitest','typescript','comic-dl-v3']) { try { import.meta.resolve(p); process.exit(1); } catch {} }",
      );
      expect((await page.request.get(`${url}/tasks/status`)).status()).toBe(
        401,
      );
      expect(
        (await page.request.get(`${url}/manifest.webmanifest`)).status(),
      ).toBe(200);
      await login(url);
      await page.goto(`${url}/settings`);
      await page.getByLabel("追更间隔（秒）").fill("2");
      await page.getByRole("button", { name: "保存设置", exact: true }).click();
      await expect(page.getByText("服务设置已生效。")).toBeVisible();
      expect((await stat(join(data, "sources.json"))).mode & 0o777).toBe(0o600);
      await docker(
        "exec",
        name,
        "node",
        "-e",
        "const fs = require('node:fs'); fs.mkdirSync('/data/extensions', { recursive: true }); fs.writeFileSync('/data/extensions/.acceptance-marker', 'persistent');",
      );
      if (registry) {
        await page.goto(`${url}/extensions`);
        const name = page.getByRole("textbox", {
          name: "npm 包名",
          exact: true,
        });
        const install = page.locator("form").filter({ has: name });
        await name.fill(testPackage);
        await install.getByLabel("版本范围或标签（可选）").fill("^1.0.0");
        await install.getByLabel("我信任此发布者").check();
        await install
          .getByRole("button", { name: "安装", exact: true })
          .click();
        await expect(
          page.getByRole("article", { name: "来源 catalog-test" }),
        ).toBeVisible();
      }
      if (fixture) {
        await page.goto(`${url}/downloads?source=fixture&input=demo`);
        await page
          .getByRole("button", { name: "查看章节", exact: true })
          .click();
        await page
          .getByRole("button", { name: "加入书架", exact: true })
          .click();
        await expect(page.getByRole("status")).toHaveText("作品已在书架中。");
        await page.goto(url);
        const work = page.getByRole("article", { name: "demo · fixture" });
        await work
          .getByRole("button", { name: "开启自动追更", exact: true })
          .click();
        await expect(work.getByText("检查结果：成功")).toBeVisible();
        expect(await archiveFiles(output)).toEqual([]);
        await page.close();
        const manifestPath = join(comics, "series.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        manifest.chapters.push({
          id: "container-new",
          title: "容器新章",
          pages: ["blue.png", "gold.png"],
        });
        await writeFile(manifestPath, JSON.stringify(manifest));
        await expect
          .poll(() => archiveFiles(output), { timeout: 30_000 })
          .toHaveLength(1);
        page = await context.newPage();
      }
      const archives = await archiveFiles(output);
      const mtimes = await Promise.all(
        archives.map(async (file) => (await stat(join(output, file))).mtimeMs),
      );
      await stop();
      url = await start();
      // New container, same bind mounts; process-local logins are invalidated.
      await context.clearCookies();
      await login(url);
      await page.goto(`${url}/settings`);
      await expect(page.getByLabel("追更间隔（秒）")).toHaveValue("2");
      expect(
        await readFile(join(data, "extensions/.acceptance-marker"), "utf8"),
      ).toBe("persistent");
      expect(await archiveFiles(output)).toEqual(archives);
      expect(
        await Promise.all(
          archives.map(
            async (file) => (await stat(join(output, file))).mtimeMs,
          ),
        ),
      ).toEqual(mtimes);
      if (fixture) {
        await page.goto(url);
        await expect(
          page.getByRole("article", { name: "demo · fixture" }),
        ).toBeVisible();
        await expect(
          page.getByText("自动检查开启 · 自动下载开启", { exact: true }),
        ).toBeVisible();
        await expect(page.getByText("待处理 0 章 · 已完成 1 章")).toBeVisible();
      }
      if (registry) {
        const catalog = `${url}/catalog?source=catalog-test`;
        expect(await (await page.request.get(catalog)).text()).toContain(
          "1.0.0 default browse default all 1",
        );
        registry.publishUpdate();
        await page.goto(`${url}/extensions`);
        const global = page.getByRole("region", { name: "全局扩展管理" });
        await global
          .getByRole("button", { name: "检查全部托管扩展更新" })
          .click();
        await expect(
          global.getByText(`${testPackage} · 1.0.0 → 1.1.0`),
        ).toBeVisible();
        expect(await (await page.request.get(catalog)).text()).toContain(
          "1.0.0 default browse default all 1",
        );
        await global.getByLabel("确认应用全部托管扩展更新").check();
        await global.getByRole("button", { name: "应用全部更新" }).click();
        await expect(global.getByText("扩展操作已完成。")).toBeVisible();
        expect(await (await page.request.get(catalog)).text()).toContain(
          "1.1.0 default browse default all 1",
        );
        const card = page.getByRole("article", { name: testPackage });
        await card.getByRole("button", { name: "卸载", exact: true }).click();
        await expect(card).toHaveCount(0);
      }
      await stop();
    } finally {
      try {
        if (created) {
          await info.attach("container.log", {
            body: await docker("logs", name).catch(
              () => "Could not read logs.",
            ),
            contentType: "text/plain",
          });
          await docker("rm", "--force", name);
        }
      } finally {
        await registry?.stop();
      }
    }
  });
}
