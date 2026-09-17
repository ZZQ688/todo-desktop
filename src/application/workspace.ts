import type { LocalDate } from "../domain/local-date";
import type { DailyEntry, Project, RecurrenceRule, Settings, Task } from "../domain/models";

export interface StoredRule extends RecurrenceRule { generatedThrough: LocalDate | null }
export interface Workspace {
  tasks: Task[];
  projects: Project[];
  entries: DailyEntry[];
  rules: StoredRule[];
  settings: Settings;
}
export interface TaskDraft {
  id: string;
  title: string;
  projectId: string | null;
  parentId: string | null;
  priority: Task["priority"];
  dueDate: LocalDate | null;
  scheduledDate: LocalDate | null;
}
export interface OccurrenceBatch {
  ruleId: string;
  expectedThrough: LocalDate | null;
  through: LocalDate;
  dates: LocalDate[];
}
export type Mutation =
  | { kind: "saveTask"; task: TaskDraft }
  | { kind: "setCompletion"; id: string; completed: boolean }
  | { kind: "deleteTask"; id: string }
  | { kind: "saveProject"; id: string; name: string }
  | { kind: "deleteProject"; id: string }
  | { kind: "saveSettings"; density: Settings["density"] }
  | { kind: "saveRule"; rule: RecurrenceRule }
  | { kind: "deleteRule"; id: string }
  | { kind: "materialize"; batches: OccurrenceBatch[] }
  | { kind: "carryover" };
export interface WorkspaceRepository {
  readonly demo: boolean;
  load(): Promise<Workspace>;
  mutate(mutation: Mutation, today: LocalDate): Promise<Workspace>;
}
