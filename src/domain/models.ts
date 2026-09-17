import type { LocalDate } from "./local-date";

export type EntityId = string;
export type UtcInstant = string;
export type TaskStatus = "open" | "completed";
export type Priority = "low" | "normal" | "high";
export type RepeatFreq = "daily" | "weekdays" | "weekly" | "monthly";

export interface Project {
  id: EntityId; name: string; createdAt: UtcInstant; updatedAt: UtcInstant;
}

export interface RepeatRule { freq: RepeatFreq; interval: number; }

export interface Task {
  id: EntityId; projectId: EntityId | null; parentId: EntityId | null;
  title: string; status: TaskStatus; priority: Priority; dueDate: LocalDate | null;
  repeat: RepeatRule | null;
  createdOn: LocalDate;               // immutable plan date
  recurrenceSourceId: EntityId | null; // instance -> source task; null on the source
  recurrenceGeneratedThrough: LocalDate | null; // generation cursor (source tasks only)
  completedAt: UtcInstant | null; createdAt: UtcInstant; updatedAt: UtcInstant;
}

export interface DailyEntry {
  id: EntityId; taskId: EntityId; localDate: LocalDate;
  carriedFromDate: LocalDate | null;
}

export interface Settings {
  schemaVersion: 1; locale: "zh-CN"; density: "comfortable" | "compact";
}
