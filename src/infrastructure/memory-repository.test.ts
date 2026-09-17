import { expect, test } from "vitest";
import { asLocalDate } from "../domain/local-date";
import type { TaskDraft, Workspace } from "../application/workspace";
import type { Settings, Task } from "../domain/models";
import { createMemoryRepository } from "./memory-repository";

const day = asLocalDate("2026-09-17");
const day2 = asLocalDate("2026-09-18");
const day3 = asLocalDate("2026-09-19");
const now = "2026-09-17T08:00:00.000Z";
const settings: Settings = { schemaVersion: 1, locale: "zh-CN", density: "comfortable" };

function draft(id: string, overrides: Partial<TaskDraft> = {}): TaskDraft {
  return { id, title: id, projectId: null, parentId: null, priority: "normal", dueDate: null, repeat: null, ...overrides };
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, projectId: null, parentId: null, title: id, status: "open", priority: "normal",
    dueDate: null, repeat: null, createdOn: day, recurrenceSourceId: null,
    recurrenceGeneratedThrough: null, completedAt: null, createdAt: now, updatedAt: now, ...overrides,
  };
}

test("setCompletion cascades parent->children and child->parent", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveTask", task: draft("parent"),
    subtasks: [{ id: "c1", title: "c1" }, { id: "c2", title: "c2" }], scheduleToday: false }, day);

  let result = await repo.mutate({ kind: "setCompletion", ids: ["parent"], completed: true }, day);
  expect(result.tasks.find((t) => t.id === "parent")!.status).toBe("completed");
  expect(result.tasks.find((t) => t.id === "c1")!.status).toBe("completed");
  expect(result.tasks.find((t) => t.id === "c2")!.status).toBe("completed");

  result = await repo.mutate({ kind: "setCompletion", ids: ["c1"], completed: false }, day);
  expect(result.tasks.find((t) => t.id === "parent")!.status).toBe("open");
  expect(result.tasks.find((t) => t.id === "c2")!.status).toBe("completed");

  result = await repo.mutate({ kind: "setCompletion", ids: ["c1"], completed: true }, day);
  expect(result.tasks.find((t) => t.id === "parent")!.status).toBe("completed");

  result = await repo.mutate({ kind: "setCompletion", ids: ["parent"], completed: false }, day);
  expect(result.tasks.filter((t) => ["parent", "c1", "c2"].includes(t.id)).every((t) => t.status === "open")).toBe(true);
});

test("saveTask inherits project and priority into children and reconciles removed subtasks", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveProject", id: "p1", name: "工作" }, day);
  await repo.mutate({ kind: "saveTask", task: draft("parent", { projectId: "p1", priority: "high" }),
    subtasks: [{ id: "a", title: "a" }, { id: "b", title: "b" }], scheduleToday: false }, day);

  let result = await repo.load();
  expect(result.tasks.find((t) => t.id === "a")).toMatchObject({ projectId: "p1", priority: "high", parentId: "parent" });
  expect(result.tasks.find((t) => t.id === "b")).toMatchObject({ projectId: "p1", priority: "high", parentId: "parent" });

  await repo.mutate({ kind: "saveTask", task: draft("parent", { projectId: "p1", priority: "high" }),
    subtasks: [{ id: "a", title: "a2" }], scheduleToday: false }, day);
  result = await repo.load();
  expect(result.tasks.some((t) => t.id === "b")).toBe(false);
  expect(result.tasks.find((t) => t.id === "a")).toMatchObject({ title: "a2" });
});

test("a child draft inherits its parent project", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveProject", id: "p1", name: "工作" }, day);
  await repo.mutate({ kind: "saveTask", task: draft("parent", { projectId: "p1" }), subtasks: [], scheduleToday: false }, day);
  const result = await repo.mutate({ kind: "saveTask", task: draft("child", { parentId: "parent" }),
    subtasks: [], scheduleToday: false }, day);
  expect(result.tasks.find((t) => t.id === "child")!.projectId).toBe("p1");
});

test("editing preserves createdOn and recurrence identity", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveTask", task: draft("series", { repeat: { freq: "daily", interval: 1 } }),
    subtasks: [], scheduleToday: false }, day);
  await repo.mutate({ kind: "materialize",
    batches: [{ sourceTaskId: "series", expectedThrough: null, through: day, dates: [day] }] }, day);

  const before = (await repo.load()).tasks.find((t) => t.id === "series")!;
  expect(before.createdOn).toBe(day);
  expect(before.recurrenceGeneratedThrough).toBe(day);

  await repo.mutate({ kind: "saveTask",
    task: draft("series", { repeat: { freq: "daily", interval: 1 }, title: "renamed" }),
    subtasks: [], scheduleToday: false }, day2);
  const after = (await repo.load()).tasks.find((t) => t.id === "series")!;
  expect(after.createdOn).toBe(day);
  expect(after.recurrenceGeneratedThrough).toBe(day);
  expect(after.title).toBe("renamed");
});

