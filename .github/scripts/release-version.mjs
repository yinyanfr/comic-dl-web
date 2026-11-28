import { execFileSync } from "node:child_process";
import { log } from "node:console";
import { appendFileSync, readFileSync } from "node:fs";
import process from "node:process";

const before = process.env.BEFORE;
if (!before || !/^[0-9a-f]{40}$/.test(before) || /^0+$/.test(before)) {
  throw new Error("BEFORE must identify the previous main commit.");
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const previous = JSON.parse(git("show", `${before}:package.json`));
const { version } = JSON.parse(readFileSync("package.json", "utf8"));

if (version === previous.version) {
  log(`Version remains ${version}; no release.`);
} else {
  // Build metadata is deliberately excluded: '+' is not valid in Docker tags.
  const numeric = "(?:0|[1-9][0-9]*)";
  const identifier = `(?:${numeric}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
  const semver = new RegExp(
    `^${numeric}\\.${numeric}\\.${numeric}(?:-${identifier}(?:\\.${identifier})*)?$`,
  );
  if (
    typeof version !== "string" ||
    !semver.test(version) ||
    version.length > 128
  ) {
    throw new Error("Release version must be SemVer without build metadata.");
  }
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  if (lock.version !== version || lock.packages?.[""]?.version !== version) {
    throw new Error("package.json and package-lock.json versions must match.");
  }
  const tag = `v${version}`;
  const tags = git("tag", "--list", tag);
  if (
    tags &&
    git("rev-parse", `${tag}^{commit}`) !== git("rev-parse", "HEAD")
  ) {
    throw new Error(
      `${tag} already points to a different commit; bump the version.`,
    );
  }
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\ntag=${tag}\nprerelease=${version.includes("-")}\n`,
  );
}
