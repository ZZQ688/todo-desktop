import type { Mutation, OccurrenceBatch, SubtaskDraft, TaskDraft, Workspace, WorkspaceRepository } from "../application/workspace";
import type { LocalDate } from "../domain/local-date";
import { asLocalDate } from "../domain/local-date";
import type { RepeatRule } from "../domain/models";

export function emptyWorkspace(): Workspace {
  return { tasks: [], projects: [], entries: [],
    settings: { schemaVersion: 1, locale: "zh-CN", density: "comfortable" } };
}

// Tracks every (sourceTaskId, date) that has ever been generated, so a deleted instance
// leaves a "tombstone" and is never regenerated. Mirrors the Rust recurrence_occurrences table.
type OccurrenceIndex = Map<string, Set<string>>;

function seedOccurrences(state: Workspace): OccurrenceIndex {
  const index: OccurrenceIndex = new Map();
  for (const task of state.tasks) {
    if (task.recurrenceSourceId) {
      const dates = index.get(task.recurrenceSourceId) ?? new Set<string>();
      dates.add(task.createdOn);
      index.set(task.recurrenceSourceId, dates);
    }
  }
  return index;
}

function cloneOccurrences(index: OccurrenceIndex): OccurrenceIndex {
  const result: OccurrenceIndex = new Map();
  for (const [sourceId, dates] of index) result.set(sourceId, new Set(dates));
  return result;
}

// Browser demonstrations are intentionally temporary. Desktop never falls back to this adapter.
export function createMemoryRepository(initial: Workspace = emptyWorkspace()): WorkspaceRepository {
  let state = structuredClone(initial);
  let occurrences = seedOccurrences(state);
  return {
    demo: true,
    async load() { return structuredClone(state); },
    async mutate(mutation, today) {
      const next = structuredClone(state);
      const nextOccurrences = cloneOccurrences(occurrences);
      apply(next, mutation, today, nextOccurrences);
      state = next;
      occurrences = nextOccurrences;
      return structuredClone(state);
    },
  };
}

function taskById(state: Workspace, id: string) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) throw new Error("任务不存在");
  return task;
}

function validateId(id: string, label: string) {
  if (!id.trim() || id.length > 200) throw new Error(`${label}不能为空`);
}

function validateTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("标题不能为空");
  if (Array.from(trimmed).length > 200) throw new Error("标题不能超过 200 个字符");
  return trimmed;
}

function validateRepeat(repeat: RepeatRule) {
  if (!["daily", "weekdays", "weekly", "monthly"].includes(repeat.freq)) {
    throw new Error("重复频率无效");
  }
  if (repeat.freq !== "weekdays" &&
    (!Number.isInteger(repeat.interval) || repeat.interval < 1 || repeat.interval > 365)) {
    throw new Error("重复间隔必须在 1 到 365 之间");
  }
}

function normalizeRepeat(repeat: RepeatRule): RepeatRule {
  if (repeat.freq === "weekdays") return { freq: "weekdays", interval: 1 };
  return repeat;
}

function insertEntry(state: Workspace, taskId: string, localDate: LocalDate, carriedFromDate: LocalDate | null = null) {
  asLocalDate(localDate);
  if (!state.entries.some((item) => item.taskId === taskId && item.localDate === localDate)) {
    state.entries.push({ id: `entry:${taskId}:${localDate}`, taskId, localDate, carriedFromDate });
  }
}

function apply(state: Workspace, mutation: Mutation, today: LocalDate, occurrences: OccurrenceIndex) {
  asLocalDate(today);
  const now = new Date().toISOString();
  switch (mutation.kind) {
    case "saveTask":
      saveTask(state, mutation.task, mutation.subtasks, mutation.scheduleToday, today, now);
      break;
    case "setCompletion":
      setCompletion(state, mutation.ids, mutation.completed, now);
      break;
    case "deleteTasks":
      deleteTasks(state, mutation.ids, occurrences);
      break;
    case "addToToday":
      for (const id of mutation.ids) {
        taskById(state, id);
        insertEntry(state, id, today);
      }
      break;
    case "removeFromToday":
      for (const id of mutation.ids) {
        taskById(state, id);
        state.entries = state.entries.filter((entry) => !(entry.taskId === id && entry.localDate === today));
      }
      break;
    case "moveToGroup":
      moveToGroup(state, mutation.ids, mutation.projectId, now);
      break;
    case "saveProject": {
      validateId(mutation.id, "项目 ID");
      const name = validateTitle(mutation.name);
      const old = state.projects.find((project) => project.id === mutation.id);
      if (old) Object.assign(old, { name, updatedAt: now });
      else state.projects.push({ id: mutation.id, name, createdAt: now, updatedAt: now });
      break;
    }
    case "deleteProject": {
      const index = state.projects.findIndex((project) => project.id === mutation.id);
      if (index === -1) throw new Error("项目不存在");
      state.projects.splice(index, 1);
      for (const task of state.tasks) {
        if (task.projectId === mutation.id) task.projectId = null;
      }
      break;
    }
    case "saveSettings":
      state.settings.density = mutation.density;
      break;
    case "materialize":
      materialize(state, mutation.batches, now, occurrences);
      break;
    case "carryover":
      carryover(state, today);
      break;
  }
}

