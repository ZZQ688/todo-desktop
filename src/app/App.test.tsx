import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "./App";
import { asLocalDate } from "../domain/local-date";
import { createMemoryRepository } from "../infrastructure/memory-repository";
import type { Mutation, WorkspaceRepository } from "../application/workspace";
import type { Workspace } from "../application/workspace";

const TODAY = asLocalDate("2026-09-17");

test("creates one canonical task and shares completion between daily and project views", async () => {
  const user = userEvent.setup();
  const repository = createMemoryRepository();
  render(<App repository={repository} today={() => TODAY} />);

  await user.type(await screen.findByLabelText("快速添加任务"), "准备周报");
  await user.click(screen.getByRole("button", { name: "添加任务" }));

  const dailyTask = await screen.findByRole("listitem", { name: "准备周报" });
  expect(within(dailyTask).getByRole("checkbox", { name: "完成 准备周报" })).not.toBeChecked();

  await user.click(screen.getByRole("tab", { name: "项目" }));
  const projectTask = await screen.findByRole("listitem", { name: "准备周报" });
  await user.click(within(projectTask).getByRole("checkbox", { name: "完成 准备周报" }));
  expect(within(projectTask).getByRole("checkbox", { name: "重新打开 准备周报" })).toBeChecked();

  await user.click(screen.getByRole("tab", { name: "每日" }));
  expect(within(screen.getByRole("listitem", { name: "准备周报" }))
    .getByRole("checkbox", { name: "重新打开 准备周报" })).toBeChecked();
});

