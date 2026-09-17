import type { Mutation, Workspace, WorkspaceRepository } from "../application/workspace";
import type { LocalDate } from "../domain/local-date";
import { asLocalDate } from "../domain/local-date";

export function emptyWorkspace(): Workspace {
  return { tasks: [], projects: [], entries: [], rules: [],
    settings: { schemaVersion: 1, locale: "zh-CN", density: "comfortable" } };
}

// Browser demonstrations are intentionally temporary. Desktop never falls back to this adapter.
export function createMemoryRepository(initial: Workspace = emptyWorkspace()): WorkspaceRepository {
  let state = structuredClone(initial);
  return {
    demo: true,
    async load() { return structuredClone(state); },
    async mutate(mutation, today) {
      const next = structuredClone(state);
      apply(next, mutation, today);
      state = next;
      return structuredClone(state);
    },
  };
}

function apply(state: Workspace, mutation: Mutation, today: LocalDate) {
  asLocalDate(today);
  const now = new Date().toISOString();
  const required = (value: string) => {
    if (!value.trim()) throw new Error("名称不能为空");
    return value.trim();
  };
  const taskById = (id: string) => {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) throw new Error("任务不存在");
    return task;
  };
  const entry = (taskId: string, localDate: LocalDate, carriedFromDate: LocalDate | null = null) => {
    asLocalDate(localDate);
    if (!state.entries.some((item) => item.taskId === taskId && item.localDate === localDate)) {
      state.entries.push({ id: crypto.randomUUID(), taskId, localDate, carriedFromDate });
    }
  };
  switch (mutation.kind) {
    case "saveTask": {
      const { scheduledDate, ...draft } = mutation.task;
      draft.title = required(draft.title);
      if (draft.dueDate) asLocalDate(draft.dueDate);
      if (draft.parentId) {
        const parent = taskById(draft.parentId);
        if (parent.parentId || parent.id === draft.id || state.tasks.some((t) => t.parentId === draft.id)) {
          throw new Error("只支持一级子任务");
        }
        draft.projectId = parent.projectId;
      }
      if (draft.projectId && !state.projects.some((p) => p.id === draft.projectId)) throw new Error("项目不存在");
      const old = state.tasks.find((t) => t.id === draft.id);
      const effectiveDate = scheduledDate ?? (!old && draft.parentId ? taskById(draft.parentId).scheduledDate : null);
      if (old) Object.assign(old, draft, { scheduledDate: effectiveDate, updatedAt: now });
      else state.tasks.push({ ...draft, scheduledDate: effectiveDate, status: "open", completedAt: null, createdAt: now, updatedAt: now });
      state.tasks.filter((t) => t.parentId === draft.id).forEach((t) => { t.projectId = draft.projectId; });
      state.entries = state.entries.filter((e) => e.taskId !== draft.id || e.localDate < today);
      if (effectiveDate) entry(draft.id, effectiveDate);
      break;
    }
    case "setCompletion": {
      const task = taskById(mutation.id);
      task.status = mutation.completed ? "completed" : "open";
      task.completedAt = mutation.completed ? now : null;
      task.updatedAt = now;
      break;
    }
    case "deleteTask": {
      taskById(mutation.id);
      const ids = new Set([mutation.id, ...state.tasks.filter((t) => t.parentId === mutation.id).map((t) => t.id)]);
      state.tasks = state.tasks.filter((t) => !ids.has(t.id));
      state.entries = state.entries.filter((e) => !ids.has(e.taskId));
      break;
    }
    case "saveProject": {
      const name = required(mutation.name);
      const old = state.projects.find((p) => p.id === mutation.id);
      if (old) Object.assign(old, { name, updatedAt: now });
      else state.projects.push({ id: mutation.id, name, createdAt: now, updatedAt: now });
      break;
    }
    case "deleteProject":
      state.projects = state.projects.filter((p) => p.id !== mutation.id);
      state.tasks.filter((t) => t.projectId === mutation.id).forEach((t) => { t.projectId = null; });
      state.rules.filter((r) => r.template.projectId === mutation.id).forEach((r) => { r.template.projectId = null; });
      break;
    case "saveSettings": state.settings.density = mutation.density; break;
    case "saveRule": {
      required(mutation.rule.template.title);
      asLocalDate(mutation.rule.startDate);
      if (mutation.rule.endDate && mutation.rule.endDate < mutation.rule.startDate) throw new Error("结束日期不能早于开始日期");
      const existing = state.rules.find((r) => r.id === mutation.rule.id);
      if (existing) Object.assign(existing, structuredClone(mutation.rule));
      else state.rules.push({ ...structuredClone(mutation.rule), generatedThrough: null });
      break;
    }
    case "deleteRule": state.rules = state.rules.filter((r) => r.id !== mutation.id); break;
    case "materialize":
      for (const batch of mutation.batches) {
        const rule = state.rules.find((r) => r.id === batch.ruleId);
        if (!rule || rule.generatedThrough !== batch.expectedThrough) throw new Error("数据已更新，请重试");
        for (const date of batch.dates) {
          const id = `occurrence:${rule.id}:${date}`;
          if (!state.tasks.some((t) => t.id === id)) {
            state.tasks.push({ ...rule.template, id, scheduledDate: date, parentId: null, status: "open", completedAt: null,
              createdAt: now, updatedAt: now });
            entry(id, date);
          }
        }
        rule.generatedThrough = batch.through;
      }
      break;
    case "carryover":
      for (const task of state.tasks.filter((t) => t.status === "open")) {
        const latest = task.scheduledDate;
        if (latest && latest < today) {
          entry(task.id, today, latest);
          task.scheduledDate = today;
          task.updatedAt = now;
        }
      }
      break;
  }
}
