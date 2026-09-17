import type { LocalDate } from "./local-date";

export type EntityId = string;
export type UtcInstant = string;
export type TaskStatus = "open" | "completed";
export type Priority = "low" | "normal" | "high";

export interface Project {
  id: EntityId; name: string; createdAt: UtcInstant; updatedAt: UtcInstant;
}
export interface Task {
  id: EntityId; projectId: EntityId | null; parentId: EntityId | null;
  title: string; status: TaskStatus; priority: Priority; dueDate: LocalDate | null;
  scheduledDate: LocalDate | null;
  completedAt: UtcInstant | null; createdAt: UtcInstant; updatedAt: UtcInstant;
}
export interface DailyEntry {
  id: EntityId; taskId: EntityId; localDate: LocalDate;
  carriedFromDate: LocalDate | null;
}
export type TaskTemplate = Pick<Task, "projectId" | "title" | "priority" | "dueDate">;
export interface RecurrenceRule {
  id: EntityId; template: TaskTemplate; rrule: string; startDate: LocalDate;
  endDate: LocalDate | null; timeZone: string;
}
export interface RecurrenceOccurrence {
  ruleId: EntityId; occurrenceDate: LocalDate; taskId: EntityId;
}
export interface Settings {
  schemaVersion: 1; locale: "zh-CN"; density: "comfortable" | "compact";
}