test("surfaces failed writes, preserves input, and retries loading", async () => {
  const user = userEvent.setup();
  const memory = createMemoryRepository();
  let rejectWrites = true;
  const repository: WorkspaceRepository = {
    demo: false,
    load: () => memory.load(),
    mutate: async (mutation: Mutation, today) => {
      if (rejectWrites && mutation.kind === "saveTask") throw new Error("磁盘暂时不可写");
      return memory.mutate(mutation, today);
    },
  };
  render(<App repository={repository} today={() => TODAY} />);

  const quickAdd = await screen.findByLabelText("快速添加任务");
  await user.type(quickAdd, "保留这段输入");
  await user.click(screen.getByRole("button", { name: "添加任务" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("磁盘暂时不可写");
  expect(quickAdd).toHaveValue("保留这段输入");
  expect(screen.queryByText("本地数据已连接")).not.toBeInTheDocument();
  expect(screen.queryByText("浏览器演示 · 关闭页面后清空")).not.toBeInTheDocument();

  rejectWrites = false;
  await user.click(screen.getByRole("button", { name: "重试" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("keeps keyboard tab navigation and reads today at click time", async () => {
  const user = userEvent.setup();
  let currentDate = asLocalDate("2026-09-16");
  render(<App repository={createMemoryRepository()} today={() => currentDate} />);
  await screen.findByLabelText("快速添加任务");

  await user.click(screen.getByRole("button", { name: "下一天" }));
  currentDate = TODAY;
  await user.click(screen.getByRole("button", { name: "今天" }));
  expect(screen.getByLabelText("日期")).toHaveValue("2026-09-17");

  const dailyTab = screen.getByRole("tab", { name: "每日" });
  dailyTab.focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "项目" })).toHaveFocus();
  expect(screen.getByRole("heading", { name: "项目" })).toBeInTheDocument();
});

test("shows the temporary browser notice only for demo repositories", async () => {
  const demo = createMemoryRepository();
  render(<App repository={demo} today={() => TODAY} />);
  expect(await screen.findByText("浏览器演示 · 关闭页面后清空")).toBeInTheDocument();
});

test("moves focus into the task editor and restores it after Escape", async () => {
  const user = userEvent.setup();
  render(<App repository={createMemoryRepository()} today={() => TODAY} />);
  const openEditor = await screen.findByRole("button", { name: "详细新建" });

  await user.click(openEditor);
  expect(screen.getByLabelText("任务名称")).toHaveFocus();
  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(openEditor).toHaveFocus();
});

test("keeps canonical child progress when the visible children are filtered", async () => {
  const user = userEvent.setup();
  const now = "2026-09-17T08:00:00.000Z";
  const initial: Workspace = {
    projects: [], entries: [], rules: [],
    settings: { schemaVersion: 1, locale: "zh-CN", density: "comfortable" },
    tasks: [
      { id: "parent", projectId: null, parentId: null, title: "发布版本", status: "completed",
        priority: "normal", dueDate: null, scheduledDate: null,
        completedAt: now, createdAt: now, updatedAt: now },
      { id: "done", projectId: null, parentId: "parent", title: "完成说明", status: "completed",
        priority: "normal", dueDate: null, scheduledDate: null,
        completedAt: now, createdAt: now, updatedAt: now },
      { id: "open", projectId: null, parentId: "parent", title: "待办检查", status: "open",
        priority: "normal", dueDate: null, scheduledDate: null,
        completedAt: null, createdAt: now, updatedAt: now },
    ],
  };
  render(<App repository={createMemoryRepository(initial)} today={() => TODAY} />);

  await user.click(await screen.findByRole("tab", { name: "项目" }));
  await user.selectOptions(screen.getByLabelText("任务状态"), "completed");

  expect(screen.getByText("1/2 项子任务")).toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "完成说明" })).toBeInTheDocument();
  expect(screen.queryByRole("listitem", { name: "待办检查" })).not.toBeInTheDocument();
});

test("keeps failed task editor values and reports the exact error inside the modal", async () => {
  const user = userEvent.setup();
  const memory = createMemoryRepository();
  const repository: WorkspaceRepository = {
    demo: false,
    load: () => memory.load(),
    mutate: async (mutation, today) => {
      if (mutation.kind === "saveTask") throw new Error("无法写入任务数据库");
      return memory.mutate(mutation, today);
    },
  };
  render(<App repository={repository} today={() => TODAY} />);
  await user.click(await screen.findByRole("button", { name: "详细新建" }));
  const editor = screen.getByRole("dialog");
  await user.type(within(editor).getByLabelText("任务名称"), "不要丢失的任务");
  await user.click(within(editor).getByRole("button", { name: "保存" }));

  expect(editor).toBeInTheDocument();
  expect(within(editor).getByLabelText("任务名称")).toHaveValue("不要丢失的任务");
  expect(within(editor).getByRole("alert")).toHaveTextContent("无法写入任务数据库");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});

test("freezes quick-add input while its save is pending", async () => {
  const user = userEvent.setup();
  const memory = createMemoryRepository();
  let finishSave: (() => void) | undefined;
  const repository: WorkspaceRepository = {
    demo: false,
    load: () => memory.load(),
    mutate: (mutation, today) => {
      if (mutation.kind !== "saveTask") return memory.mutate(mutation, today);
      return new Promise((resolve) => {
        finishSave = () => { void memory.mutate(mutation, today).then(resolve); };
      });
    },
  };
  render(<App repository={repository} today={() => TODAY} />);
  const input = await screen.findByLabelText("快速添加任务");
  await user.type(input, "正在保存");
  await user.click(screen.getByRole("button", { name: "添加任务" }));

  expect(input).toBeDisabled();
  expect(screen.getByRole("button", { name: "添加任务" })).toBeDisabled();
  await user.type(input, "不应写入");
  expect(input).toHaveValue("正在保存");

  finishSave?.();
  expect(await screen.findByRole("listitem", { name: "正在保存" })).toBeInTheDocument();
});

test("freezes recurrence fields while its save is pending", async () => {
  const user = userEvent.setup();
  const memory = createMemoryRepository();
  let finishSave: (() => void) | undefined;
  const repository: WorkspaceRepository = {
    demo: false,
    load: () => memory.load(),
    mutate: (mutation, today) => mutation.kind === "saveRule"
      ? new Promise((resolve) => { finishSave = () => { void memory.mutate(mutation, today).then(resolve); }; })
      : memory.mutate(mutation, today),
  };
  render(<App repository={repository} today={() => TODAY} />);
  await user.click(await screen.findByRole("tab", { name: "设置" }));
  const settings = screen.getByRole("tabpanel");
  const title = within(settings).getByLabelText("任务名称");
  await user.type(title, "固定重复任务");
  await user.click(within(settings).getByRole("button", { name: "创建重复任务" }));
  expect(title).toBeDisabled();
  expect(within(settings).getByLabelText("重复方式")).toBeDisabled();
  finishSave?.();
  expect(await within(settings).findByText("固定重复任务")).toBeInTheDocument();
});
