import type { LocalDate } from "../domain/local-date";
import type { DailyEntry, EntityId, Task, UtcInstant } from "../domain/models";

export interface TaskRepository {
  listDaily(date: LocalDate): Promise<readonly Task[]>;
  listProject(projectId: EntityId): Promise<readonly Task[]>;
  save(task: Task): Promise<void>;
  setCompletion(id: EntityId, completedAt: UtcInstant | null): Promise<Task>;
  schedule(taskId: EntityId, date: LocalDate): Promise<DailyEntry>;
}
