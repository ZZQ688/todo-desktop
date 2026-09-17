import { useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Mutation } from "../../application/workspace";
import type { Project } from "../../domain/models";
import { InlineMutationError } from "./InlineMutationError";
import { useModalFocus } from "./useModalFocus";

type Run = (mutation: Mutation) => Promise<boolean>;

export function ProjectDialog({ project, busy, error, run, onClose }: {
  project?: Project; busy: boolean; error: string | null; run: Run; onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(project?.name ?? "");
  const [failed, setFailed] = useState(false);
  const { modalRef, trapFocus } = useModalFocus(inputRef);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailed(false);
    if (!name.trim()) return;
    const saved = await run({ kind: "saveProject", id: project?.id ?? crypto.randomUUID(), name: name.trim() });
    if (saved) onClose();
    else setFailed(true);
  }
  return <div className="modal-backdrop" role="presentation"><div ref={modalRef} className="modal confirm-modal" role="dialog"
    aria-modal="true" aria-labelledby="project-editor-title"
    onKeyDown={(event) => { trapFocus(event); if (event.key === "Escape" && !busy) onClose(); }}>
    <div className="modal-heading"><h2 id="project-editor-title">{project ? "重命名项目" : "新建项目"}</h2>
      <button className="icon-button" aria-label="关闭" title="关闭" onClick={onClose} disabled={busy}>
        <X aria-hidden="true" /></button></div>
    <InlineMutationError show={failed} error={error} />
    <form onSubmit={submit}>
      <fieldset className="form-fieldset editor-form" disabled={busy}>
        <label className="field field-wide">项目名称<input ref={inputRef} aria-label="项目名称" value={name}
          onChange={(event) => setName(event.target.value)} required maxLength={80} /></label>
        <div className="form-actions field-wide"><button type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={!name.trim()}>保存</button></div>
      </fieldset>
    </form>
  </div></div>;
}

export function DeleteProjectDialog({ project, busy, error, run, onClose, onDeleted }: {
  project: Project; busy: boolean; error: string | null; run: Run;
  onClose: () => void; onDeleted: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  const { modalRef, trapFocus } = useModalFocus(cancelRef);
  async function removeProject() {
    setFailed(false);
    if (await run({ kind: "deleteProject", id: project.id })) onDeleted();
    else setFailed(true);
  }
  return <div className="modal-backdrop" role="presentation"><div ref={modalRef} className="modal confirm-modal" role="alertdialog"
    aria-modal="true" aria-labelledby="delete-project-title"
    onKeyDown={(event) => { trapFocus(event); if (event.key === "Escape" && !busy) onClose(); }}>
    <div className="modal-heading"><h2 id="delete-project-title">删除项目？</h2></div>
    <p>项目“{project.name}”会被删除，里面的任务会保留到“未分组”。</p>
    <InlineMutationError show={failed} error={error} />
    <div className="form-actions"><button ref={cancelRef} onClick={onClose} disabled={busy}>取消</button>
      <button className="danger-button" disabled={busy} onClick={() => void removeProject()}>删除项目</button></div>
  </div></div>;
}
