export type LocalDate = string & { readonly __localDate: unique symbol };

export function asLocalDate(value: string): LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
    throw new RangeError("Invalid local date");
  }
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RangeError("Invalid local date");
  }
  return value as LocalDate;
}

export function localToday(now = new Date()): LocalDate {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return asLocalDate(`${year}-${month}-${day}`);
}

export function addDays(value: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) throw new RangeError("Days must be an integer");
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return asLocalDate(date.toISOString().slice(0, 10));
}
