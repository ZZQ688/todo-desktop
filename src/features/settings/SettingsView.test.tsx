import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { SettingsView } from "./SettingsView";
import type { Workspace } from "../../application/workspace";
import type { Settings } from "../../domain/models";

const settings: Settings = { schemaVersion: 1, locale: "zh-CN", density: "comfortable" };

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return { tasks: [], projects: [], entries: [], settings, ...overrides };
}

function renderView(overrides: Partial<Parameters<typeof SettingsView>[0]> = {}) {
  const run = vi.fn().mockResolvedValue(true);
  render(<SettingsView workspace={workspace()} busy={false} run={run} {...overrides} />);
  return { run };
}

test("renders the 界面密度 section and marks the current density", () => {
  renderView();
  expect(screen.getByRole("heading", { name: "界面密度" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "舒适" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "紧凑" })).toHaveAttribute("aria-pressed", "false");
});

test("no recurrence rule section remains", () => {
  renderView();
  expect(screen.queryByRole("heading", { name: "重复任务" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /创建重复任务/ })).not.toBeInTheDocument();
});

test("clicking 紧凑 dispatches saveSettings with compact density", async () => {
  const user = userEvent.setup();
  const { run } = renderView();
  await user.click(screen.getByRole("button", { name: "紧凑" }));
  expect(run).toHaveBeenCalledWith({ kind: "saveSettings", density: "compact" });
});

test("clicking 舒适 dispatches saveSettings with comfortable density", async () => {
  const user = userEvent.setup();
  const { run } = renderView({
    workspace: workspace({ settings: { ...settings, density: "compact" } }),
  });
  await user.click(screen.getByRole("button", { name: "舒适" }));
  expect(run).toHaveBeenCalledWith({ kind: "saveSettings", density: "comfortable" });
});
