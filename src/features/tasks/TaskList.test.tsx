import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { TaskList, type TaskGroup } from "./TaskList";
import { asLocalDate } from "../../domain/local-date";
import type { Mutation } from "../../application/workspace";
import type { Project, Task } from "../../domain/models";

const now = "2026-09-17T08:00:00.000Z";
const day = asLocalDate("2026-09-17");

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, projectId: null, parentId: null, title: id, status: "open", priority: "normal",
    dueDate: null, repeat: null, createdOn: day, recurrenceSourceId: null,
    recurrenceGeneratedThrough: null, completedAt: null, createdAt: now, updatedAt: now, ...overrides,
  };
}

function renderList(props: {
  groups?: TaskGroup[];
  tasks?: Task[];
  projects?: Project[];
  onAddToToday?: (task: Task) => void;
  onRemoveFromToday?: (task: Task) => void;
  readOnly?: boolean;
} = {}) {
  const groups = props.groups ?? [];
  const tasks = props.tasks ?? groups.map(({ parent }) => parent);
  const run = vi.fn().mockResolvedValue(true);
  const onEdit = vi.fn();
  const onAddChild = vi.fn();
  render(<TaskList groups={groups} tasks={tasks} projects={props.projects ?? []} today={day}
    busy={false} error={null} run={run} onEdit={onEdit} onAddChild={onAddChild}
    onAddToToday={props.onAddToToday} onRemoveFromToday={props.onRemoveFromToday} readOnly={props.readOnly} />);
  return { run, onEdit, onAddChild };
}

test("renders a colored priority dot with the correct aria-label per priority", () => {
  renderList({
    groups: [
      { parent: task("low", { title: "低任务", priority: "low" }), children: [] },
      { parent: task("normal", { title: "普通任务", priority: "normal" }), children: [] },
      { parent: task("high", { title: "高任务", priority: "high" }), children: [] },
    ],
  });
  expect(screen.getByLabelText("低")).toHaveClass("priority-dot-view--low");
  expect(screen.getByLabelText("普通")).toHaveClass("priority-dot-view--normal");
  expect(screen.getByLabelText("高")).toHaveClass("priority-dot-view--high");
});

test("fires onAddToToday with the task when the 加入今日 button is clicked", async () => {
  const user = userEvent.setup();
  const onAddToToday = vi.fn();
  const t = task("t1", { title: "写报告" });
  renderList({ groups: [{ parent: t, children: [] }], onAddToToday });
  await user.click(screen.getByRole("button", { name: "加入 写报告 到今日" }));
  expect(onAddToToday).toHaveBeenCalledWith(t);
});

test("fires onRemoveFromToday with the task when the 移出今日 button is clicked", async () => {
  const user = userEvent.setup();
  const onRemoveFromToday = vi.fn();
  const t = task("t1", { title: "写报告" });
  renderList({ groups: [{ parent: t, children: [] }], onRemoveFromToday });
  await user.click(screen.getByRole("button", { name: "移出 写报告 的今日" }));
  expect(onRemoveFromToday).toHaveBeenCalledWith(t);
});

test("a recurring source row shows no 加入今日 button while a normal task does", () => {
  renderList({
    groups: [
      { parent: task("source", { title: "晨跑", repeat: { freq: "daily", interval: 1 } }), children: [] },
      { parent: task("plain", { title: "写报告" }), children: [] },
    ],
    onAddToToday: vi.fn(),
  });
  expect(screen.queryByRole("button", { name: "加入 晨跑 到今日" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "加入 写报告 到今日" })).toBeInTheDocument();
});

test("renders 建立于 createdOn in the task meta", () => {
  renderList({ groups: [{ parent: task("t1", { title: "写报告", createdOn: asLocalDate("2026-09-17") }), children: [] }] });
  expect(screen.getByText("建立于 2026-09-17")).toBeInTheDocument();
});

test("marks an overdue due date with a red 已逾期 badge", () => {
  renderList({ groups: [{ parent: task("t1", { title: "写报告", dueDate: asLocalDate("2026-09-16") }), children: [] }] });
  const badge = screen.getByText("已逾期 2026-09-16");
  expect(badge).toHaveClass("due-badge--overdue");
});

test("marks a task due today with an amber 今天到期 badge", () => {
  renderList({ groups: [{ parent: task("t1", { title: "写报告", dueDate: asLocalDate("2026-09-17") }), children: [] }] });
  const badge = screen.getByText("今天到期");
  expect(badge).toHaveClass("due-badge--today");
});

test("renders a future due date with a neutral 截止 badge", () => {
  renderList({ groups: [{ parent: task("t1", { title: "写报告", dueDate: asLocalDate("2026-09-20") }), children: [] }] });
  const badge = screen.getByText("截止 2026-09-20");
  expect(badge).toHaveClass("due-badge--future");
});

test("a completed task never shows the overdue style even when its date passed", () => {
  renderList({ groups: [{ parent: task("t1", { title: "写报告", status: "completed", dueDate: asLocalDate("2026-09-16") }), children: [] }] });
  const badge = screen.getByText("截止 2026-09-16");
  expect(badge).toHaveClass("due-badge--future");
  expect(badge).not.toHaveClass("due-badge--overdue");
});

