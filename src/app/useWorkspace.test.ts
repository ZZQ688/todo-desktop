import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { asLocalDate } from "../domain/local-date";
import { createMemoryRepository } from "../infrastructure/memory-repository";
import { useWorkspace } from "./useWorkspace";
import type { TaskDraft } from "../application/workspace";

const day = asLocalDate("2026-09-17");
const today = () => day;
const draft = (id: string): TaskDraft => ({ id, title: id, projectId: null, parentId: null,
  dueDate: null, priority: "normal", scheduledDate: day });

test("serializes rapid writes and publishes committed snapshots", async () => {
  const repository = createMemoryRepository();
  const { result } = renderHook(() => useWorkspace(repository, today));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  await act(async () => {
    await Promise.all([
      result.current.run({ kind: "saveTask", task: draft("first") }),
      result.current.run({ kind: "saveTask", task: draft("second") }),
    ]);
  });
  expect(result.current.data?.tasks.map((task) => task.id)).toEqual(["first", "second"]);
  expect(result.current.busy).toBe(false);
});

test("retains visible data and does not claim success when a save fails", async () => {
  const repository = createMemoryRepository();
  await repository.mutate({ kind: "saveTask", task: draft("existing") }, day);
  const { result } = renderHook(() => useWorkspace(repository, today));
  await waitFor(() => expect(result.current.data?.tasks).toHaveLength(1));
  vi.spyOn(repository, "mutate").mockRejectedValueOnce({ code: "save_failed", message: "写入失败" });
  await act(async () => {
    expect(await result.current.run({ kind: "deleteTask", id: "existing" })).toBe(false);
  });
  expect(result.current.data?.tasks).toHaveLength(1);
  expect(result.current.error).toBe("写入失败");
});

test("carries skipped days on resume, while browsing history never invokes carryover", async () => {
  let currentDay = day;
  const dateProvider = () => currentDay;
  const repository = createMemoryRepository();
  await repository.mutate({ kind: "saveTask", task: draft("open") }, day);
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
    await result.current.run({ kind: "saveRule", rule: { id: "daily", startDate: day,
      endDate: null, timeZone: "Asia/Shanghai", rrule: "FREQ=DAILY;INTERVAL=1",
      template: { title: "每日整理", projectId: null, priority: "normal", dueDate: null } } });
  });
  expect(result.current.data?.tasks).toHaveLength(1);
  const id = result.current.data!.tasks[0].id;
  await act(async () => {
    await result.current.run({ kind: "deleteTask", id });
    await result.current.refresh();
    await result.current.refresh();
  });
  expect(result.current.data?.tasks).toHaveLength(0);
});

test("a broken recurrence cannot hide loaded tasks or block carryover", async () => {
  const repository = createMemoryRepository();
  await repository.mutate({ kind: "saveTask", task: { ...draft("unfinished"), scheduledDate: asLocalDate("2026-09-14") } }, day);
  await repository.mutate({ kind: "saveRule", rule: { id: "invalid", startDate: day,
    endDate: null, timeZone: "Asia/Shanghai", rrule: "FREQ=SECONDLY",
    template: { title: "broken", projectId: null, priority: "normal", dueDate: null } } }, day);
  const { result } = renderHook(() => useWorkspace(repository, today));
  await waitFor(() => expect(result.current.error).toContain("重复任务生成失败"));
  expect(result.current.data?.tasks).toHaveLength(1);
  expect(result.current.data?.entries.some((e) => e.localDate === day)).toBe(true);
  await act(async () => { expect(await result.current.run({ kind: "deleteRule", id: "invalid" })).toBe(true); });
  expect(result.current.data?.rules).toHaveLength(0);
});

test("committed rules report saved even when occurrence generation needs retry", async () => {
  const memory = createMemoryRepository();
  let failGeneration = true;
  const repository = { ...memory, mutate: vi.fn(async (...args: Parameters<typeof memory.mutate>) => {
    if (failGeneration && args[0].kind === "materialize") throw new Error("磁盘不可写");
    return memory.mutate(...args);
  }) };
  const { result } = renderHook(() => useWorkspace(repository, today));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  const tomorrow = asLocalDate("2026-09-18");
  await act(async () => result.current.ensureDate(tomorrow));
  await act(async () => {
    expect(await result.current.run({ kind: "saveRule", rule: { id: "saved", startDate: day,
      endDate: null, timeZone: "Asia/Shanghai", rrule: "FREQ=DAILY;INTERVAL=1",
      template: { title: "saved", projectId: null, priority: "normal", dueDate: null } } })).toBe(true);
  });
  expect(result.current.data?.rules).toHaveLength(1);
  expect(result.current.error).toContain("规则已保存");
  failGeneration = false;
  await act(async () => result.current.refresh());
  expect(result.current.data?.tasks).toHaveLength(2);
  expect(result.current.data?.entries.some((entry) => entry.localDate === tomorrow)).toBe(true);
  expect(result.current.error).toBeNull();
});
