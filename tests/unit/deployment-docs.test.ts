import { readFile, readdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test } from "vitest";

const languages = ["", "en/", "ja/"];

test("主站的三语使用／部署文档有 frontmatter，且应用变量清单一致", async () => {
  const deployments: string[][] = [];
  for (const language of languages) {
    for (const page of ["usage", "deployment"]) {
      const path = `docs/${language}webui/${page}.md`;
      const text = await readFile(path, "utf8");
      expect(text, path).toMatch(/^---\ntitle: .+\ndescription: .+\n---\n/);
      expect(text, path).toContain(
        page === "usage" ? "(deployment.md)" : "(usage.md)",
      );
      if (page === "deployment") {
        deployments.push(
          [...new Set(text.match(/COMIC_DL_WEB_[A-Z_]+/g))].sort(),
        );
        expect(text, path).toContain("ghcr.io/yinyanfr/comic-dl-web");
        expect(text, path).toContain("linux/amd64");
        expect(text, path).toContain("linux/arm64");
        expect(text, path).toContain("COMIC_DL_WEB_ADMIN_ORIGIN");
        expect(text, path).toContain("compose.override.yaml");
      }
    }
  }
  expect(deployments[1]).toEqual(deployments[0]);
  expect(deployments[2]).toEqual(deployments[0]);
});

test("README 与静态文档的本地链接不指向不存在的文件", async () => {
  const files = [
    "README.md",
    ...(await readdir("docs", { recursive: true }))
      .filter((file) => file.endsWith(".md"))
      .map((file) => `docs/${file}`),
  ];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const [, href] of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|#)/.test(href)) continue;
      const target = href.split("#")[0];
      await expect(
        access(resolve(dirname(file), target)),
        `${file}: ${href}`,
      ).resolves.toBeUndefined();
    }
  }
  const readme = await readFile("README.md", "utf8");
  for (const page of ["usage", "deployment"]) {
    expect(readme).toContain(
      `https://yinyanfr.github.io/comic-dl/webui/${page}/`,
    );
  }
});
