import { expect, test } from "vitest";
import { asLocalDate } from "../domain/local-date";
import type { TaskDraft } from "../application/workspace";
import { createMemoryRepository } from "./memory-repository";

const day = asLocalDate("2026-09-17");
const tomorrow = asLocalDate("2026-09-18");
const task: TaskDraft = { id: "parent", title: "任务", parentId: null, projectId: null,
  priority: "normal", dueDate: null, scheduledDate: day };

test("clearing an active schedule retains history but prevents later carryover", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveTask", task }, day);
  await repo.mutate({ kind: "saveTask", task: { ...task, scheduledDate: null } }, tomorrow);
  const result = await repo.mutate({ kind: "carryover" }, tomorrow);
  expect(result.tasks[0].scheduledDate).toBeNull();
  expect(result.entries.map((entry) => entry.localDate)).toEqual([day]);
});

test("a project-created child inherits scheduling and survives independent parent completion", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveTask", task }, day);
  await repo.mutate({ kind: "saveTask", task: { ...task, id: "child", parentId: "parent", scheduledDate: null } }, day);
  await repo.mutate({ kind: "setCompletion", id: "parent", completed: true }, day);
  const result = await repo.mutate({ kind: "carryover" }, tomorrow);
  expect(result.entries.some((entry) => entry.taskId === "child" && entry.localDate === tomorrow)).toBe(true);
  expect(result.entries.some((entry) => entry.taskId === "parent" && entry.localDate === tomorrow)).toBe(false);
});
