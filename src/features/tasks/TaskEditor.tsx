import { useRef, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import type { Mutation, SubtaskDraft, Workspace } from "../../application/workspace";
import { asLocalDate } from "../../domain/local-date";
import type { Priority, RepeatFreq, RepeatRule, Task } from "../../domain/models";
import { InlineMutationError } from "../shared/InlineMutationError";
import { useModalFocus } from "../shared/useModalFocus";

const priorityDots: { value: Priority; label: string }[] = [
  { value: "low", label: "低" },
  { value: "normal", label: "普通" },
  { value: "high", label: "高" },
];

const repeatOptions: { value: "" | RepeatFreq; label: string }[] = [
  { value: "", label: "无" },
  { value: "daily", label: "每天" },
  { value: "weekdays", label: "工作日" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
];

interface Props {
  workspace: Workspace;
  task?: Task;
  parentId?: string | null;
  initialProjectId?: string | null;
  scheduleToday?: boolean;
  busy: boolean;
  error: string | null;
  run: (mutation: Mutation) => Promise<boolean>;
  onClose: () => void;
}

export function TaskEditor({ workspace, task, parentId = null, initialProjectId = null,
  scheduleToday = false, busy, error, run, onClose }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(task?.title ?? "");
  const [projectId, setProjectId] = useState(task?.projectId ?? initialProjectId ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "normal");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>(() =>
    task ? workspace.tasks.filter((t) => t.parentId === task.id).map(({ id, title }) => ({ id, title })) : [],
  );
  const [repeat, setRepeat] = useState<RepeatRule | null>(task?.repeat ?? null);
  const [failed, setFailed] = useState(false);

  const isSubtask = Boolean(task?.parentId ?? parentId);

  const { modalRef, trapFocus } = useModalFocus(titleRef);

  function addSubtask() {
    setSubtasks((prev) => [...prev, { id: crypto.randomUUID(), title: "" }]);
  }

  function updateSubtask(id: string, title: string) {
    setSubtasks((prev) => prev.map((subtask) => (subtask.id === id ? { ...subtask, title } : subtask)));
  }

  function removeSubtask(id: string) {
    setSubtasks((prev) => prev.filter((subtask) => subtask.id !== id));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailed(false);
    const trimmed = title.trim();
    if (!trimmed) return;
    const interval = Math.min(365, Math.max(1, repeat?.interval ?? 1));
    const saved = await run({
      kind: "saveTask",
      task: {
        id: task?.id ?? crypto.randomUUID(),
        title: trimmed,
        projectId: projectId || null,
        parentId: task?.parentId ?? parentId,
        priority,
        dueDate: dueDate ? asLocalDate(dueDate) : null,
        repeat: repeat ? { freq: repeat.freq, interval: repeat.freq === "weekdays" ? 1 : interval } : null,
      },
      subtasks,
      scheduleToday,
    });
    if (saved) onClose();
    else setFailed(true);
  }

  return <div className="modal-backdrop" role="presentation">
    <div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="task-editor-title"
      onKeyDown={(event) => { trapFocus(event); if (event.key === "Escape" && !busy) onClose(); }}>
      <div className="modal-heading">
        <h2 id="task-editor-title">{task ? "编辑任务" : parentId ? "添加子任务" : "新建任务"}</h2>
        <button type="button" className="icon-button" aria-label="关闭" title="关闭"
          onClick={onClose} disabled={busy}><X aria-hidden="true" /></button>
      </div>
      <InlineMutationError show={failed} error={error} />
      <form onSubmit={submit}>
        <fieldset className="form-fieldset editor-form" disabled={busy}>
          <label className="field field-wide">任务名称
            <input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)}
              required maxLength={200} autoComplete="off" />
          </label>
          <div className="field">优先级
            <div className="priority-dots" role="group" aria-label="优先级">
              {priorityDots.map(({ value, label }) => (
                <button key={value} type="button" aria-label={label} aria-pressed={priority === value}
                  className={`priority-dot priority-dot-${value}${priority === value ? " selected" : ""}`}
                  onClick={() => setPriority(value)}>
                  <span className="priority-dot-swatch" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <label className="field">分组
            <select aria-label="分组" value={projectId} disabled={isSubtask}
              onChange={(event) => setProjectId(event.target.value)}>
              <option value="">未分组</option>
              {workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          {!isSubtask && <fieldset className="subtasks-field field-wide">
            <legend>子任务</legend>
            <ul className="subtask-edit-list">
              {subtasks.map((subtask) => (
                <li key={subtask.id} className="subtask-edit-row">
                  <input aria-label="子任务" value={subtask.title} placeholder="子任务标题" maxLength={200}
                    onChange={(event) => updateSubtask(subtask.id, event.target.value)} />
                  <button type="button" className="icon-button danger-icon" aria-label="删除子任务" title="删除"
                    onClick={() => removeSubtask(subtask.id)}><X aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={addSubtask}><Plus aria-hidden="true" />添加子任务</button>
          </fieldset>}
          <label className="field">重复
            <select aria-label="重复" value={repeat?.freq ?? ""}
              onChange={(event) => {
                const freq = event.target.value;
                if (freq === "") setRepeat(null);
                else setRepeat({ freq: freq as RepeatFreq, interval: repeat?.interval ?? 1 });
              }}>
              {repeatOptions.map(({ value, label }) => <option key={value || "none"} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">间隔
            <input aria-label="间隔" type="number" min={1} max={365} value={repeat?.interval ?? 1}
              disabled={!repeat || repeat.freq === "weekdays"}
              onChange={(event) => {
                if (!repeat) return;
                setRepeat({ ...repeat, interval: Number(event.target.value) });
              }} />
          </label>
          <label className="field">截止日期
            <input aria-label="截止日期" type="date" min="0001-01-01" max="9999-12-31" value={dueDate}
              onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <div className="form-actions field-wide">
            <button type="button" onClick={onClose}>取消</button>
            <button className="primary-button" type="submit" disabled={!title.trim()}>
              {busy ? "保存中" : "保存"}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  </div>;
}
