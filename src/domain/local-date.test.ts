import { expect, test } from "vitest";
import { addDays, asLocalDate, localToday } from "./local-date";

test("rejects malformed and nonexistent dates", () => {
  for (const value of ["2026-02-29", "2026-13-01", "2026-9-1", "0000-01-01", ""]) {
    expect(() => asLocalDate(value)).toThrow(RangeError);
  }
  expect(asLocalDate("2024-02-29")).toBe("2024-02-29");
});

test("moves across month, leap-day, and year boundaries", () => {
  expect(addDays(asLocalDate("2024-02-28"), 1)).toBe("2024-02-29");
  expect(addDays(asLocalDate("2026-03-01"), -1)).toBe("2026-02-28");
  expect(addDays(asLocalDate("2026-12-31"), 1)).toBe("2027-01-01");
  expect(() => addDays(asLocalDate("2026-09-16"), 0.5)).toThrow(RangeError);
});

test("today follows the local calendar near both ends of the day", () => {
  expect(localToday(new Date(2026, 8, 16, 0, 30))).toBe("2026-09-16");
  expect(localToday(new Date(2026, 8, 16, 23, 30))).toBe("2026-09-16");
});
