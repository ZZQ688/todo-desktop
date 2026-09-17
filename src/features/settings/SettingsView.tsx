import { useState, type FormEvent } from "react";
import { CalendarSync, Trash2 } from "lucide-react";
import type { Mutation, Workspace } from "../../application/workspace";
import { asLocalDate, type LocalDate } from "../../domain/local-date";
import type { Priority, RecurrenceRule } from "../../domain/models";

interface Props {
  workspace: Workspace;
  busy: boolean;
  run: (mutation: Mutation) => Promise<boolean>;
  today: () => LocalDate;
}

type Frequency = "daily" | "weekdays" | "weekly" | "monthly";

function toRrule(frequency: Frequency, interval: number): string {
  if (frequency === "weekdays") return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  const kind = frequency === "daily" ? "DAILY" : frequency === "weekly" ? "WEEKLY" : "MONTHLY";
  return `FREQ=${kind};INTERVAL=${interval}`;
}

function describeRule(rule: RecurrenceRule): string {
  if (rule.rrule.includes("BYDAY=MO,TU,WE,TH,FR")) return "每个工作日";
  const interval = rule.rrule.match(/INTERVAL=(\d+)/)?.[1] ?? "1";
  if (rule.rrule.startsWith("FREQ=DAILY")) return interval === "1" ? "每天" : `每 ${interval} 天`;
  if (rule.rrule.startsWith("FREQ=WEEKLY")) return interval === "1" ? "每周" : `每 ${interval} 周`;
  return interval === "1" ? "每月" : `每 ${interval} 月`;
}

export function SettingsView({ workspace, busy, run, today }: Props) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [interval, setInterval] = useState(1);
  const [startDate, setStartDate] = useState<LocalDate>(today);
  const [endDate, setEndDate] = useState("");

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const saved = await run({ kind: "saveRule", rule: {
      id: crypto.randomUUID(),
      template: { projectId: projectId || null, title: title.trim(), priority, dueDate: null },
      rrule: toRrule(frequency, interval), startDate,
      endDate: endDate ? asLocalDate(endDate) : null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    } });
    if (saved) setTitle("");
  }

  return <>
    <header className="view-heading"><div><h1>设置</h1><p>外观与重复任务</p></div></header>
    <section className="settings-section" aria-labelledby="density-heading">
      <div><h2 id="density-heading">界面密度</h2></div>
      <div className="segmented" role="group" aria-label="界面密度">
        <button className={workspace.settings.density === "comfortable" ? "selected" : ""}
          aria-pressed={workspace.settings.density === "comfortable"} disabled={busy}
          onClick={() => void run({ kind: "saveSettings", density: "comfortable" })}>舒适</button>
        <button className={workspace.settings.density === "compact" ? "selected" : ""}
          aria-pressed={workspace.settings.density === "compact"} disabled={busy}
          onClick={() => void run({ kind: "saveSettings", density: "compact" })}>紧凑</button>
      </div>
    </section>
    <section className="settings-section recurrence-section" aria-labelledby="recurrence-heading">
      <div><h2 id="recurrence-heading">重复任务</h2><p>按日期生成独立任务，停止规则不会删除已经生成的任务。</p></div>
      <form onSubmit={saveRule}>
        <fieldset className="form-fieldset recurrence-form" disabled={busy}>
        <label className="field field-wide">任务名称
          <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
        </label>
        <label className="field">重复方式<select aria-label="重复方式" value={frequency}
          onChange={(event) => setFrequency(event.target.value as Frequency)}>
          <option value="daily">每天</option><option value="weekdays">工作日</option>
          <option value="weekly">每周</option><option value="monthly">每月</option>
        </select></label>
        <label className="field">间隔
          <input aria-label="间隔" type="number" min={1} max={365} step={1} value={interval} disabled={frequency === "weekdays"}
            onChange={(event) => setInterval(Math.max(1, Number(event.target.value) || 1))} />
        </label>
        <label className="field">开始日期
          <input aria-label="开始日期" type="date" min="0001-01-01" max="9999-12-31" value={startDate} required
            onChange={(event) => {
              if (event.target.value && event.target.validity.valid) setStartDate(asLocalDate(event.target.value));
            }} />
        </label>
        <label className="field">结束日期（可选）
          <input aria-label="结束日期（可选）" type="date" min={startDate} max="9999-12-31" value={endDate}
            onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <label className="field">项目<select aria-label="项目" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">无项目</option>{workspace.projects.map((project) =>
            <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="field">优先级<select aria-label="优先级" value={priority}
          onChange={(event) => setPriority(event.target.value as Priority)}>
          <option value="high">高</option><option value="normal">普通</option><option value="low">低</option>
        </select></label>
        <div className="field-wide recurrence-submit"><button className="primary-button" type="submit"
          disabled={!title.trim()}><CalendarSync aria-hidden="true" />创建重复任务</button></div>
        </fieldset>
      </form>
      {workspace.rules.length === 0 ? <p className="empty-state compact-empty">还没有重复任务</p> :
        <ul className="rule-list">{workspace.rules.map((rule) => <li key={rule.id}>
          <div><strong>{rule.template.title}</strong><span>{describeRule(rule)} · 从 {rule.startDate}
            {rule.endDate ? ` 到 ${rule.endDate}` : ""}</span></div>
          <button className="icon-button danger-icon" aria-label={`停止 ${rule.template.title}`} title="停止重复"
            disabled={busy} onClick={() => void run({ kind: "deleteRule", id: rule.id })}>
            <Trash2 aria-hidden="true" /></button>
        </li>)}</ul>}
    </section>
  </>;
}
