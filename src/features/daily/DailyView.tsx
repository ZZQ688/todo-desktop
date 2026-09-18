import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Plus } from "lucide-react";
import type { Mutation, Workspace } from "../../application/workspace";
import { addDays, asLocalDate, type LocalDate } from "../../domain/local-date";
import type { Task } from "../../domain/models";
import { MultiSelectBar } from "../shared/MultiSelectBar";
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
  const [status, setStatus] = useState<"all" | "open" | "completed">("all");
  const [editor, setEditor] = useState<EditorState>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const todayDate = today();
  const isToday = date === todayDate;
  const readOnly = date < todayDate;

  function exitSelection() {
    setSelecting(false);
    setSelectedIds(new Set());
  }

  function toggleSelecting() {
    setSelecting((selecting) => !selecting);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!selecting) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") exitSelection();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selecting]);

  async function bulk(mutation: Mutation) {
    if (await run(mutation)) exitSelection();
  }

  const selectedArray = [...selectedIds];

  const groups = useMemo(() => {
    const scheduled = new Set(workspace.entries.filter((entry) => entry.localDate === date)
      .map((entry) => entry.taskId));
    const build = (parent: Task): TaskGroup | null => {
      const parentScheduled = scheduled.has(parent.id);
      const children = workspace.tasks
        .filter((task) => task.parentId === parent.id)
        .map((child) => build(child))
        .filter((group): group is TaskGroup => group !== null);
      if (parentScheduled) return { parent, children };
      if (children.length) return { parent, children, contextualParent: true };
      return null;
    };
    const result: TaskGroup[] = workspace.tasks
      .filter((task) => task.parentId === null)
      .map((root) => build(root))
      .filter((group): group is TaskGroup => group !== null);
    // Scheduled tasks whose parent no longer exists show as standalone roots.
    for (const task of workspace.tasks) {
      if (task.parentId && scheduled.has(task.id) && !workspace.tasks.some(({ id }) => id === task.parentId)) {
        result.push({ parent: task, children: [] });
      }
    }
    const applyStatus = (group: TaskGroup): TaskGroup | null => {
      const children = group.children
        .map((child) => applyStatus(child))
        .filter((child): child is TaskGroup => child !== null);
      if (group.contextualParent) return children.length ? { ...group, children } : null;
      const parentMatchesStatus = status === "all" || group.parent.status === status;
      if (parentMatchesStatus) return { ...group, children };
      if (children.length) return { ...group, children, contextualParent: true };
      return null;
    };
    return result.map((group) => applyStatus(group)).filter((group): group is TaskGroup => group !== null);
  }, [date, status, workspace]);

  return <>
    <header className="view-heading"><div><h1>每日待办</h1><p>{date}</p></div>
      {!readOnly && <button className="primary-button" onClick={() => setEditor({})}><Plus aria-hidden="true" />添加任务</button>}
    </header>
    <div className="date-toolbar">
      <button className="icon-button" aria-label="上一天" title="上一天" disabled={date === "0001-01-01"}
        onClick={() => onDateChange(addDays(date, -1))}><ArrowLeft aria-hidden="true" /></button>
      <input aria-label="日期" type="date" min="0001-01-01" max={todayDate} value={date}
        onChange={(event) => {
          if (event.target.value && event.target.validity.valid && event.target.value <= todayDate) {
            onDateChange(asLocalDate(event.target.value));
          }
        }} />
      {!isToday && <button onClick={() => onDateChange(todayDate)}><CalendarDays aria-hidden="true" />回到今天</button>}
    </div>
    {readOnly && <p className="history-hint">浏览历史 · {date}</p>}
    <div className="filter-toolbar">
      <label><span className="sr-only">任务状态</span><select value={status}
        onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="任务状态">
        <option value="all">全部状态</option><option value="open">未完成</option><option value="completed">已完成</option>
      </select></label>
      {!readOnly && <button aria-pressed={selecting} onClick={toggleSelecting}>多选</button>}
    </div>
    <TaskList groups={groups} tasks={workspace.tasks} projects={workspace.projects} busy={busy} error={error} run={run}
      readOnly={readOnly} selectable={selecting} selected={selectedIds} onToggleSelected={toggleSelected}
      onEdit={(task) => setEditor({ task })} onAddChild={(parent) => setEditor({ parent })}
      onRemoveFromToday={(task) => void run({ kind: "removeFromToday", ids: [task.id] })} />
    {selecting && <MultiSelectBar count={selectedIds.size} busy={busy} projects={workspace.projects}
      onComplete={() => void bulk({ kind: "setCompletion", ids: selectedArray, completed: true })}
      onReopen={() => void bulk({ kind: "setCompletion", ids: selectedArray, completed: false })}
      onDelete={() => void bulk({ kind: "deleteTasks", ids: selectedArray })}
      onRemoveFromToday={() => void bulk({ kind: "removeFromToday", ids: selectedArray })}
      onMoveToGroup={(projectId) => void bulk({ kind: "moveToGroup", ids: selectedArray, projectId })}
      onExit={exitSelection} />}
    {editor && <TaskEditor workspace={workspace} task={editor.task} parentId={editor.parent?.id}
      initialProjectId={editor.parent?.projectId} scheduleToday={true} busy={busy} run={run}
      error={error}
      onClose={() => setEditor(null)} />}
  </>;
}
