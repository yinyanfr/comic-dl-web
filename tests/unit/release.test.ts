import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const execute = promisify(execFile);
const versionScript = resolve(".github/scripts/release-version.mjs");
const notesScript = resolve(".github/scripts/release-notes.mjs");

async function fixture(
  run: (directory: string, before: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "comic-dl-web-release-"));
  const git = (...args: string[]) => execute("git", args, { cwd: directory });
  try {
    await git("init", "--initial-branch=main");
    await git("config", "user.name", "Release test");
    await git("config", "user.email", "release@example.invalid");
    await writeFile(join(directory, "package.json"), '{"version":"0.0.0"}');
    await git("add", "package.json");
    await git("commit", "-m", "Previous version");
    const { stdout } = await git("rev-parse", "HEAD");
    await run(directory, stdout.trim());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function setVersion(
  directory: string,
  version: string,
  lockVersion = version,
) {
  await writeFile(join(directory, "package.json"), JSON.stringify({ version }));
  await writeFile(
    join(directory, "package-lock.json"),
    JSON.stringify({
      version: lockVersion,
      packages: { "": { version: lockVersion } },
    }),
  );
}

function detect(directory: string, before: string) {
  return execute(process.execPath, [versionScript], {
    cwd: directory,
    env: {
      ...process.env,
      BEFORE: before,
      GITHUB_OUTPUT: join(directory, "output"),
    },
  });
}

test("release detection skips unchanged versions and validates the previous commit", async () => {
  await fixture(async (directory, before) => {
    expect((await detect(directory, before)).stdout).toContain("no release");
    await expect(readFile(join(directory, "output"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(detect(directory, "0".repeat(40))).rejects.toThrow(
      "previous main commit",
    );
  });
});

test("release detection emits stable and prerelease versions with matching locks", async () => {
  await fixture(async (directory, before) => {
    await setVersion(directory, "0.1.0");
    await detect(directory, before);
    expect(await readFile(join(directory, "output"), "utf8")).toBe(
      "version=0.1.0\ntag=v0.1.0\nprerelease=false\n",
    );
    await setVersion(directory, "0.2.0-rc.1");
    await detect(directory, before);
    expect(await readFile(join(directory, "output"), "utf8")).toContain(
      "version=0.2.0-rc.1\ntag=v0.2.0-rc.1\nprerelease=true\n",
    );
  });
});

test("release detection rejects invalid versions, mismatched locks, and reused tags", async () => {
  await fixture(async (directory, before) => {
    for (const version of [
      "01.0.0",
      "0.1.0-01",
      "0.1.0+build",
      "not-a-version",
    ]) {
      await setVersion(directory, version);
      await expect(detect(directory, before)).rejects.toThrow("SemVer");
    }
    await setVersion(directory, "0.1.0", "0.0.0");
    await expect(detect(directory, before)).rejects.toThrow(
      "versions must match",
    );
    await setVersion(directory, "0.1.0");
    await execute("git", ["tag", "v0.1.0"], { cwd: directory });
    await execute("git", ["commit", "--allow-empty", "-m", "New commit"], {
      cwd: directory,
    });
    await expect(detect(directory, before)).rejects.toThrow("different commit");
  });
});

test("release notes extract only the selected entry and reject incomplete entries", async () => {
  await fixture(async (directory) => {
    const run = () =>
      execute(process.execPath, [notesScript, "0.1.0"], { cwd: directory });
    const entry =
      "## 0.1.0 — 2026-11-28\n\nFirst release.\n\n### Features\n\n- Shelf.\n";
    await writeFile(
      join(directory, "CHANGELOG.md"),
      `# Changelog\n\n${entry}\n## 0.0.0 — 2026-11-27\n\nOld release.\n`,
    );
    const { stdout } = await run();
    expect(stdout).toContain("First release.");
    expect(stdout).toContain("/blob/v0.1.0/CHANGELOG.md");
    expect(stdout).not.toContain("Old release.");
    for (const content of [
      "# Changelog\n",
      entry + entry,
      "## 0.1.0 — invalid\n\nSummary.\n\n### Features\n\n- Feature.\n",
      "## 0.1.0 — 2026-11-28\n\n### Features\n\n- Feature.\n",
      "## 0.1.0 — 2026-11-28\n\nSummary.\n\n### Features\n",
    ]) {
      await writeFile(join(directory, "CHANGELOG.md"), content);
      await expect(run()).rejects.toThrow();
    }
  });
});

test("the current package and lockfile have complete English release notes", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  expect(lock.version).toBe(manifest.version);
  expect(lock.packages[""].version).toBe(manifest.version);
  const { stdout } = await execute(process.execPath, [
    notesScript,
    manifest.version,
  ]);
  expect(stdout).toContain(`Release Notes: ${manifest.version}`);
  expect(stdout).toContain("### Compatibility, upgrades, and known limits");
  expect(stdout).not.toMatch(/\p{Script=Han}/u);
});