function saveTask(
  state: Workspace,
  draft: TaskDraft,
  subtasks: SubtaskDraft[],
  scheduleToday: boolean,
  today: LocalDate,
  now: string,
) {
  validateId(draft.id, "任务 ID");
  const title = validateTitle(draft.title);
  if (draft.dueDate) asLocalDate(draft.dueDate);
  const repeat = draft.repeat ? normalizeRepeat(structuredClone(draft.repeat)) : null;
  if (repeat) validateRepeat(repeat);

  let inheritProject = false;
  let parentProject: string | null = null;
  if (draft.parentId) {
    if (draft.parentId === draft.id) throw new Error("任务不能成为自己的父任务");
    if (subtasks.length) throw new Error("子任务不能再有子任务");
    const parent = taskById(state, draft.parentId);
    if (parent.parentId) throw new Error("只支持一层子任务");
    inheritProject = true;
    parentProject = parent.projectId;
  }

  if (!inheritProject && draft.projectId && !state.projects.some((project) => project.id === draft.projectId)) {
    throw new Error("项目不存在");
  }
  const effectiveProject = inheritProject ? parentProject : draft.projectId;

  // Upsert the parent task. `createdOn`, `recurrenceSourceId`, `recurrenceGeneratedThrough`,
  // `status`, `completedAt` and `createdAt` are intentionally preserved when editing.
  const existing = state.tasks.find((task) => task.id === draft.id);
  if (existing) {
    existing.projectId = effectiveProject;
    existing.parentId = draft.parentId;
    existing.title = title;
    existing.priority = draft.priority;
    existing.dueDate = draft.dueDate;
    existing.repeat = repeat;
    existing.updatedAt = now;
  } else {
    state.tasks.push({
      id: draft.id, projectId: effectiveProject, parentId: draft.parentId, title,
      status: "open", priority: draft.priority, dueDate: draft.dueDate, repeat,
      createdOn: today, recurrenceSourceId: null, recurrenceGeneratedThrough: null,
      completedAt: null, createdAt: now, updatedAt: now,
    });
  }

  // Children inherit the parent's project and priority; removed children are deleted.
  if (draft.parentId === null) {
    const keep: string[] = [];
    for (const sub of subtasks) {
      validateId(sub.id, "子任务 ID");
      const subTitle = validateTitle(sub.title);
      if (sub.id === draft.id) throw new Error("子任务不能与父任务相同");
      const subExisting = state.tasks.find((task) => task.id === sub.id);
      if (subExisting) {
        subExisting.projectId = effectiveProject;
        subExisting.parentId = draft.id;
        subExisting.title = subTitle;
        subExisting.priority = draft.priority;
        subExisting.updatedAt = now;
      } else {
        state.tasks.push({
          id: sub.id, projectId: effectiveProject, parentId: draft.id, title: subTitle,
          status: "open", priority: draft.priority, dueDate: null, repeat: null,
          createdOn: today, recurrenceSourceId: null, recurrenceGeneratedThrough: null,
          completedAt: null, createdAt: now, updatedAt: now,
        });
      }
      keep.push(sub.id);
    }
    const removed = state.tasks
      .filter((task) => task.parentId === draft.id && !keep.includes(task.id))
      .map((task) => task.id);
    removeTasksAndEntries(state, new Set(removed));
  }

  // Scheduling today applies to non-recurring tasks (and, for a root, its subtasks).
  if (scheduleToday && repeat === null) {
    insertEntry(state, draft.id, today);
    for (const sub of subtasks) insertEntry(state, sub.id, today);
  }
}

function setCompletion(state: Workspace, ids: string[], completed: boolean, now: string) {
  if (ids.length === 0) return;
  for (const id of ids) taskById(state, id);
  // 1. Update each id itself and its direct children.
  for (const task of state.tasks) {
    if (ids.includes(task.id) || (task.parentId && ids.includes(task.parentId))) {
      task.status = completed ? "completed" : "open";
      task.completedAt = completed ? now : null;
      task.updatedAt = now;
    }
  }
  // 2. Cascade across the parent/child boundary (instances never participate).
  for (const parent of state.tasks) {
    if (parent.recurrenceSourceId !== null) continue;
    const children = state.tasks.filter((child) =>
      child.parentId === parent.id && child.recurrenceSourceId === null);
    if (children.length === 0) continue;
    const allCompleted = children.every((child) => child.status === "completed");
    const anyOpen = children.some((child) => child.status === "open");
    if (completed && allCompleted) {
      parent.status = "completed";
      parent.completedAt = now;
      parent.updatedAt = now;
    } else if (!completed && anyOpen) {
      parent.status = "open";
      parent.completedAt = null;
      parent.updatedAt = now;
    }
  }
}