test("renders describeRepeat text for source tasks and 重复实例 for instances", () => {
  renderList({
    groups: [
      { parent: task("source", { title: "晨跑", repeat: { freq: "daily", interval: 1 } }), children: [] },
      { parent: task("instance", { title: "晨跑实例", recurrenceSourceId: "source" }), children: [] },
    ],
  });
  expect(screen.getByText("每天")).toBeInTheDocument();
  expect(screen.getByText("重复实例")).toBeInTheDocument();
});

test("describeRepeat covers every frequency and interval form", () => {
  renderList({
    groups: [
      { parent: task("d1", { title: "每天一次", repeat: { freq: "daily", interval: 1 } }), children: [] },
      { parent: task("d2", { title: "每三天", repeat: { freq: "daily", interval: 3 } }), children: [] },
      { parent: task("wd", { title: "工作日", repeat: { freq: "weekdays", interval: 1 } }), children: [] },
      { parent: task("w1", { title: "每周一次", repeat: { freq: "weekly", interval: 1 } }), children: [] },
      { parent: task("w2", { title: "每两周", repeat: { freq: "weekly", interval: 2 } }), children: [] },
      { parent: task("m1", { title: "每月一次", repeat: { freq: "monthly", interval: 1 } }), children: [] },
      { parent: task("m3", { title: "每三月", repeat: { freq: "monthly", interval: 3 } }), children: [] },
    ],
  });
  expect(screen.getByText("每天")).toBeInTheDocument();
  expect(screen.getByText("每 3 天")).toBeInTheDocument();
  expect(screen.getByText("每个工作日")).toBeInTheDocument();
  expect(screen.getByText("每周")).toBeInTheDocument();
  expect(screen.getByText("每 2 周")).toBeInTheDocument();
  expect(screen.getByText("每月")).toBeInTheDocument();
  expect(screen.getByText("每 3 月")).toBeInTheDocument();
});

test("checkbox uses the batch setCompletion mutation", async () => {
  const user = userEvent.setup();
  const { run } = renderList({ groups: [{ parent: task("t1", { title: "写报告" }), children: [] }] });
  await user.click(screen.getByRole("checkbox", { name: "完成 写报告" }));
  expect(run).toHaveBeenCalledWith({ kind: "setCompletion", ids: ["t1"], completed: true });
});

test("readOnly suppresses the checkbox and row action buttons", () => {
  const t = task("t1", { title: "写报告" });
  renderList({ groups: [{ parent: t, children: [] }], onAddToToday: vi.fn(), readOnly: true });
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "编辑 写报告" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "删除 写报告" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "加入 写报告 到今日" })).not.toBeInTheDocument();
  expect(screen.getByText("写报告")).toBeInTheDocument();
});

test("delete confirm uses the batch deleteTasks mutation", async () => {
  const user = userEvent.setup();
  const { run } = renderList({ groups: [{ parent: task("t1", { title: "写报告" }), children: [] }] });
  await user.click(screen.getByRole("button", { name: "删除 写报告" }));
  await user.click(screen.getByRole("button", { name: "删除" }));
  expect(run).toHaveBeenCalledWith({ kind: "deleteTasks", ids: ["t1"] });
});

test("renders nested subtasks recursively and lets a subtask add its own child", () => {
  const parent = task("root", { title: "根任务" });
  const child = task("child", { title: "子任务", parentId: "root" });
  const grand = task("grand", { title: "孙任务", parentId: "child" });
  const groups: TaskGroup[] = [{
    parent,
    children: [{ parent: child, children: [{ parent: grand, children: [] }] }],
  }];
  renderList({ groups, tasks: [parent, child, grand] });
  expect(screen.getByText("根任务")).toBeInTheDocument();
  expect(screen.getByText("子任务")).toBeInTheDocument();
  expect(screen.getByText("孙任务")).toBeInTheDocument();
  // The subtask row exposes its own 添加子任务 button.
  expect(screen.getByRole("button", { name: "添加 子任务 的子任务" })).toBeInTheDocument();
});

test("selectable rows render a selection checkbox that toggles without completing", async () => {
  const user = userEvent.setup();
  const run = vi.fn().mockResolvedValue(true);
  const onToggleSelected = vi.fn();
  const t = task("t1", { title: "写报告" });
  render(<TaskList groups={[{ parent: t, children: [] }]} tasks={[t]} projects={[]} today={day}
    busy={false} error={null} run={run} onEdit={vi.fn()} onAddChild={vi.fn()}
    selectable selected={new Set()} onToggleSelected={onToggleSelected} />);
  const checkbox = screen.getByRole("checkbox", { name: "选择 写报告" });
  expect(checkbox).not.toBeChecked();
  await user.click(checkbox);
  expect(onToggleSelected).toHaveBeenCalledWith("t1");
  expect(run).not.toHaveBeenCalled();
});

test("a selectable but readOnly row shows no checkbox", () => {
  const t = task("t1", { title: "写报告" });
  render(<TaskList groups={[{ parent: t, children: [] }]} tasks={[t]} projects={[]} today={day}
    busy={false} error={null} run={vi.fn()} onEdit={vi.fn()} onAddChild={vi.fn()}
    selectable selected={new Set()} onToggleSelected={vi.fn()} readOnly />);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
