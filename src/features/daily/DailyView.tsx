import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { addDays, asLocalDate, type LocalDate } from "../../domain/local-date";

interface Props {
  date: LocalDate;
  today: () => LocalDate;
  onDateChange: (date: LocalDate) => void;
}

export function DailyView({ date, today, onDateChange }: Props) {
  return <>
    <h1>每日待办</h1>
    <div className="date-toolbar">
      <button aria-label="上一天" title="上一天" disabled={date === "0001-01-01"}
        onClick={() => onDateChange(addDays(date, -1))}><ArrowLeft aria-hidden="true" /></button>
      <input aria-label="日期" type="date" min="0001-01-01" max="9999-12-31" value={date}
        onChange={(event) => {
          if (event.target.value && event.target.validity.valid) {
            onDateChange(asLocalDate(event.target.value));
          }
        }} />
      <button aria-label="下一天" title="下一天" disabled={date === "9999-12-31"}
        onClick={() => onDateChange(addDays(date, 1))}><ArrowRight aria-hidden="true" /></button>
      <button onClick={() => onDateChange(today())}><CalendarDays aria-hidden="true" />今天</button>
    </div>
    <p className="empty-state">未加载任务</p>
  </>;
}
