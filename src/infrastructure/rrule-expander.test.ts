import { expect, test } from "vitest";
import { asLocalDate } from "../domain/local-date";
import type { Task } from "../domain/models";
import { expandBatch } from "./rrule-expander";

const date = asLocalDate;
const now = "2026-03-06T00:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "series", projectId: null, parentId: null, title: "整理", status: "open",
    priority: "normal", dueDate: null, repeat: { freq: "daily", interval: 1 },
    createdOn: date("2026-03-06"), recurrenceSourceId: null, recurrenceGeneratedThrough: null,
    completedAt: null, createdAt: now, updatedAt: now, ...overrides,
  };
}

test("expands local calendar days and resumes after the committed cursor", () => {
  expect(expandBatch(task(), date("2026-03-09"))?.dates).toEqual([
    "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09",
  ]);
  expect(expandBatch(task({ recurrenceGeneratedThrough: date("2026-03-08") }), date("2026-03-09"))?.dates)
    .toEqual(["2026-03-09"]);
  expect(expandBatch(task({ recurrenceGeneratedThrough: date("2026-03-09") }), date("2026-03-09"))).toBeNull();
});

test("uses RFC month-end skipping for monthly rules", () => {
  expect(expandBatch(task({ createdOn: date("2026-01-31"), repeat: { freq: "monthly", interval: 1 } }),
    date("2026-06-01"))?.dates).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
});

test("weekday rules advance the cursor on a weekend even without an occurrence", () => {
  const result = expandBatch(task({ repeat: { freq: "weekdays", interval: 1 },
    recurrenceGeneratedThrough: date("2026-03-06") }), date("2026-03-08"));
  expect(result).toEqual({ sourceTaskId: "series", expectedThrough: "2026-03-06", through: "2026-03-08", dates: [] });
});

test("does not expand before createdOn and rejects invalid repeat rules", () => {
  expect(expandBatch(task(), date("2026-03-01"))).toBeNull();
  expect(() => expandBatch(task({ repeat: { freq: "daily", interval: 0 } }), date("2026-03-09"))).toThrow();
  expect(() => expandBatch(task({ repeat: { freq: "daily", interval: 1.5 } }), date("2026-03-09"))).toThrow();
  expect(() => expandBatch(task({ repeat: { freq: "daily", interval: 366 } }), date("2026-03-09"))).toThrow();
  expect(() => expandBatch(task({ repeat: { freq: "secondly", interval: 1 } as unknown as Task["repeat"] }),
    date("2026-03-09"))).toThrow();
});
