import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";
import { expect, test } from "vitest";
import { isLocale, pageTitle, readLocale, translator } from "../../app/i18n";
import { messages } from "../../app/locales/messages";

test("语言 Cookie 只接受已支持的语言；缺省或无效时使用中文", () => {
  expect(readLocale(null)).toBe("zh-CN");
  expect(readLocale("comic_dl_web_language=ja; other=1")).toBe("ja");
  expect(readLocale("other=1; comic_dl_web_language=en")).toBe("en");
  expect(readLocale("comic_dl_web_language=fr")).toBe("zh-CN");
  expect(readLocale("comic_dl_web_language=<script>")).toBe("zh-CN");
  expect(isLocale("en-US")).toBe(false);
});

test("词典保留参数和值，且不递归替换或翻译参数", () => {
  expect(translator("en")("设置")).toBe("Settings");
  expect(translator("ja")("设置")).toBe("設定");
  expect(translator("zh-CN")("设置")).toBe("设置");
  expect(translator("en")("{title} 作品详情", { title: "设置{title}" })).toBe(
    "设置{title} details",
  );
  expect(translator("en")("unknown")).toBe("unknown");
  expect(translator("en")("toString")).toBe("toString");
  expect(pageTitle([{ id: "root", data: { locale: "ja" } }], "书架")).toBe(
    "本棚 · comic-dl-web",
  );
});

test("每个翻译都有中英日文本且完整保留占位符", () => {
  const parameters = (text: string) =>
    [...text.matchAll(/\{\w+\}/g)].map(([value]) => value).sort();
  for (const [key, translations] of Object.entries(messages)) {
    expect(translations).toHaveLength(2);
    for (const text of translations) {
      expect(text.trim().length, key).toBeGreaterThan(0);
      expect(parameters(text), key).toEqual(parameters(key));
    }
  }
});

test("项目 UI 静态文案均在词典中，JSX 不残留未标记的中文", async () => {
  const paths = [
    ...(await readdir("app"))
      .filter((name) => /\.(ts|tsx)$/.test(name))
      .map((name) => `app/${name}`),
    ...(await readdir("app/routes"))
      .filter((name) => /\.(ts|tsx)$/.test(name))
      .map((name) => `app/routes/${name}`),
  ];
  for (const path of paths) {
    const source = ts.createSourceFile(
      path,
      await readFile(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isStringLiteral(node) &&
        /\p{Script=Han}/u.test(node.text) &&
        path !== "app/i18n.ts" &&
        !(
          path === "app/extension-catalog.ts" && node.text === "动漫屋 / 漫画人"
        )
      ) {
        expect(
          Object.hasOwn(messages, node.text),
          `${path}: ${node.text}`,
        ).toBe(true);
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t"
      ) {
        const key = node.arguments[0];
        if (key && ts.isStringLiteral(key)) {
          expect(
            Object.hasOwn(messages, key.text),
            `${path}: ${key.text}`,
          ).toBe(true);
        }
      }
      if (ts.isJsxText(node)) {
        expect(node.text, path).not.toMatch(/\p{Script=Han}/u);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});
