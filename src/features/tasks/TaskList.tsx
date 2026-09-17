import { useRef, useState } from "react";
import { CalendarClock, CalendarDays, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import type { Mutation } from "../../application/workspace";
import type { Project, RepeatRule, Task } from "../../domain/models";
import { InlineMutationError } from "../shared/InlineMutationError";
import { useModalFocus } from "../shared/useModalFocus";

export interface TaskGroup {
  parent: Task;
  children: Task[];
  contextualParent?: boolean;
}

interface Props {
  groups: TaskGroup[];
  tasks: Task[];
  projects: Project[];
  busy: boolean;
  error: string | null;
  run: (mutation: Mutation) => Promise<boolean>;
  onEdit: (task: Task) => void;
  onAddChild: (task: Task) => void;
  onAddToToday?: (task: Task) => void;
  readOnly?: boolean;
}

function describeRepeat(repeat: RepeatRule): string {
  const { freq, interval } = repeat;
  switch (freq) {
    case "daily": return interval === 1 ? "每天" : `每 ${interval} 天`;
    case "weekdays": return "每个工作日";
    case "weekly": return interval === 1 ? "每周" : `每 ${interval} 周`;
    case "monthly": return interval === 1 ? "每月" : `每 ${interval} 月`;
  }
}

function ConfirmDelete({ task, busy, error, onCancel, onConfirm }: {
  task: Task; busy: boolean; error: string | null; onCancel: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  const { modalRef, trapFocus } = useModalFocus(cancelRef);
  async function confirm() {
    setFailed(false);
    if (await onConfirm()) onCancel();
    else setFailed(true);
  }
  return <div className="modal-backdrop" role="presentation">
    <div ref={modalRef} className="modal confirm-modal" role="alertdialog" aria-modal="true"
      aria-labelledby="confirm-delete-title" aria-describedby="confirm-delete-copy"
      onKeyDown={(event) => { trapFocus(event); if (event.key === "Escape" && !busy) onCancel(); }}>
      <div className="modal-heading"><h2 id="confirm-delete-title">删除任务？</h2>
        <button className="icon-button" aria-label="关闭" title="关闭" onClick={onCancel} disabled={busy}>
          <X aria-hidden="true" /></button></div>
      <p id="confirm-delete-copy">“{task.title}”及其子任务会被永久删除。</p>
      <InlineMutationError show={failed} error={error} />
      <div className="form-actions"><button ref={cancelRef} onClick={onCancel} disabled={busy}>取消</button>
        <button className="danger-button" onClick={() => void confirm()} disabled={busy}>删除</button></div>
    </div>
  </div>;
}

function TaskRow({ task, children, contextual, projects, busy, run, onEdit, onAddChild, onAddToToday, onDelete, readOnly }: {
  task: Task; children: Task[]; contextual?: boolean; projects: Project[]; busy: boolean;
  run: Props["run"]; onEdit: Props["onEdit"]; onAddChild: Props["onAddChild"];
  onAddToToday?: Props["onAddToToday"]; onDelete: (task: Task) => void; readOnly?: boolean;
}) {
  const completedChildren = children.filter(({ status }) => status === "completed").length;
  const project = projects.find(({ id }) => id === task.projectId);
  return <div className={`task-row${contextual ? " task-row-context" : ""}`}>
    {contextual ? <span className="context-marker" aria-hidden="true" /> : readOnly ? <span aria-hidden="true" />
      : <input type="checkbox"
        checked={task.status === "completed"} disabled={busy}
        aria-label={`${task.status === "completed" ? "重新打开" : "完成"} ${task.title}`}
        onChange={() => void run({ kind: "setCompletion", ids: [task.id], completed: task.status !== "completed" })} />}
    <div className="task-main">
      <div className="task-title-line">
        <span className={task.status === "completed" && !contextual ? "task-title completed" : "task-title"}>{task.title}</span>
        {contextual && <span className="context-label">父任务</span>}
        {task.repeat !== null && <span className="repeat-badge"><Repeat aria-hidden="true" />{describeRepeat(task.repeat)}</span>}
        {task.recurrenceSourceId !== null && <span className="repeat-badge"><Repeat aria-hidden="true" />重复实例</span>}
        {!contextual && <span className={`priority-dot-view priority-dot-view--${task.priority}`}
          aria-label={task.priority === "low" ? "低" : task.priority === "normal" ? "普通" : "高"} />}
      </div>
      {!contextual && <div className="task-meta">
        {project && <span>{project.name}</span>}
        {task.dueDate && <span><CalendarClock aria-hidden="true" />截止 {task.dueDate}</span>}
        <span>建立于 {task.createdOn}</span>
        {children.length > 0 && <span>{completedChildren}/{children.length} 项子任务</span>}
      </div>}
    </div>
    {!contextual && !readOnly && <div className="row-actions">
      {!task.parentId && <button className="icon-button" aria-label={`添加 ${task.title} 的子任务`}
        title="添加子任务" onClick={() => onAddChild(task)} disabled={busy}><Plus aria-hidden="true" /></button>}
      {onAddToToday && <button className="icon-button" aria-label={`加入 ${task.title} 到今日`}
        title="加入今日" onClick={() => onAddToToday(task)} disabled={busy}><CalendarDays aria-hidden="true" /></button>}
      <button className="icon-button" aria-label={`编辑 ${task.title}`} title="编辑"
        onClick={() => onEdit(task)} disabled={busy}><Pencil aria-hidden="true" /></button>
      <button className="icon-button danger-icon" aria-label={`删除 ${task.title}`} title="删除"
        onClick={() => onDelete(task)} disabled={busy}><Trash2 aria-hidden="true" /></button>
    </div>}
  </div>;
}

export function TaskList({ groups, tasks, projects, busy, error, run, onEdit, onAddChild, onAddToToday, readOnly }: Props) {
  const [deleting, setDeleting] = useState<Task | null>(null);
  if (groups.length === 0) return <p className="empty-state">这里还没有任务</p>;
  return <>
    <ul className="task-list">
      {groups.map(({ parent, children, contextualParent }) => <li key={parent.id} data-task-id={parent.id} aria-label={parent.title}>
        <TaskRow task={parent} children={tasks.filter((task) => task.parentId === parent.id)}
          contextual={contextualParent} projects={projects}
          busy={busy} run={run} onEdit={onEdit} onAddChild={onAddChild} onAddToToday={onAddToToday} onDelete={setDeleting} readOnly={readOnly} />
        {children.length > 0 && <ul className="subtask-list">
          {children.map((child) => <li key={child.id} data-task-id={child.id} aria-label={child.title}>
            <TaskRow task={child} children={[]} projects={projects} busy={busy} run={run}
              onEdit={onEdit} onAddChild={onAddChild} onAddToToday={onAddToToday} onDelete={setDeleting} readOnly={readOnly} />
          </li>)}
        </ul>}
      </li>)}
    </ul>
    {deleting && <ConfirmDelete task={deleting} busy={busy} error={error} onCancel={() => setDeleting(null)}
      onConfirm={() => run({ kind: "deleteTasks", ids: [deleting.id] })} />}
  </>;
}
