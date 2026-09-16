import { expect, test } from "@playwright/test";

test("date navigation and three views fit the viewport", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("日期", { exact: true }).fill("2026-09-16");
  await page.getByRole("button", { name: "下一天" }).click();
  await expect(page.getByLabel("日期", { exact: true })).toHaveValue("2026-09-17");
  await page.getByRole("button", { name: "上一天" }).click();
  await expect(page.getByLabel("日期", { exact: true })).toHaveValue("2026-09-16");
  for (const [tab, heading, screenshot] of [
    ["每日", "每日待办", "daily.png"], ["项目", "项目", "projects.png"], ["设置", "设置", "settings.png"],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(screenshot), fullPage: true });
  }
  await page.getByRole("tab", { name: "每日", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "项目", exact: true })).toBeFocused();
});
