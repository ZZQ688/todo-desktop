import { RRule } from "rrule";
import { addDays, asLocalDate, type LocalDate } from "../domain/local-date";
import type { OccurrenceBatch } from "../application/workspace";
import type { RecurrenceExpander } from "../application/recurrence-expander";
import type { RepeatRule, Task } from "../domain/models";

// UTC is only a date-only surrogate here; recurrence never converts a local day to an instant.
const calendarDate = (date: LocalDate) => new Date(`${date}T00:00:00Z`);

function toRrule(repeat: RepeatRule): string {
  if (repeat.freq === "weekdays") return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  const kind = repeat.freq === "daily" ? "DAILY" : repeat.freq === "weekly" ? "WEEKLY" : "MONTHLY";
  return `FREQ=${kind};INTERVAL=${repeat.interval}`;
}

function parseRepeat(repeat: RepeatRule, dtstart: LocalDate): RRule {
  if (!["daily", "weekdays", "weekly", "monthly"].includes(repeat.freq)) {
    throw new Error("不支持此重复频率");
  }
  if (repeat.freq !== "weekdays" &&
    (!Number.isInteger(repeat.interval) || repeat.interval < 1 || repeat.interval > 365)) {
    throw new Error("重复间隔应为 1 至 365");
  }
  const options = RRule.parseString(toRrule(repeat));
  return new RRule({ ...options, dtstart: calendarDate(dtstart), tzid: undefined });
}

export const recurrenceExpander: RecurrenceExpander = {
  expand(task, range) {
    if (range.start > range.end) throw new RangeError("结束日期不能早于开始日期");
    if (!task.repeat) throw new Error("任务不是重复源");
    const recurrence = parseRepeat(task.repeat, task.createdOn);
    const dates = recurrence.between(calendarDate(range.start), calendarDate(range.end), true,
      (_date, index) => index <= 10_000);
    if (dates.length > 10_000) throw new Error("生成范围过大，请缩短重复任务的日期范围");
    return dates.map((value) => ({ sourceTaskId: task.id, date: asLocalDate(value.toISOString().slice(0, 10)) }));
  },
};

export function expandBatch(task: Task, through: LocalDate): OccurrenceBatch | null {
  if (!task.repeat) return null;
  const cursor = task.recurrenceGeneratedThrough;
  if (cursor && cursor >= through) return null;
  const start = cursor ? addDays(cursor, 1) : task.createdOn;
  if (start > through) return null;
  return {
    sourceTaskId: task.id,
    expectedThrough: cursor,
    through,
    dates: recurrenceExpander.expand(task, { start, end: through }).map(({ date }) => date),
  };
}
