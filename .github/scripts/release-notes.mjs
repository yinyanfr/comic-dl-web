import { readFileSync } from "node:fs";
import process from "node:process";

const version = process.argv[2];
if (!version) {
  throw new Error("Usage: node .github/scripts/release-notes.mjs <version>");
}
const prefix = `${version} — `;
const entries = readFileSync("CHANGELOG.md", "utf8")
  .split(/^## /mu)
  .slice(1)
  .filter((entry) => entry.startsWith(prefix));
if (entries.length !== 1) {
  throw new Error(`Expected one "## ${version} — YYYY-MM-DD" changelog entry.`);
}
const [heading, ...lines] = entries[0].split(/\r?\n/u);
const date = heading.slice(prefix.length).trim();
const body = lines.join("\n").trim();
const [summary, ...sections] = body.split(/^### \S.*$/mu);
if (
  !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
  !summary.trim() ||
  sections.length === 0 ||
  sections.some((section) => !section.trim())
) {
  throw new Error(
    "Release notes need a date, a summary, and non-empty sections.",
  );
}
process.stdout.write(
  `## Release Notes: ${version}\n\n\`${date}\`\n\n${body}\n\n[Full changelog](https://github.com/yinyanfr/comic-dl-web/blob/v${encodeURIComponent(version)}/CHANGELOG.md)\n`,
);
