import type { LocalDate } from "../domain/local-date";
import type { EntityId, Task } from "../domain/models";

export interface OccurrenceCandidate { sourceTaskId: EntityId; date: LocalDate }

export interface RecurrenceExpander {
  expand(
    task: Task,
    range: { start: LocalDate; end: LocalDate },
  ): readonly OccurrenceCandidate[];
}