function deleteTasks(state: Workspace, ids: string[], occurrences: OccurrenceIndex) {
  for (const id of ids) {
    const task = taskById(state, id);
    const doomed = new Set<string>([id]);
    if (task.repeat) {
      // Recurring source: remove generated instances and subtasks, then the source itself.
      for (const instance of state.tasks) {
        if (instance.recurrenceSourceId === id) doomed.add(instance.id);
      }
      collectDescendants(state, doomed);
      occurrences.delete(id);
    } else {
      // Plain task or generated instance. Children cascade; a deleted instance keeps its
      // occurrence row (tombstone) so it is never regenerated.
      collectDescendants(state, doomed);
    }
    removeTasksAndEntries(state, doomed);
  }
}

function collectDescendants(state: Workspace, ids: Set<string>) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of state.tasks) {
      if (task.parentId && ids.has(task.parentId) && !ids.has(task.id)) {
        ids.add(task.id);
        changed = true;
      }
    }
  }
}

function removeTasksAndEntries(state: Workspace, ids: Set<string>) {
  state.tasks = state.tasks.filter((task) => !ids.has(task.id));
  state.entries = state.entries.filter((entry) => !ids.has(entry.taskId));
}

function moveToGroup(state: Workspace, ids: string[], projectId: string | null, now: string) {
  if (projectId && !state.projects.some((project) => project.id === projectId)) {
    throw new Error("项目不存在");
  }
  for (const id of ids) {
    const task = taskById(state, id);
    if (task.parentId === null) {
      task.projectId = projectId;
      task.updatedAt = now;
      for (const child of state.tasks) {
        if (child.parentId === id) {
          child.projectId = projectId;
          child.updatedAt = now;
        }
      }
    }
  }
}

function materialize(state: Workspace, batches: OccurrenceBatch[], now: string, occurrences: OccurrenceIndex) {
  const seenSources = new Set<string>();
  for (const batch of batches) {
    if (seenSources.has(batch.sourceTaskId)) {
      throw new Error("同一源任务不能出现在多个生成批次中");
    }
    seenSources.add(batch.sourceTaskId);

    const source = state.tasks.find((task) => task.id === batch.sourceTaskId);
    if (!source) throw new Error("源任务不存在");
    if (!source.repeat) throw new Error("任务不是重复源");
    if (source.recurrenceGeneratedThrough !== batch.expectedThrough) throw new Error("数据已更新，请重试");
    asLocalDate(batch.through);
    if (source.recurrenceGeneratedThrough && batch.through <= source.recurrenceGeneratedThrough) {
      throw new Error("数据已更新，请重试");
    }

    const dates = occurrences.get(batch.sourceTaskId) ?? new Set<string>();
    const seenDates = new Set<string>();
    for (const date of batch.dates) {
      asLocalDate(date);
      if (date > batch.through ||
        (source.recurrenceGeneratedThrough && date <= source.recurrenceGeneratedThrough) ||
        seenDates.has(date)) {
        throw new Error("生成日期不在有效范围或重复");
      }
      seenDates.add(date);
      if (dates.has(date)) continue; // tombstone: already generated, even if the instance was deleted
      const taskId = `occurrence:${batch.sourceTaskId}:${date}`;
      state.tasks.push({
        id: taskId, projectId: source.projectId, parentId: null, title: source.title,
        status: "open", priority: source.priority, dueDate: source.dueDate, repeat: null,
        createdOn: date, recurrenceSourceId: batch.sourceTaskId, recurrenceGeneratedThrough: null,
        completedAt: null, createdAt: now, updatedAt: now,
      });
      insertEntry(state, taskId, date);
      dates.add(date);
    }
    occurrences.set(batch.sourceTaskId, dates);
    source.recurrenceGeneratedThrough = batch.through;
    source.updatedAt = now;
  }
}

function carryover(state: Workspace, today: LocalDate) {
  for (const task of state.tasks) {
    if (task.status !== "open" || task.recurrenceSourceId !== null || task.repeat !== null) continue;
    const past = state.entries
      .filter((entry) => entry.taskId === task.id && entry.localDate < today)
      .map((entry) => entry.localDate);
    if (past.length === 0) continue;
    const latest = past.reduce((a, b) => (a > b ? a : b));
    insertEntry(state, task.id, today, latest);
  }
}
