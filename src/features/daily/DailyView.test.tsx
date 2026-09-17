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
