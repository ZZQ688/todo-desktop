import { RRule } from "rrule";
import { addDays, asLocalDate, type LocalDate } from "../domain/local-date";
import type { OccurrenceBatch, StoredRule } from "../application/workspace";
import type { RecurrenceExpander } from "../application/recurrence-expander";
import type { RecurrenceRule } from "../domain/models";

// UTC is only a date-only surrogate here; recurrence never converts a local day to an instant.
const calendarDate = (date: LocalDate) => new Date(`${date}T00:00:00Z`);

function parseRule(rule: RecurrenceRule): RRule {
  const options = RRule.parseString(rule.rrule);
  if (![RRule.DAILY, RRule.WEEKLY, RRule.MONTHLY].includes(options.freq!)) {
    throw new Error("不支持此重复频率");
  }
  if (options.byhour !== undefined || options.byminute !== undefined || options.bysecond !== undefined) {
    throw new Error("重复任务只支持日期，不支持时分秒");
  }
  if (options.interval !== undefined && (!Number.isInteger(options.interval) || options.interval < 1 || options.interval > 365)) {
    throw new Error("重复间隔应为 1 至 365");
  }
  return new RRule({ ...options, dtstart: calendarDate(rule.startDate), tzid: undefined });
}

export const recurrenceExpander: RecurrenceExpander = {
  expand(rule, range) {
    if (range.start > range.end) throw new RangeError("结束日期不能早于开始日期");
    const recurrence = parseRule(rule);
    const dates = recurrence.between(calendarDate(range.start), calendarDate(range.end), true,
      (_date, index) => index <= 10_000);
    if (dates.length > 10_000) throw new Error("生成范围过大，请缩短重复任务的日期范围");
    return dates.map((value) => ({ ruleId: rule.id, date: asLocalDate(value.toISOString().slice(0, 10)) }));
  },
};

export function expandBatch(rule: StoredRule, through: LocalDate): OccurrenceBatch | null {
  parseRule(rule);
  const end = rule.endDate && rule.endDate < through ? rule.endDate : through;
  if (end < rule.startDate || (rule.generatedThrough && rule.generatedThrough >= end)) return null;
  const start = rule.generatedThrough ? addDays(rule.generatedThrough, 1) : rule.startDate;
  return {
    ruleId: rule.id, expectedThrough: rule.generatedThrough, through: end,
    dates: recurrenceExpander.expand(rule, { start, end }).map(({ date }) => date),
  };
}
