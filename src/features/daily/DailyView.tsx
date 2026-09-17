import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Plus, Search } from "lucide-react";
import type { Mutation, Workspace } from "../../application/workspace";
import { addDays, asLocalDate, type LocalDate } from "../../domain/local-date";
import type { Task } from "../../domain/models";
import { TaskEditor } from "../tasks/TaskEditor";
import { TaskList, type TaskGroup } from "../tasks/TaskList";

interface Props {
  workspace: Workspace;
  date: LocalDate;
  today: () => LocalDate;
  onDateChange: (date: LocalDate) => void;
  busy: boolean;
  error: string | null;
  run: (mutation: Mutation) => Promise<boolean>;
}

type EditorState = { task?: Task; parent?: Task } | null;

export function DailyView({ workspace, date, today, onDateChange, busy, error, run }: Props) {
  const [quickTitle, setQuickTitle] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "completed">("all");
  const [editor, setEditor] = useState<EditorState>(null);

  const groups = useMemo(() => {
    const scheduled = new Set(workspace.entries.filter((entry) => entry.localDate === date)
      .map((entry) => entry.taskId));
    const roots = workspace.tasks.filter((task) => task.parentId === null);
    const result: TaskGroup[] = [];
    for (const parent of roots) {
      const allChildren = workspace.tasks.filter((task) => task.parentId === parent.id);
      const parentScheduled = scheduled.has(parent.id);
      const children = allChildren.filter((child) => scheduled.has(child.id));
      if (!parentScheduled && children.length === 0) continue;
      result.push({ parent, children, contextualParent: !parentScheduled });
    }
    for (const task of workspace.tasks) {
      if (task.parentId && scheduled.has(task.id) && !workspace.tasks.some(({ id }) => id === task.parentId)) {
        result.push({ parent: task, children: [] });
      }
    }
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return result.flatMap((group) => {
      const parentMatches = group.parent.title.toLocaleLowerCase("zh-CN").includes(needle);
      const children = group.children.filter((child) => {
        const matchesSearch = !needle || parentMatches || child.title.toLocaleLowerCase("zh-CN").includes(needle);
        return matchesSearch && (status === "all" || child.status === status);
      });
      const parentMatchesStatus = status === "all" || group.parent.status === status;
      if (group.contextualParent) return children.length ? [{ ...group, children }] : [];
      if ((!needle || parentMatches) && parentMatchesStatus) return [{ ...group, children }];
      if (children.length) return [{ ...group, children, contextualParent: true }];
      return [];
    });
  }, [date, query, status, workspace]);

  async function addQuickTask(event: FormEvent) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    const saved = await run({ kind: "saveTask", task: {
      id: crypto.randomUUID(), title, projectId: null, parentId: null,
      priority: "normal", dueDate: null, scheduledDate: date,
    } });
    if (saved) setQuickTitle("");
  }

  return <>
    <header className="view-heading"><div><h1>每日待办</h1><p>{date}</p></div>
      <button className="primary-button" onClick={() => setEditor({})}><Plus aria-hidden="true" />详细新建</button>
    </header>
    <div className="date-toolbar">
      <button className="icon-button" aria-label="上一天" title="上一天" disabled={date === "0001-01-01"}
        onClick={() => onDateChange(addDays(date, -1))}><ArrowLeft aria-hidden="true" /></button>
      <input aria-label="日期" type="date" min="0001-01-01" max="9999-12-31" value={date}
        onChange={(event) => {
          if (event.target.value && event.target.validity.valid) onDateChange(asLocalDate(event.target.value));
        }} />
      <button className="icon-button" aria-label="下一天" title="下一天" disabled={date === "9999-12-31"}
        onClick={() => onDateChange(addDays(date, 1))}><ArrowRight aria-hidden="true" /></button>
      <button onClick={() => onDateChange(today())}><CalendarDays aria-hidden="true" />今天</button>
    </div>
    <form onSubmit={addQuickTask}>
      <fieldset className="form-fieldset quick-add" disabled={busy}>
      <label className="sr-only" htmlFor="quick-task">快速添加任务</label>
      <input id="quick-task" aria-label="快速添加任务" value={quickTitle}
        onChange={(event) => setQuickTitle(event.target.value)} placeholder="添加今天的任务" maxLength={200} />
      <button className="primary-button" type="submit" disabled={!quickTitle.trim()}>
        <Plus aria-hidden="true" />添加任务</button>
      </fieldset>
    </form>
    <div className="filter-toolbar">
      <label className="search-field"><Search aria-hidden="true" /><span className="sr-only">搜索任务</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务" /></label>
      <label><span className="sr-only">任务状态</span><select value={status}
        onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="任务状态">
        <option value="all">全部状态</option><option value="open">未完成</option><option value="completed">已完成</option>
      </select></label>
    </div>
    <TaskList groups={groups} tasks={workspace.tasks} projects={workspace.projects} busy={busy} error={error} run={run}
      onEdit={(task) => setEditor({ task })} onAddChild={(parent) => setEditor({ parent })} />
    {editor && <TaskEditor workspace={workspace} task={editor.task} parentId={editor.parent?.id}
      initialProjectId={editor.parent?.projectId} initialScheduledDate={date} busy={busy} run={run}
      error={error}
      onClose={() => setEditor(null)} />}
  </>;
}
