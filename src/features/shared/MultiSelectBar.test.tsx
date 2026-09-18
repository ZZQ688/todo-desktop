import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MultiSelectBar } from "./MultiSelectBar";
import type { Project } from "../../domain/models";

const now = "2026-09-18T08:00:00.000Z";
const projects: Project[] = [
  { id: "p1", name: "工作", createdAt: now, updatedAt: now },
  { id: "p2", name: "生活", createdAt: now, updatedAt: now },
];

function renderBar(overrides: Partial<Parameters<typeof MultiSelectBar>[0]> = {}) {
  const onComplete = vi.fn();
  const onReopen = vi.fn();
  const onDelete = vi.fn();
  const onAddToToday = vi.fn();
  const onRemoveFromToday = vi.fn();
  const onMoveToGroup = vi.fn();
  const onExit = vi.fn();
  render(<MultiSelectBar count={2} busy={false} projects={projects}
    onComplete={onComplete} onReopen={onReopen} onDelete={onDelete} onAddToToday={onAddToToday}
    onRemoveFromToday={onRemoveFromToday} onMoveToGroup={onMoveToGroup} onExit={onExit} {...overrides} />);
  return { onComplete, onReopen, onDelete, onAddToToday, onRemoveFromToday, onMoveToGroup, onExit };
}

test("shows the selected count", () => {
  renderBar();
  expect(screen.getByText(/已选 2 项/)).toBeInTheDocument();
});

test("完成 fires onComplete", async () => {
  const user = userEvent.setup();
  const { onComplete } = renderBar();
  await user.click(screen.getByRole("button", { name: "完成" }));
  expect(onComplete).toHaveBeenCalled();
});

test("重开 fires onReopen", async () => {
  const user = userEvent.setup();
  const { onReopen } = renderBar();
  await user.click(screen.getByRole("button", { name: "重开" }));
  expect(onReopen).toHaveBeenCalled();
});

test("加入今日 fires onAddToToday", async () => {
  const user = userEvent.setup();
  const { onAddToToday } = renderBar();
  await user.click(screen.getByRole("button", { name: "加入今日" }));
  expect(onAddToToday).toHaveBeenCalled();
});

test("移出今日 fires onRemoveFromToday", async () => {
  const user = userEvent.setup();
  const { onRemoveFromToday } = renderBar();
  await user.click(screen.getByRole("button", { name: "移出今日" }));
  expect(onRemoveFromToday).toHaveBeenCalled();
});

test("删除 fires onDelete", async () => {
  const user = userEvent.setup();
  const { onDelete } = renderBar();
  await user.click(screen.getByRole("button", { name: "删除" }));
  expect(onDelete).toHaveBeenCalled();
});

test("退出 fires onExit", async () => {
  const user = userEvent.setup();
  const { onExit } = renderBar();
  await user.click(screen.getByRole("button", { name: "退出" }));
  expect(onExit).toHaveBeenCalled();
});

test("移动分组 maps the chosen project id", async () => {
  const user = userEvent.setup();
  const { onMoveToGroup } = renderBar();
  await user.selectOptions(screen.getByLabelText("移动分组"), "p1");
  expect(onMoveToGroup).toHaveBeenCalledWith("p1");
});

test("移动分组 maps 未分组 to null", async () => {
  const user = userEvent.setup();
  const { onMoveToGroup } = renderBar();
  await user.selectOptions(screen.getByLabelText("移动分组"), "__ungrouped__");
  expect(onMoveToGroup).toHaveBeenCalledWith(null);
});

test("disables all controls while busy", () => {
  renderBar({ busy: true });
  expect(screen.getByRole("button", { name: "完成" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "重开" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "加入今日" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "删除" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "退出" })).toBeDisabled();
  expect(screen.getByLabelText("移动分组")).toBeDisabled();
});
