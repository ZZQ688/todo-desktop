import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { DailyView } from "./DailyView";
import { asLocalDate } from "../../domain/local-date";
import type { Workspace } from "../../application/workspace";
import type { Settings, Task } from "../../domain/models";

const settings: Settings = { schemaVersion: 1, locale: "zh-CN", density: "comfortable" };
const today = asLocalDate("2026-09-18");
const past = asLocalDate("2026-09-17");
const now = "2026-09-18T08:00:00.000Z";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, projectId: null, parentId: null, title: id, status: "open", priority: "normal",
    dueDate: null, repeat: null, createdOn: today, recurrenceSourceId: null,
    recurrenceGeneratedThrough: null, completedAt: null, createdAt: now, updatedAt: now, ...overrides,
  };
}

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return { tasks: [], projects: [], entries: [], settings, ...overrides };
}

function renderView(overrides: Partial<Parameters<typeof DailyView>[0]> = {}) {
  const run = vi.fn().mockResolvedValue(true);
  const onDateChange = vi.fn();
  render(<DailyView workspace={workspace()} date={today} today={() => today} onDateChange={onDateChange}
    busy={false} error={null} run={run} {...overrides} />);
  return { run, onDateChange };
}

test("exposes a single 添加任务 entry point with no quick-add input or 详细新建", () => {
  renderView();
  expect(screen.getByRole("button", { name: "添加任务" })).toBeInTheDocument();
  expect(screen.queryByLabelText("快速添加任务")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "详细新建" })).not.toBeInTheDocument();
});

test("has no 下一天 button", () => {
  renderView();
  expect(screen.queryByRole("button", { name: "下一天" })).not.toBeInTheDocument();
});

test("date input is capped at today", () => {
  renderView();
  expect(screen.getByLabelText("日期")).toHaveAttribute("max", "2026-09-18");
});

test("hides 回到今天 when the view is already on today", () => {
  renderView();
  expect(screen.queryByRole("button", { name: "回到今天" })).not.toBeInTheDocument();
});

test("上一天 moves to the previous day", async () => {
  const user = userEvent.setup();
  const { onDateChange } = renderView();
  await user.click(screen.getByRole("button", { name: "上一天" }));
  expect(onDateChange).toHaveBeenCalledWith(past);
});

test("clicking 添加任务 opens the task editor", async () => {
  const user = userEvent.setup();
  renderView();
  await user.click(screen.getByRole("button", { name: "添加任务" }));
  expect(screen.getByRole("heading", { name: "新建任务" })).toBeInTheDocument();
});

test("a past date renders a read-only history with no checkbox or row actions", () => {
  renderView({
    date: past,
    workspace: workspace({
      tasks: [task("t1", { title: "写报告" })],
      entries: [{ id: "e1", taskId: "t1", localDate: past, carriedFromDate: null }],
    }),
  });
  expect(screen.getByText(/浏览历史 · 2026-09-17/)).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "编辑 写报告" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "删除 写报告" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "添加任务" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "回到今天" })).toBeInTheDocument();
});

function scheduledWorkspace(): Workspace {
  return workspace({
    tasks: [task("t1", { title: "写报告" }), task("t2", { title: "开会" })],
    entries: [
      { id: "e1", taskId: "t1", localDate: today, carriedFromDate: null },
      { id: "e2", taskId: "t2", localDate: today, carriedFromDate: null },
    ],
  });
}

test("hides the 多选 toggle on a read-only past date", () => {
  renderView({ date: past, workspace: workspace({
    tasks: [task("t1", { title: "写报告" })],
    entries: [{ id: "e1", taskId: "t1", localDate: past, carriedFromDate: null }],
  }) });
  expect(screen.queryByRole("button", { name: "多选" })).not.toBeInTheDocument();
});

test("bulk 完成 dispatches setCompletion with every selected id", async () => {
  const user = userEvent.setup();
  const { run } = renderView({ workspace: scheduledWorkspace() });
  await user.click(screen.getByRole("button", { name: "多选" }));
  await user.click(screen.getByRole("checkbox", { name: "选择 写报告" }));
  await user.click(screen.getByRole("checkbox", { name: "选择 开会" }));
  await user.click(screen.getByRole("button", { name: "完成" }));
  expect(run).toHaveBeenCalledWith({ kind: "setCompletion", ids: ["t1", "t2"], completed: true });
});

test("bulk 删除 dispatches deleteTasks with every selected id", async () => {
  const user = userEvent.setup();
  const { run } = renderView({ workspace: scheduledWorkspace() });
  await user.click(screen.getByRole("button", { name: "多选" }));
  await user.click(screen.getByRole("checkbox", { name: "选择 写报告" }));
  await user.click(screen.getByRole("checkbox", { name: "选择 开会" }));
  await user.click(screen.getByRole("button", { name: "删除" }));
  expect(run).toHaveBeenCalledWith({ kind: "deleteTasks", ids: ["t1", "t2"] });
});

test("移动分组 dispatches moveToGroup with the chosen project id", async () => {
  const user = userEvent.setup();
  const { run } = renderView({
    workspace: workspace({
      projects: [{ id: "p1", name: "工作", createdAt: now, updatedAt: now }],
      tasks: [task("t1", { title: "写报告" }), task("t2", { title: "开会" })],
      entries: [
        { id: "e1", taskId: "t1", localDate: today, carriedFromDate: null },
        { id: "e2", taskId: "t2", localDate: today, carriedFromDate: null },
      ],
    }),
  });
  await user.click(screen.getByRole("button", { name: "多选" }));
  await user.click(screen.getByRole("checkbox", { name: "选择 写报告" }));
  await user.click(screen.getByRole("checkbox", { name: "选择 开会" }));
  await user.selectOptions(screen.getByLabelText("移动分组"), "p1");
  expect(run).toHaveBeenCalledWith({ kind: "moveToGroup", ids: ["t1", "t2"], projectId: "p1" });
});

test("row 移出今日 dispatches removeFromToday for that task", async () => {
  const user = userEvent.setup();
  const { run } = renderView({
    workspace: workspace({
      tasks: [task("t1", { title: "写报告" })],
      entries: [{ id: "e1", taskId: "t1", localDate: today, carriedFromDate: null }],
    }),
  });
  await user.click(screen.getByRole("button", { name: "移出 写报告 的今日" }));
  expect(run).toHaveBeenCalledWith({ kind: "removeFromToday", ids: ["t1"] });
});

test("bulk 移出今日 dispatches removeFromToday with every selected id", async () => {
  const user = userEvent.setup();
  const { run } = renderView({ workspace: scheduledWorkspace() });
  await user.click(screen.getByRole("button", { name: "多选" }));
  await user.click(screen.getByRole("checkbox", { name: "选择 写报告" }));
  await user.click(screen.getByRole("checkbox", { name: "选择 开会" }));
  await user.click(screen.getByRole("button", { name: "移出今日" }));
  expect(run).toHaveBeenCalledWith({ kind: "removeFromToday", ids: ["t1", "t2"] });
});
