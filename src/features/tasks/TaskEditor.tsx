import { useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Mutation, Workspace } from "../../application/workspace";
import { asLocalDate, type LocalDate } from "../../domain/local-date";
import type { Priority, Task } from "../../domain/models";
import { InlineMutationError } from "../shared/InlineMutationError";
import { useModalFocus } from "../shared/useModalFocus";

interface Props {
  workspace: Workspace;
  task?: Task;
  parentId?: string | null;
  initialProjectId?: string | null;
  initialScheduledDate?: LocalDate | null;
  busy: boolean;
  error: string | null;
  run: (mutation: Mutation) => Promise<boolean>;
  onClose: () => void;
}

export function TaskEditor({ workspace, task, parentId = null, initialProjectId = null,
  initialScheduledDate = null, busy, error, run, onClose }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(task?.title ?? "");
  const [projectId, setProjectId] = useState(task?.projectId ?? initialProjectId ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "normal");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [scheduledDate, setScheduledDate] = useState(
    task ? task.scheduledDate ?? "" : initialScheduledDate ?? "",
  );
  const [failed, setFailed] = useState(false);

  const { modalRef, trapFocus } = useModalFocus(titleRef);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailed(false);
    const trimmed = title.trim();
    if (!trimmed) return;
    const saved = await run({
      kind: "saveTask",
      task: {
        id: task?.id ?? crypto.randomUUID(),
        title: trimmed,
        projectId: projectId || null,
        parentId: task?.parentId ?? parentId,
        priority,
        dueDate: dueDate ? asLocalDate(dueDate) : null,
        scheduledDate: scheduledDate ? asLocalDate(scheduledDate) : null,
      },
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
          <label className="field">优先级
            <select aria-label="优先级" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              <option value="high">高</option><option value="normal">普通</option><option value="low">低</option>
            </select>
          </label>
          <label className="field">项目
            <select aria-label="项目" value={projectId} disabled={Boolean(task?.parentId ?? parentId)}
              onChange={(event) => setProjectId(event.target.value)}>
              <option value="">无项目</option>
              {workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label className="field">截止日期
            <input aria-label="截止日期" type="date" min="0001-01-01" max="9999-12-31" value={dueDate}
              onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label className="field">安排日期
            <input aria-label="安排日期" type="date" min="0001-01-01" max="9999-12-31" value={scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)} />
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
