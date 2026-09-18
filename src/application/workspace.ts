import type { LocalDate } from "../domain/local-date";
import type { DailyEntry, Project, RepeatRule, Settings, Task } from "../domain/models";

export interface Workspace {
  tasks: Task[];
  projects: Project[];
  entries: DailyEntry[];
  settings: Settings;
}

export interface TaskDraft {
  id: string;
  title: string;
  projectId: string | null;
  parentId: string | null;
  priority: Task["priority"];
  dueDate: LocalDate | null;
  repeat: RepeatRule | null;
}

export interface SubtaskDraft { id: string; title: string; }

export interface OccurrenceBatch {
  sourceTaskId: string;
  expectedThrough: LocalDate | null;
  through: LocalDate;
  dates: LocalDate[];
}

export type Mutation =
  | { kind: "saveTask"; task: TaskDraft; subtasks: SubtaskDraft[]; scheduleToday: boolean }
  | { kind: "setCompletion"; ids: string[]; completed: boolean }
  | { kind: "deleteTasks"; ids: string[] }
  | { kind: "addToToday"; ids: string[] }
  | { kind: "removeFromToday"; ids: string[] }
  | { kind: "moveToGroup"; ids: string[]; projectId: string | null }
  | { kind: "saveProject"; id: string; name: string }
  | { kind: "deleteProject"; id: string }
  | { kind: "saveSettings"; density: Settings["density"] }
  | { kind: "materialize"; batches: OccurrenceBatch[] }
  | { kind: "carryover" };

export interface WorkspaceRepository {
  readonly demo: boolean;
  load(): Promise<Workspace>;
  mutate(mutation: Mutation, today: LocalDate): Promise<Workspace>;
}
