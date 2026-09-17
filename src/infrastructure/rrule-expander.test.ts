import { expect, test } from "vitest";
import { asLocalDate } from "../domain/local-date";
import type { StoredRule } from "../application/workspace";
import { expandBatch } from "./rrule-expander";

const date = asLocalDate;
function rule(overrides: Partial<StoredRule> = {}): StoredRule {
  return { id: "routine", template: { title: "整理", projectId: null, priority: "normal", dueDate: null },
    rrule: "FREQ=DAILY;INTERVAL=1", startDate: date("2026-03-06"), endDate: null,
    timeZone: "America/New_York", generatedThrough: null, ...overrides };
}

test("expands local calendar days across DST and resumes after the committed cursor", () => {
  expect(expandBatch(rule(), date("2026-03-09"))?.dates).toEqual([
    "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09",
  ]);
  expect(expandBatch(rule({ generatedThrough: date("2026-03-08") }), date("2026-03-09"))?.dates)
    .toEqual(["2026-03-09"]);
  expect(expandBatch(rule({ generatedThrough: date("2026-03-09") }), date("2026-03-09"))).toBeNull();
});

test("uses RFC month-end skipping and honors an inclusive end date", () => {
  expect(expandBatch(rule({ startDate: date("2026-01-31"), rrule: "FREQ=MONTHLY;INTERVAL=1",
    endDate: date("2026-03-31") }), date("2026-06-01"))?.dates).toEqual(["2026-01-31", "2026-03-31"]);
});

test("weekday rules advance the cursor on a weekend even without an occurrence", () => {
  const result = expandBatch(rule({ rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    generatedThrough: date("2026-03-06") }), date("2026-03-08"));
  expect(result).toEqual({ ruleId: "routine", expectedThrough: "2026-03-06", through: "2026-03-08", dates: [] });
});

test("does not expand before start and rejects unsupported subday recurrence", () => {
  expect(expandBatch(rule(), date("2026-03-01"))).toBeNull();
  expect(() => expandBatch(rule({ rrule: "FREQ=SECONDLY" }), date("2026-03-09"))).toThrow();
  expect(() => expandBatch(rule({ rrule: "FREQ=SECONDLY" }), date("2026-03-01"))).toThrow();
  expect(() => expandBatch(rule({ rrule: "FREQ=DAILY;BYHOUR=1,2" }), date("2026-03-09"))).toThrow();
  expect(() => expandBatch(rule({ rrule: "FREQ=DAILY;INTERVAL=0" }), date("2026-03-09"))).toThrow();
});
