import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { asLocalDate } from "../domain/local-date";
import { createMemoryRepository } from "../infrastructure/memory-repository";
import { useWorkspace } from "./useWorkspace";
import type { TaskDraft, Workspace } from "../application/workspace";
import type { Settings, Task } from "../domain/models";

const day = asLocalDate("2026-09-17");
const today = () => day;
const now = "2026-09-17T08:00:00.000Z";
const settings: Settings = { schemaVersion: 1, locale: "zh-CN", density: "comfortable" };
const draft = (id: string, overrides: Partial<TaskDraft> = {}): TaskDraft => ({
  id, title: id, projectId: null, parentId: null, dueDate: null, priority: "normal", repeat: null, ...overrides,
});

test("serializes rapid writes and publishes committed snapshots", async () => {
  const repository = createMemoryRepository();
  const { result } = renderHook(() => useWorkspace(repository, today));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  await act(async () => {
    await Promise.all([
      result.current.run({ kind: "saveTask", task: draft("first"), subtasks: [], scheduleToday: false }),
      result.current.run({ kind: "saveTask", task: draft("second"), subtasks: [], scheduleToday: false }),
    ]);
  });
  expect(result.current.data?.tasks.map((task) => task.id)).toEqual(["first", "second"]);
  expect(result.current.busy).toBe(false);
});

test("retains visible data and does not claim success when a save fails", async () => {
  const repository = createMemoryRepository();
  await repository.mutate({ kind: "saveTask", task: draft("existing"), subtasks: [], scheduleToday: false }, day);
  const { result } = renderHook(() => useWorkspace(repository, today));
  await waitFor(() => expect(result.current.data?.tasks).toHaveLength(1));
  vi.spyOn(repository, "mutate").mockRejectedValueOnce({ code: "save_failed", message: "写入失败" });
  await act(async () => {
    expect(await result.current.run({ kind: "deleteTasks", ids: ["existing"] })).toBe(false);
  });
  expect(result.current.data?.tasks).toHaveLength(1);
  expect(result.current.error).toBe("写入失败");
});

test("carries skipped days on resume, while browsing history never invokes carryover", async () => {
  let currentDay = day;
  const dateProvider = () => currentDay;
  const repository = createMemoryRepository();
  await repository.mutate({ kind: "saveTask", task: draft("open"), subtasks: [], scheduleToday: true }, day);
  const mutate = vi.spyOn(repository, "mutate");
  const { result } = renderHook(() => useWorkspace(repository, dateProvider));
  await waitFor(() => expect(result.current.busy).toBe(false));
  mutate.mockClear();
  await act(async () => result.current.ensureDate(asLocalDate("2026-09-01")));
  expect(mutate).not.toHaveBeenCalled();
  currentDay = asLocalDate("2026-09-21");
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await waitFor(() => expect(result.current.data?.entries.some((e) => e.localDate === currentDay)).toBe(true));
  expect(result.current.data?.tasks).toHaveLength(1);
  expect(result.current.data?.entries).toHaveLength(2);
});

test("repeated refresh does not duplicate or resurrect deleted occurrences", async () => {
  const repository = createMemoryRepository();
  const { result } = renderHook(() => useWorkspace(repository, today));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  await act(async () => {
    await result.current.run({ kind: "saveTask",
      task: draft("series", { repeat: { freq: "daily", interval: 1 } }), subtasks: [], scheduleToday: false });
  });
  // Saving a recurring source automatically materializes today's instance.
  expect(result.current.data?.tasks).toHaveLength(2);
  const instanceId = "occurrence:series:2026-09-17";
  await act(async () => {
    await result.current.run({ kind: "deleteTasks", ids: [instanceId] });
    await result.current.refresh();
    await result.current.refresh();
  });
  expect(result.current.data?.tasks.some((t) => t.id === instanceId)).toBe(false);
  expect(result.current.data?.tasks).toHaveLength(1);
});

test("a broken recurrence cannot hide loaded tasks or block carryover", async () => {
  const unfinished: Task = { id: "unfinished", projectId: null, parentId: null, title: "unfinished",
    status: "open", priority: "normal", dueDate: null, repeat: null, createdOn: day,
    recurrenceSourceId: null, recurrenceGeneratedThrough: null, completedAt: null, createdAt: now, updatedAt: now };
  const broken: Task = { id: "broken", projectId: null, parentId: null, title: "broken",
    status: "open", priority: "normal", dueDate: null,
    repeat: { freq: "secondly", interval: 1 } as unknown as Task["repeat"], createdOn: day,
    recurrenceSourceId: null, recurrenceGeneratedThrough: null, completedAt: null, createdAt: now, updatedAt: now };
  const initial: Workspace = {
    tasks: [unfinished, broken], projects: [], settings,
    entries: [{ id: "e1", taskId: "unfinished", localDate: day, carriedFromDate: null }],
  };
  const repository = createMemoryRepository(initial);
  const { result } = renderHook(() => useWorkspace(repository, today));
  await waitFor(() => expect(result.current.error).toContain("重复任务生成失败"));
  expect(result.current.data?.tasks).toHaveLength(2);
  expect(result.current.data?.entries.some((e) => e.localDate === day)).toBe(true);
  await act(async () => { expect(await result.current.run({ kind: "deleteTasks", ids: ["broken"] })).toBe(true); });
  expect(result.current.data?.tasks).toHaveLength(1);
});

test("committed sources report saved even when occurrence generation needs retry", async () => {
  const memory = createMemoryRepository();
  let failGeneration = true;
  const repository = { ...memory, mutate: vi.fn(async (...args: Parameters<typeof memory.mutate>) => {
    if (failGeneration && args[0].kind === "materialize") throw new Error("磁盘不可写");
    return memory.mutate(...args);
  }) };
  const { result } = renderHook(() => useWorkspace(repository, today));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  await act(async () => {
    expect(await result.current.run({ kind: "saveTask",
      task: draft("series", { repeat: { freq: "daily", interval: 1 } }), subtasks: [], scheduleToday: false })).toBe(true);
  });
  expect(result.current.data?.tasks).toHaveLength(1);
  expect(result.current.error).toContain("任务已保存");
  failGeneration = false;
  await act(async () => result.current.refresh());
  expect(result.current.data?.tasks).toHaveLength(2);
  expect(result.current.data?.entries.some((entry) => entry.localDate === day)).toBe(true);
  expect(result.current.error).toBeNull();
});
