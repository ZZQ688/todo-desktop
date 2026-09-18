import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ProjectsView } from "./ProjectsView";
import { asLocalDate } from "../../domain/local-date";
import type { Workspace } from "../../application/workspace";
import type { Project, Settings, Task } from "../../domain/models";

const settings: Settings = { schemaVersion: 1, locale: "zh-CN", density: "comfortable" };
const day = asLocalDate("2026-09-17");
const now = "2026-09-17T08:00:00.000Z";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, projectId: null, parentId: null, title: id, status: "open", priority: "normal",
    dueDate: null, repeat: null, createdOn: day, recurrenceSourceId: null,
    recurrenceGeneratedThrough: null, completedAt: null, createdAt: now, updatedAt: now, ...overrides,
  };
}

function project(id: string, name: string): Project {
  return { id, name, createdAt: now, updatedAt: now };
}

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return { tasks: [], projects: [], entries: [], settings, ...overrides };
}

function renderView(overrides: Partial<Parameters<typeof ProjectsView>[0]> = {}) {
  const run = vi.fn().mockResolvedValue(true);
  render(<ProjectsView workspace={workspace()} today={() => day} busy={false} error={null} run={run} {...overrides} />);
  return { run };
}

function sidebarCount(name: RegExp): string {
  return screen.getByRole("button", { name }).querySelector("span")!.textContent!;
}

test("labels the empty group 未分组 instead of 无项目", () => {
  renderView();
  expect(screen.getByRole("button", { name: /未分组/ })).toBeInTheDocument();
  expect(screen.queryByText("无项目")).not.toBeInTheDocument();
});

test("shows 未分组 as the heading subtitle when the empty group is selected", async () => {
  const user = userEvent.setup();
  renderView();
  await user.click(screen.getByRole("button", { name: /未分组/ }));
  expect(screen.getByRole("heading", { name: "项目" }).parentElement).toHaveTextContent("未分组");
});

test("delete-project dialog says tasks are kept in 未分组", async () => {
  const user = userEvent.setup();
  renderView({
    workspace: workspace({
      projects: [project("p1", "工作")],
      tasks: [task("t1", { projectId: "p1", title: "写报告" })],
    }),
  });
  await user.click(screen.getByRole("button", { name: /工作/ }));
  await user.click(screen.getByRole("button", { name: "删除 工作" }));
  expect(screen.getByText(/保留到“未分组”/)).toBeInTheDocument();
  expect(screen.queryByText("无项目")).not.toBeInTheDocument();
});

test("excludes recurrence instances from sidebar counts", () => {
  renderView({
    workspace: workspace({
      projects: [project("p1", "工作")],
      tasks: [
        task("src", { title: "晨跑", repeat: { freq: "daily", interval: 1 } }),
        task("inst", { title: "晨跑实例", recurrenceSourceId: "src" }),
        task("plain", { title: "写报告", projectId: "p1" }),
        task("inst2", { title: "会议实例", recurrenceSourceId: "plain", projectId: "p1" }),
      ],
    }),
  });
  expect(sidebarCount(/全部任务/)).toBe("2");
  expect(sidebarCount(/未分组/)).toBe("1");
  expect(sidebarCount(/工作/)).toBe("1");
});

test("excludes recurrence instances from the task list and keeps the source repeat badge", () => {
  renderView({
    workspace: workspace({
      tasks: [
        task("src", { title: "晨跑", repeat: { freq: "daily", interval: 1 } }),
        task("inst", { title: "晨跑实例", recurrenceSourceId: "src" }),
        task("plain", { title: "写报告" }),
      ],
    }),
  });
  expect(screen.getByRole("listitem", { name: "晨跑" })).toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "写报告" })).toBeInTheDocument();
  expect(screen.queryByRole("listitem", { name: "晨跑实例" })).not.toBeInTheDocument();
  expect(screen.getByText("每天")).toBeInTheDocument();
});

test("has no search input but keeps the status filter", () => {
  renderView();
  expect(screen.queryByLabelText("搜索任务")).not.toBeInTheDocument();
  expect(screen.getByLabelText("任务状态")).toBeInTheDocument();
});

test("加入今日 fires the addToToday mutation for that task", async () => {
  const user = userEvent.setup();
  const { run } = renderView({
    workspace: workspace({ tasks: [task("t1", { title: "写报告" })] }),
  });
  await user.click(screen.getByRole("button", { name: "加入 写报告 到今日" }));
  expect(run).toHaveBeenCalledWith({ kind: "addToToday", ids: ["t1"] });
});

test("creates tasks in this view with scheduleToday false", async () => {
  const user = userEvent.setup();
  const { run } = renderView();
  await user.click(screen.getByRole("button", { name: "新建任务" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("任务名称"), "写报告");
  await user.click(within(dialog).getByRole("button", { name: "保存" }));
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ kind: "saveTask", scheduleToday: false }));
});

function multiSelectWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return workspace({
    tasks: [task("t1", { title: "写报告" }), task("t2", { title: "开会" })],
    ...overrides,
  });
}

async function enterSelection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "多选" }));
  await user.click(screen.getByRole("checkbox", { name: "选择 写报告" }));
  await user.click(screen.getByRole("checkbox", { name: "选择 开会" }));
}

test("bulk 完成 dispatches setCompletion with every selected id", async () => {
  const user = userEvent.setup();
  const { run } = renderView({ workspace: multiSelectWorkspace() });
  await enterSelection(user);
  await user.click(screen.getByRole("button", { name: "完成" }));
  expect(run).toHaveBeenCalledWith({ kind: "setCompletion", ids: ["t1", "t2"], completed: true });
});

test("bulk 删除 dispatches deleteTasks with every selected id", async () => {
  const user = userEvent.setup();
  const { run } = renderView({ workspace: multiSelectWorkspace() });
  await enterSelection(user);
  await user.click(screen.getByRole("button", { name: "删除" }));
  expect(run).toHaveBeenCalledWith({ kind: "deleteTasks", ids: ["t1", "t2"] });
});

test("移动分组 dispatches moveToGroup with the chosen project id", async () => {
  const user = userEvent.setup();
  const { run } = renderView({
    workspace: multiSelectWorkspace({ projects: [project("p1", "工作")] }),
  });
  await enterSelection(user);
  await user.selectOptions(screen.getByLabelText("移动分组"), "p1");
  expect(run).toHaveBeenCalledWith({ kind: "moveToGroup", ids: ["t1", "t2"], projectId: "p1" });
});

test("退出 clears selection and leaves selection mode", async () => {
  const user = userEvent.setup();
  renderView({ workspace: multiSelectWorkspace() });
  await enterSelection(user);
  await user.click(screen.getByRole("button", { name: "退出" }));
  expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "选择 写报告" })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "完成 写报告" })).toBeInTheDocument();
});

test("Escape exits selection mode and clears selection", async () => {
  const user = userEvent.setup();
  renderView({ workspace: multiSelectWorkspace() });
  await enterSelection(user);
  await user.keyboard("{Escape}");
  expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "选择 写报告" })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "完成 写报告" })).toBeInTheDocument();
});
