import { expect, test } from "@playwright/test";

test.use({ javaScriptEnabled: false });

test("生产服务渲染首页并提供样式文件", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle("书架 · comic-dl-web");
  await expect(
    page.getByRole("heading", { name: "书架", level: 1 }),
  ).toBeVisible();

  await expect(page.getByText("书架暂无作品。")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCSS("display", "flex");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/comic-icon.png",
  );
  expect((await page.request.get("/comic-icon.png")).ok()).toBe(true);
  await page.getByRole("link", { name: "浏览漫画源" }).click();
  for (const name of [
    "CopyManga",
    "Zerobyw",
    "动漫屋 / 漫画人",
    "Komga",
    "Kavita",
  ]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "书架", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
