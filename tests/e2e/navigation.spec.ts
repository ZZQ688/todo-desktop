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

test("task editing, independent subtasks and shared completion work", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("快速添加任务", { exact: true }).fill("准备季度复盘");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "完成 准备季度复盘", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "编辑 准备季度复盘", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("优先级", { exact: true }).selectOption("high");
  await editor.getByLabel("截止日期", { exact: true }).fill("2026-12-31");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByRole("button", { name: "添加 准备季度复盘 的子任务", exact: true }).click();
  await page.getByRole("dialog").getByLabel("任务名称", { exact: true }).fill("整理关键指标");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("checkbox", { name: "完成 整理关键指标", exact: true }).check();
  await expect(page.getByRole("checkbox", { name: "完成 准备季度复盘", exact: true })).not.toBeChecked();
  await expect(page.getByText("1/1 项子任务", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "项目", exact: true }).click();
  await page.getByRole("checkbox", { name: "完成 准备季度复盘", exact: true }).check();
  await page.getByRole("tab", { name: "每日", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "重新打开 准备季度复盘", exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("tasks.png"), fullPage: true });
  await page.getByRole("button", { name: "删除 准备季度复盘", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "整理关键指标", exact: true })).toHaveCount(0);
});

test("projects preserve tasks on deletion and recurring instances complete independently", async ({ page }, testInfo) => {
  await page.goto("/");
  const today = await page.getByLabel("日期", { exact: true }).inputValue();
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);
  await page.getByRole("tab", { name: "项目", exact: true }).click();
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("dialog").getByLabel("项目名称").fill("产品迭代");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("tab", { name: "设置", exact: true }).click();
  const settings = page.getByRole("tabpanel", { name: "设置", exact: true });
  await settings.getByRole("button", { name: "紧凑", exact: true }).click();
  await expect(settings.getByRole("button", { name: "紧凑", exact: true })).toHaveAttribute("aria-pressed", "true");
  await settings.getByLabel("任务名称", { exact: true }).fill("每日检查");
  await settings.getByLabel("项目", { exact: true }).selectOption({ label: "产品迭代" });
  await settings.getByRole("button", { name: "创建重复任务", exact: true }).click();
  await expect(settings.getByRole("button", { name: "停止 每日检查", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("recurrence.png"), fullPage: true });
  await page.getByRole("tab", { name: "每日", exact: true }).click();
  await page.getByRole("checkbox", { name: "完成 每日检查", exact: true }).check();
  await page.getByLabel("日期", { exact: true }).fill(tomorrow);
  await expect(page.getByRole("checkbox", { name: "完成 每日检查", exact: true })).not.toBeChecked();
  await page.getByLabel("日期", { exact: true }).fill(today);
  await expect(page.getByRole("checkbox", { name: "重新打开 每日检查", exact: true })).toBeChecked();
  await page.getByRole("tab", { name: "项目", exact: true }).click();
  await page.getByRole("button", { name: /产品迭代/ }).click();
  await page.getByRole("button", { name: "删除 产品迭代", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除项目", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "每日检查", exact: true })).toHaveCount(2);
  await page.getByRole("tab", { name: "设置", exact: true }).click();
  await settings.getByRole("button", { name: "停止 每日检查", exact: true }).click();
  await expect(settings.getByRole("button", { name: "停止 每日检查", exact: true })).toHaveCount(0);
});
