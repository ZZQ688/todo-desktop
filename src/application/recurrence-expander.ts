import type { LocalDate } from "../domain/local-date";
import type { EntityId, RecurrenceRule } from "../domain/models";

export interface OccurrenceCandidate { ruleId: EntityId; date: LocalDate }
export interface RecurrenceExpander {
  expand(
    rule: RecurrenceRule,
    range: { start: LocalDate; end: LocalDate },
  ): readonly OccurrenceCandidate[];
}
