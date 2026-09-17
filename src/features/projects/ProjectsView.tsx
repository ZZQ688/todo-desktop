import { useMemo, useRef, useState, type FormEvent } from "react";
import { Folder, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { Mutation, Workspace } from "../../application/workspace";
import type { Project, Task } from "../../domain/models";
import { InlineMutationError } from "../shared/InlineMutationError";
import { useModalFocus } from "../shared/useModalFocus";
import { TaskEditor } from "../tasks/TaskEditor";
import { TaskList, type TaskGroup } from "../tasks/TaskList";

interface Props {
  workspace: Workspace;
  busy: boolean;
  error: string | null;
  run: (mutation: Mutation) => Promise<boolean>;
}
type EditorState = { task?: Task; parent?: Task } | null;

function ProjectDialog({ project, busy, error, run, onClose }: {
  project?: Project; busy: boolean; error: string | null; run: Props["run"]; onClose: () => void;
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

function DeleteProjectDialog({ project, busy, error, run, onClose, onDeleted }: {
  project: Project; busy: boolean; error: string | null; run: Props["run"];
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
    <p>项目“{project.name}”会被删除，里面的任务会保留到“无项目”。</p>
    <InlineMutationError show={failed} error={error} />
    <div className="form-actions"><button ref={cancelRef} onClick={onClose} disabled={busy}>取消</button>
      <button className="danger-button" disabled={busy} onClick={() => void removeProject()}>删除项目</button></div>
  </div></div>;
}

export function ProjectsView({ workspace, busy, error, run }: Props) {
  const [selected, setSelected] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "completed">("all");
  const [editor, setEditor] = useState<EditorState>(null);
  const [projectEditor, setProjectEditor] = useState<Project | "new" | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const selectedProject = workspace.projects.find(({ id }) => id === selected);

  const groups = useMemo(() => {
    const inSelection = (task: Task) => selected === "all" ||
      (selected === "none" ? task.projectId === null : task.projectId === selected);
    const roots = workspace.tasks.filter((task) => task.parentId === null && inSelection(task));
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return roots.flatMap((parent): TaskGroup[] => {
      const allChildren = workspace.tasks.filter((task) => task.parentId === parent.id && inSelection(task));
      const parentMatches = parent.title.toLocaleLowerCase("zh-CN").includes(needle);
      const children = allChildren.filter((child) => {
        const searchMatches = !needle || parentMatches || child.title.toLocaleLowerCase("zh-CN").includes(needle);
        return searchMatches && (status === "all" || child.status === status);
      });
      if ((!needle || parentMatches) && (status === "all" || parent.status === status)) {
        return [{ parent, children }];
      }
      return children.length ? [{ parent, children, contextualParent: true }] : [];
    });
  }, [query, selected, status, workspace.tasks]);

  return <>
    <header className="view-heading"><div><h1>项目</h1><p>{selectedProject?.name ?? (selected === "none" ? "无项目" : "全部任务")}</p></div>
      <button className="primary-button" onClick={() => setEditor({})}><Plus aria-hidden="true" />新建任务</button>
    </header>
    <div className="project-layout">
      <aside className="project-sidebar" aria-label="项目列表">
        <div className="project-sidebar-heading"><span>项目</span>
          <button className="icon-button" aria-label="新建项目" title="新建项目" onClick={() => setProjectEditor("new")}>
            <Plus aria-hidden="true" /></button></div>
        <button className={selected === "all" ? "project-link selected" : "project-link"}
          onClick={() => setSelected("all")}><Folder aria-hidden="true" />全部任务
          <span>{workspace.tasks.filter((task) => !task.parentId).length}</span></button>
        <button className={selected === "none" ? "project-link selected" : "project-link"}
          onClick={() => setSelected("none")}><Folder aria-hidden="true" />无项目
          <span>{workspace.tasks.filter((task) => !task.parentId && !task.projectId).length}</span></button>
        {workspace.projects.map((project) => <button key={project.id}
          className={selected === project.id ? "project-link selected" : "project-link"}
          onClick={() => setSelected(project.id)}><Folder aria-hidden="true" />{project.name}
          <span>{workspace.tasks.filter((task) => !task.parentId && task.projectId === project.id).length}</span></button>)}
      </aside>
      <div className="project-content">
        <div className="filter-toolbar project-tools">
          <label className="search-field"><Search aria-hidden="true" /><span className="sr-only">搜索任务</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务" /></label>
          <label><span className="sr-only">任务状态</span><select value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="任务状态">
            <option value="all">全部状态</option><option value="open">未完成</option><option value="completed">已完成</option>
          </select></label>
          {selectedProject && <div className="project-actions">
            <button className="icon-button" aria-label={`重命名 ${selectedProject.name}`} title="重命名项目"
              onClick={() => setProjectEditor(selectedProject)}><Pencil aria-hidden="true" /></button>
            <button className="icon-button danger-icon" aria-label={`删除 ${selectedProject.name}`} title="删除项目"
              onClick={() => setDeletingProject(selectedProject)}><Trash2 aria-hidden="true" /></button>
          </div>}
        </div>
        <TaskList groups={groups} tasks={workspace.tasks} projects={workspace.projects} busy={busy} error={error} run={run}
          onEdit={(task) => setEditor({ task })} onAddChild={(parent) => setEditor({ parent })} />
      </div>
    </div>
    {editor && <TaskEditor workspace={workspace} task={editor.task} parentId={editor.parent?.id}
      initialProjectId={editor.parent?.projectId ?? selectedProject?.id ?? null} busy={busy} run={run}
      error={error}
      onClose={() => setEditor(null)} />}
    {projectEditor && <ProjectDialog project={projectEditor === "new" ? undefined : projectEditor} busy={busy} error={error}
      run={run} onClose={() => setProjectEditor(null)} />}
    {deletingProject && <DeleteProjectDialog project={deletingProject} busy={busy} error={error} run={run}
      onClose={() => setDeletingProject(null)} onDeleted={() => { setDeletingProject(null); setSelected("all"); }} />}
  </>;
}
