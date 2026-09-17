import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { TaskEditor } from "./TaskEditor";
import { asLocalDate } from "../../domain/local-date";
import type { Workspace } from "../../application/workspace";
import type { Settings, Task } from "../../domain/models";

const settings: Settings = { schemaVersion: 1, locale: "zh-CN", density: "comfortable" };
const now = "2026-09-17T08:00:00.000Z";
const day = asLocalDate("2026-09-17");

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, projectId: null, parentId: null, title: id, status: "open", priority: "normal",
    dueDate: null, repeat: null, createdOn: day, recurrenceSourceId: null,
    recurrenceGeneratedThrough: null, completedAt: null, createdAt: now, updatedAt: now, ...overrides,
  };
}

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return { tasks: [], projects: [], entries: [], settings, ...overrides };
}

function renderEditor(overrides: Partial<Parameters<typeof TaskEditor>[0]> = {}) {
  const run = vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  render(<TaskEditor workspace={workspace()} busy={false} error={null} run={run} onClose={onClose}
    {...overrides} />);
  return { run, onClose };
}

test("renders three priority dots with the correct labels and 普通 pressed by default", () => {
  renderEditor();
  expect(screen.getByRole("button", { name: "低" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "普通" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "高" })).toHaveAttribute("aria-pressed", "false");
});

test("clicking a priority dot moves the selection", async () => {
  const user = userEvent.setup();
  renderEditor();
  await user.click(screen.getByRole("button", { name: "高" }));
  expect(screen.getByRole("button", { name: "高" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "普通" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "低" })).toHaveAttribute("aria-pressed", "false");
});

test("collects subtasks and scheduleToday into saveTask", async () => {
  const user = userEvent.setup();
  const { run, onClose } = renderEditor({ scheduleToday: true });
  await user.type(screen.getByLabelText("任务名称"), "发布版本");
  await user.click(screen.getByRole("button", { name: "添加子任务" }));
  await user.click(screen.getByRole("button", { name: "添加子任务" }));
  const inputs = screen.getAllByLabelText("子任务");
  await user.type(inputs[0], "写说明");
  await user.type(inputs[1], "跑测试");
  await user.click(screen.getByRole("button", { name: "保存" }));

  expect(run).toHaveBeenCalledTimes(1);
  const mutation = run.mock.calls[0][0];
  expect(mutation.kind).toBe("saveTask");
  expect(mutation.task.title).toBe("发布版本");
  expect(mutation.subtasks.map((subtask: { title: string }) => subtask.title)).toEqual(["写说明", "跑测试"]);
  expect(mutation.subtasks.every((subtask: { id: string }) => Boolean(subtask.id))).toBe(true);
  expect(mutation.scheduleToday).toBe(true);
  expect(onClose).toHaveBeenCalled();
});

test("defaults scheduleToday to false for project-view saves", async () => {
  const user = userEvent.setup();
  const { run } = renderEditor();
  await user.type(screen.getByLabelText("任务名称"), "买菜");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(run.mock.calls[0][0].scheduleToday).toBe(false);
});

test("editing an existing task backfills its subtasks and repeat rule", () => {
  const parent = task("parent", { title: "发布版本", priority: "high", repeat: { freq: "weekly", interval: 3 } });
  renderEditor({
    workspace: workspace({ tasks: [
      parent,
      task("c1", { parentId: "parent", title: "写说明", priority: "high" }),
      task("c2", { parentId: "parent", title: "跑测试", priority: "high" }),
    ] }),
    task: parent,
  });
  expect(screen.getAllByLabelText("子任务").map((input) => (input as HTMLInputElement).value))
    .toEqual(["写说明", "跑测试"]);
  expect(screen.getByLabelText("重复")).toHaveValue("weekly");
  expect(screen.getByLabelText("间隔")).toHaveValue(3);
  expect(screen.getByRole("button", { name: "高" })).toHaveAttribute("aria-pressed", "true");
});

test("disables the interval input for weekdays", async () => {
  const user = userEvent.setup();
  renderEditor();
  await user.selectOptions(screen.getByLabelText("重复"), "weekdays");
  expect(screen.getByLabelText("重复")).toHaveValue("weekdays");
  expect(screen.getByLabelText("间隔")).toBeDisabled();
});

test("forces weekdays interval to 1 on save", async () => {
  const user = userEvent.setup();
  const { run } = renderEditor();
  await user.type(screen.getByLabelText("任务名称"), "晨跑");
  await user.selectOptions(screen.getByLabelText("重复"), "weekdays");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(run.mock.calls[0][0].task.repeat).toEqual({ freq: "weekdays", interval: 1 });
});

test("saves repeat null when 无 is selected", async () => {
  const user = userEvent.setup();
  const { run } = renderEditor();
  await user.type(screen.getByLabelText("任务名称"), "普通任务");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(run.mock.calls[0][0].task.repeat).toBeNull();
});

test("hides subtasks and disables the group selector when editing a subtask", () => {
  renderEditor({ parentId: "parent" });
  expect(screen.queryByRole("button", { name: "添加子任务" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("分组")).toBeDisabled();
});

test("renames the ungrouped option to 未分组", () => {
  renderEditor();
  expect(screen.getByRole("option", { name: "未分组" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "无项目" })).not.toBeInTheDocument();
});

test("no longer exposes a scheduled date field", () => {
  renderEditor();
  expect(screen.queryByLabelText("安排日期")).not.toBeInTheDocument();
});
