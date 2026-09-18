import { expect, test } from "@playwright/test";

test("a task with a subtask appears today and completing the parent cascades to the child", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("任务名称", { exact: true }).fill("季度复盘");
  await editor.getByRole("button", { name: "高", exact: true }).click();
  await editor.getByRole("button", { name: "添加子任务", exact: true }).click();
  await editor.getByLabel("子任务", { exact: true }).fill("整理指标");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();

  await expect(page.getByRole("checkbox", { name: "完成 季度复盘", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "完成 整理指标", exact: true })).toBeVisible();

  await page.getByRole("checkbox", { name: "完成 季度复盘", exact: true }).check();
  await expect(page.getByRole("checkbox", { name: "重新打开 季度复盘", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "重新打开 整理指标", exact: true })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("daily-cascade.png"), fullPage: true });
});

test("a recurring task materializes today's instance with a repeat badge", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("任务名称", { exact: true }).fill("每日站会");
  await editor.getByLabel("重复", { exact: true }).selectOption("daily");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();

  await expect(page.getByRole("checkbox", { name: "完成 每日站会", exact: true })).toBeVisible();
  await expect(page.getByText("重复实例", { exact: true })).toBeVisible();
});

test("a project task joins today via the add-to-today row action", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "项目", exact: true }).click();
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("任务名称", { exact: true }).fill("写周报");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();

  await expect(page.getByRole("checkbox", { name: "完成 写周报", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "加入 写周报 到今日", exact: true }).click();
  await page.getByRole("tab", { name: "每日", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "完成 写周报", exact: true })).toBeVisible();
});

test("a task can be removed from today", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("任务名称", { exact: true }).fill("写周报");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole("checkbox", { name: "完成 写周报", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "移出 写周报 的今日", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "完成 写周报", exact: true })).not.toBeVisible();
});

test("multi-select moves a task into a project group", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "项目", exact: true }).click();
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("dialog").getByLabel("项目名称", { exact: true }).fill("工作");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  await page.getByRole("dialog").getByLabel("任务名称", { exact: true }).fill("准备方案");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();

  await page.getByRole("button", { name: "多选", exact: true }).click();
  await page.getByRole("checkbox", { name: "选择 准备方案", exact: true }).check();
  await page.getByLabel("移动分组", { exact: true }).selectOption({ label: "工作" });
  await page.getByRole("button", { name: /工作/ }).click();
  await expect(page.getByRole("listitem", { name: "准备方案", exact: true })).toBeVisible();
});

test("past dates are read-only and future dates are unreachable", async ({ page }, testInfo) => {
  await page.goto("/");
  const dateInput = page.getByLabel("日期", { exact: true });
  const today = await dateInput.inputValue();
  const base = new Date(`${today}T12:00:00Z`);
  const yesterday = new Date(base);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const tomorrow = new Date(base);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  await expect(page.getByRole("button", { name: "下一天", exact: true })).toHaveCount(0);
  await expect(dateInput).toHaveAttribute("max", today);

  await dateInput.fill(yesterdayStr);
  await expect(page.getByText("浏览历史")).toBeVisible();
  await expect(page.getByRole("button", { name: "添加任务", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "多选", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "回到今天", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("history-readonly.png"), fullPage: true });

  await dateInput.fill(tomorrowStr);
  await expect(page.locator(".view-heading p")).toHaveText(yesterdayStr);
  await expect(page.getByRole("button", { name: "回到今天", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "回到今天", exact: true }).click();
  await expect(page.getByRole("button", { name: "添加任务", exact: true })).toBeVisible();
});

test("three views render and settings expose only density controls", async ({ page }) => {
  await page.goto("/");
  for (const [tab, heading] of [["每日", "每日待办"], ["项目", "项目"], ["设置", "设置"]] as const) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.getByRole("heading", { name: "界面密度", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "重复任务", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "紧凑", exact: true }).click();
  await expect(page.getByRole("button", { name: "紧凑", exact: true })).toHaveAttribute("aria-pressed", "true");
});
