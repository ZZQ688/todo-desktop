import { useRef, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Mutation } from "../../application/workspace";
import type { Project, Task } from "../../domain/models";
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
}

const priorityLabels = { high: "高优先级", normal: "普通优先级", low: "低优先级" } as const;

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

function TaskRow({ task, children, contextual, projects, busy, run, onEdit, onAddChild, onDelete }: {
  task: Task; children: Task[]; contextual?: boolean; projects: Project[]; busy: boolean;
  run: Props["run"]; onEdit: Props["onEdit"]; onAddChild: Props["onAddChild"];
  onDelete: (task: Task) => void;
}) {
  const completedChildren = children.filter(({ status }) => status === "completed").length;
  const project = projects.find(({ id }) => id === task.projectId);
  return <div className={`task-row${contextual ? " task-row-context" : ""}`}>
    {contextual ? <span className="context-marker" aria-hidden="true" /> : <input type="checkbox"
      checked={task.status === "completed"} disabled={busy}
      aria-label={`${task.status === "completed" ? "重新打开" : "完成"} ${task.title}`}
      onChange={() => void run({ kind: "setCompletion", id: task.id, completed: task.status !== "completed" })} />}
    <div className="task-main">
      <div className="task-title-line">
        <span className={task.status === "completed" && !contextual ? "task-title completed" : "task-title"}>{task.title}</span>
        {contextual && <span className="context-label">父任务</span>}
        {!contextual && <span className={`priority priority-${task.priority}`}>{priorityLabels[task.priority]}</span>}
      </div>
      {!contextual && <div className="task-meta">
        {project && <span>{project.name}</span>}
        {task.dueDate && <span><CalendarClock aria-hidden="true" />截止 {task.dueDate}</span>}
        {children.length > 0 && <span>{completedChildren}/{children.length} 项子任务</span>}
      </div>}
    </div>
    {!contextual && <div className="row-actions">
      {!task.parentId && <button className="icon-button" aria-label={`添加 ${task.title} 的子任务`}
        title="添加子任务" onClick={() => onAddChild(task)} disabled={busy}><Plus aria-hidden="true" /></button>}
      <button className="icon-button" aria-label={`编辑 ${task.title}`} title="编辑"
        onClick={() => onEdit(task)} disabled={busy}><Pencil aria-hidden="true" /></button>
      <button className="icon-button danger-icon" aria-label={`删除 ${task.title}`} title="删除"
        onClick={() => onDelete(task)} disabled={busy}><Trash2 aria-hidden="true" /></button>
    </div>}
  </div>;
}

export function TaskList({ groups, tasks, projects, busy, error, run, onEdit, onAddChild }: Props) {
  const [deleting, setDeleting] = useState<Task | null>(null);
  if (groups.length === 0) return <p className="empty-state">这里还没有任务</p>;
  return <>
    <ul className="task-list">
      {groups.map(({ parent, children, contextualParent }) => <li key={parent.id} aria-label={parent.title}>
        <TaskRow task={parent} children={tasks.filter((task) => task.parentId === parent.id)}
          contextual={contextualParent} projects={projects}
          busy={busy} run={run} onEdit={onEdit} onAddChild={onAddChild} onDelete={setDeleting} />
        {children.length > 0 && <ul className="subtask-list">
          {children.map((child) => <li key={child.id} aria-label={child.title}>
            <TaskRow task={child} children={[]} projects={projects} busy={busy} run={run}
              onEdit={onEdit} onAddChild={onAddChild} onDelete={setDeleting} />
          </li>)}
        </ul>}
      </li>)}
    </ul>
    {deleting && <ConfirmDelete task={deleting} busy={busy} error={error} onCancel={() => setDeleting(null)}
      onConfirm={() => run({ kind: "deleteTask", id: deleting.id })} />}
  </>;
}
