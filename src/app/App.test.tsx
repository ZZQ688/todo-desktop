import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "./App";
import { asLocalDate } from "../domain/local-date";
import { createMemoryRepository } from "../infrastructure/memory-repository";
import type { Workspace } from "../application/workspace";
import type { Project, Settings, Task } from "../domain/models";

const TODAY = asLocalDate("2026-09-18");
const now = "2026-09-18T08:00:00.000Z";
const settings: Settings = { schemaVersion: 1, locale: "zh-CN", density: "comfortable" };

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, projectId: null, parentId: null, title: id, status: "open", priority: "normal",
    dueDate: null, repeat: null, createdOn: TODAY, recurrenceSourceId: null,
    recurrenceGeneratedThrough: null, completedAt: null, createdAt: now, updatedAt: now, ...overrides,
  };
}

function project(id: string, name: string): Project {
  return { id, name, createdAt: now, updatedAt: now };
}

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return { tasks: [], projects: [], entries: [], settings, ...overrides };
}

function scheduled(taskId: string) {
  return { id: `entry:${taskId}`, taskId, localDate: TODAY, carriedFromDate: null };
}

test("filters the main area to matching tasks when the sidebar search has a query", async () => {
  const user = userEvent.setup();
  render(<App repository={createMemoryRepository(workspace({
    tasks: [task("t1", { title: "写周报" }), task("t2", { title: "买牛奶" })],
    entries: [scheduled("t1"), scheduled("t2")],
  }))} today={() => TODAY} />);

  await user.type(await screen.findByLabelText("搜索任务"), "周报");

  expect(screen.getByRole("heading", { name: "搜索结果" })).toBeInTheDocument();
  expect(screen.getByText("写周报")).toBeInTheDocument();
  expect(screen.queryByText("买牛奶")).not.toBeInTheDocument();
});

test("right-clicking a task row suppresses the native menu and opens the custom menu", async () => {
  render(<App repository={createMemoryRepository(workspace({
    tasks: [task("t1", { title: "写报告" })],
    entries: [scheduled("t1")],
  }))} today={() => TODAY} />);

  const row = await screen.findByRole("listitem", { name: "写报告" });
  expect(fireEvent.contextMenu(row)).toBe(false);
  expect(screen.getByRole("menu")).toBeInTheDocument();
});

test("a task row context menu lists 编辑 and 删除", async () => {
  render(<App repository={createMemoryRepository(workspace({
    tasks: [task("t1", { title: "写报告" })],
    entries: [scheduled("t1")],
  }))} today={() => TODAY} />);

  const row = await screen.findByRole("listitem", { name: "写报告" });
  fireEvent.contextMenu(row);

  expect(screen.getByRole("menuitem", { name: "编辑" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();
});

test("search results annotate project, status, and recurrence instance", async () => {
  const user = userEvent.setup();
  render(<App repository={createMemoryRepository(workspace({
    projects: [project("p1", "工作")],
    tasks: [
      task("report", { title: "写报告", projectId: "p1" }),
      task("run", { title: "晨跑", recurrenceSourceId: "src" }),
    ],
  }))} today={() => TODAY} />);

  const search = await screen.findByLabelText("搜索任务");
  await user.type(search, "写报告");
  expect(screen.getByText("工作 · 未完成")).toBeInTheDocument();

  await user.clear(search);
  await user.type(search, "晨跑");
  expect(screen.getByText("未分组 · 未完成")).toBeInTheDocument();
  expect(screen.getByText("重复实例")).toBeInTheDocument();
});

test("a project link context menu lists 重命名 and 删除", async () => {
  const user = userEvent.setup();
  render(<App repository={createMemoryRepository(workspace({
    projects: [project("p1", "工作")],
  }))} today={() => TODAY} />);

  await user.click(await screen.findByRole("tab", { name: "项目" }));
  const link = await screen.findByRole("button", { name: /^工作/ });
  fireEvent.contextMenu(link);

  expect(screen.getByRole("menuitem", { name: "重命名" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();
});

test("right-clicking empty space lists 新建任务 and 新建项目", async () => {
  render(<App repository={createMemoryRepository(workspace())} today={() => TODAY} />);
  const panel = await screen.findByRole("tabpanel", { name: "每日" });
  fireEvent.contextMenu(panel);

  expect(screen.getByRole("menuitem", { name: "新建任务" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "新建项目" })).toBeInTheDocument();
});
