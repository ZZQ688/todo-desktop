import { expect, test, vi } from "vitest";
import { asLocalDate } from "../domain/local-date";
import type { Mutation } from "../application/workspace";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
import { invoke } from "@tauri-apps/api/core";
import { desktopRepository, workspaceRepository } from "./tauri-workspace";

test("desktop uses exact native commands and never falls back on a failed database", async () => {
  const failure = { code: "database_unavailable", message: "本地数据无法打开" };
  vi.mocked(invoke).mockRejectedValue(failure);
  expect(workspaceRepository.demo).toBe(false);
  await expect(desktopRepository.load()).rejects.toBe(failure);
  expect(invoke).toHaveBeenCalledWith("load_workspace");
  const mutation = { kind: "carryover" } as const;
  const today = asLocalDate("2026-09-17");
  await expect(desktopRepository.mutate(mutation, today)).rejects.toBe(failure);
  expect(invoke).toHaveBeenCalledWith("mutate_workspace", { mutation, today });
});

test("passes the composite saveTask mutation through unchanged", async () => {
  const failure = { code: "save_failed", message: "写入失败" };
  vi.mocked(invoke).mockRejectedValue(failure);
  const today = asLocalDate("2026-09-17");
  const mutation: Mutation = {
    kind: "saveTask",
    task: { id: "parent", title: "任务", projectId: null, parentId: null,
      priority: "normal", dueDate: null, repeat: { freq: "daily", interval: 1 } },
    subtasks: [{ id: "child", title: "子任务" }],
    scheduleToday: false,
  };
  await expect(desktopRepository.mutate(mutation, today)).rejects.toBe(failure);
  expect(invoke).toHaveBeenCalledWith("mutate_workspace", { mutation, today });
});