test("saveTask with scheduleToday writes today entries for a root and its subtasks", async () => {
  const repo = createMemoryRepository();
  const result = await repo.mutate({ kind: "saveTask", task: draft("parent"),
    subtasks: [{ id: "child", title: "child" }], scheduleToday: true }, day);
  expect(result.entries.map((e) => e.taskId).sort()).toEqual(["child", "parent"]);
});

test("a recurring source task does not get a today entry from saveTask", async () => {
  const repo = createMemoryRepository();
  const result = await repo.mutate({ kind: "saveTask",
    task: draft("series", { repeat: { freq: "daily", interval: 1 } }), subtasks: [], scheduleToday: true }, day);
  expect(result.entries).toHaveLength(0);
});

test("carryover adds a today entry but never changes createdOn", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveTask", task: draft("open"), subtasks: [], scheduleToday: true }, day);
  const result = await repo.mutate({ kind: "carryover" }, day2);
  expect(result.tasks.find((t) => t.id === "open")!.createdOn).toBe(day);
  expect(result.entries.some((e) => e.taskId === "open" && e.localDate === day2 && e.carriedFromDate === day)).toBe(true);
});

test("addToToday is idempotent per task", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveTask", task: draft("t"), subtasks: [], scheduleToday: false }, day);
  await repo.mutate({ kind: "addToToday", ids: ["t"] }, day);
  await repo.mutate({ kind: "addToToday", ids: ["t"] }, day);
  const result = await repo.load();
  expect(result.entries.filter((e) => e.taskId === "t" && e.localDate === day)).toHaveLength(1);
});

test("moveToGroup moves a root and its children and ignores non-roots", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveProject", id: "p1", name: "工作" }, day);
  await repo.mutate({ kind: "saveTask", task: draft("parent"), subtasks: [{ id: "child", title: "child" }], scheduleToday: false }, day);
  const result = await repo.mutate({ kind: "moveToGroup", ids: ["parent", "child"], projectId: "p1" }, day);
  expect(result.tasks.find((t) => t.id === "parent")!.projectId).toBe("p1");
  expect(result.tasks.find((t) => t.id === "child")!.projectId).toBe("p1");
});

test("deleting a source task removes its instances", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveTask", task: draft("series", { repeat: { freq: "daily", interval: 1 } }),
    subtasks: [], scheduleToday: false }, day);
  await repo.mutate({ kind: "materialize",
    batches: [{ sourceTaskId: "series", expectedThrough: null, through: day2, dates: [day, day2] }] }, day);
  const result = await repo.mutate({ kind: "deleteTasks", ids: ["series"] }, day);
  expect(result.tasks).toHaveLength(0);
});

test("materialize does not regenerate a deleted instance (tombstone)", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveTask", task: draft("series", { repeat: { freq: "daily", interval: 1 } }),
    subtasks: [], scheduleToday: false }, day);
  await repo.mutate({ kind: "materialize",
    batches: [{ sourceTaskId: "series", expectedThrough: null, through: day2, dates: [day, day2] }] }, day);
  await repo.mutate({ kind: "deleteTasks", ids: ["occurrence:series:2026-09-17"] }, day);

  const result = await repo.mutate({ kind: "materialize",
    batches: [{ sourceTaskId: "series", expectedThrough: day2, through: day3, dates: [day3] }] }, day);
  expect(result.tasks.some((t) => t.id === "occurrence:series:2026-09-17")).toBe(false);
  expect(result.tasks.some((t) => t.id === "occurrence:series:2026-09-19")).toBe(true);
});

test("materialize skips a deleted instance via tombstone when the cursor is behind it", async () => {
  const source = task("series", { repeat: { freq: "daily", interval: 1 } });
  const instance = task("occurrence:series:2026-09-17", { repeat: null, recurrenceSourceId: "series", createdOn: day });
  const repo = createMemoryRepository({ tasks: [source, instance], projects: [], entries: [], settings });

  await repo.mutate({ kind: "deleteTasks", ids: ["occurrence:series:2026-09-17"] }, day);
  const result = await repo.mutate({ kind: "materialize",
    batches: [{ sourceTaskId: "series", expectedThrough: null, through: day2, dates: [day, day2] }] }, day);

  expect(result.tasks.some((t) => t.id === "occurrence:series:2026-09-17")).toBe(false);
  expect(result.tasks.some((t) => t.id === "occurrence:series:2026-09-18")).toBe(true);
});

test("deleteProject unassigns its tasks", async () => {
  const repo = createMemoryRepository();
  await repo.mutate({ kind: "saveProject", id: "p1", name: "工作" }, day);
  await repo.mutate({ kind: "saveTask", task: draft("t", { projectId: "p1" }), subtasks: [], scheduleToday: false }, day);
  const result = await repo.mutate({ kind: "deleteProject", id: "p1" }, day);
  expect(result.projects).toHaveLength(0);
  expect(result.tasks.find((t) => t.id === "t")!.projectId).toBeNull();
});
