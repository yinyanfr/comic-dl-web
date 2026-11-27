import { expect, test } from "@playwright/test";

test.use({ javaScriptEnabled: false });

test("生产服务渲染首页并提供样式文件", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle("comic-dl-web");
  await expect(
    page.getByRole("heading", { name: "comic-dl-web", level: 1 }),
  ).toBeVisible();

  const sources = page.getByRole("region", { name: "下载漫画" });
  await expect(sources.getByText("尚未加载漫画源。")).toBeVisible();
  await expect(sources).toHaveCSS("border-top-width", "3px");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/comic-icon.png",
  );
  expect((await page.request.get("/comic-icon.png")).ok()).toBe(true);
});
