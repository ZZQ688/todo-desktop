import { useEffect, useMemo, useState } from "react";
import { Folder, Pencil, Plus, Trash2 } from "lucide-react";
import type { Mutation, Workspace } from "../../application/workspace";
import type { Project, Task } from "../../domain/models";
import { MultiSelectBar } from "../shared/MultiSelectBar";
import { DeleteProjectDialog, ProjectDialog } from "../shared/ProjectDialogs";
import { TaskEditor } from "../tasks/TaskEditor";
import { TaskList, type TaskGroup } from "../tasks/TaskList";

interface Props {
  workspace: Workspace;
  busy: boolean;
  error: string | null;
  run: (mutation: Mutation) => Promise<boolean>;
}
type EditorState = { task?: Task; parent?: Task } | null;

function isInstanceTask(task: Task): boolean {
  return task.recurrenceSourceId !== null;
}

export function ProjectsView({ workspace, busy, error, run }: Props) {
  const [selected, setSelected] = useState("all");
  const [status, setStatus] = useState<"all" | "open" | "completed">("all");
  const [editor, setEditor] = useState<EditorState>(null);
  const [projectEditor, setProjectEditor] = useState<Project | "new" | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedProject = workspace.projects.find(({ id }) => id === selected);

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
    const inSelection = (task: Task) => selected === "all" ||
      (selected === "none" ? task.projectId === null : task.projectId === selected);
    const roots = workspace.tasks.filter((task) =>
      task.parentId === null && !isInstanceTask(task) && inSelection(task));
    return roots.flatMap((parent): TaskGroup[] => {
      const children = workspace.tasks.filter((task) =>
        task.parentId === parent.id && !isInstanceTask(task) && inSelection(task) &&
        (status === "all" || task.status === status));
      if (status === "all" || parent.status === status) return [{ parent, children }];
      return children.length ? [{ parent, children, contextualParent: true }] : [];
    });
  }, [selected, status, workspace.tasks]);

  return <>
    <header className="view-heading"><div><h1>项目</h1><p>{selectedProject?.name ?? (selected === "none" ? "未分组" : "全部任务")}</p></div>
      <button className="primary-button" onClick={() => setEditor({})}><Plus aria-hidden="true" />新建任务</button>
    </header>
    <div className="project-layout">
      <aside className="project-sidebar" aria-label="项目列表">
        <div className="project-sidebar-heading"><span>项目</span>
          <button className="icon-button" aria-label="新建项目" title="新建项目" onClick={() => setProjectEditor("new")}>
            <Plus aria-hidden="true" /></button></div>
        <button className={selected === "all" ? "project-link selected" : "project-link"}
          onClick={() => setSelected("all")}><Folder aria-hidden="true" />全部任务
          <span>{workspace.tasks.filter((task) => !task.parentId && !isInstanceTask(task)).length}</span></button>
        <button className={selected === "none" ? "project-link selected" : "project-link"}
          onClick={() => setSelected("none")}><Folder aria-hidden="true" />未分组
          <span>{workspace.tasks.filter((task) => !task.parentId && !task.projectId && !isInstanceTask(task)).length}</span></button>
        {workspace.projects.map((project) => <button key={project.id} data-project-id={project.id}
          className={selected === project.id ? "project-link selected" : "project-link"}
          onClick={() => setSelected(project.id)}><Folder aria-hidden="true" />{project.name}
          <span>{workspace.tasks.filter((task) => !task.parentId && task.projectId === project.id && !isInstanceTask(task)).length}</span></button>)}
      </aside>
      <div className="project-content">
        <div className="filter-toolbar project-tools">
          <label><span className="sr-only">任务状态</span><select value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="任务状态">
            <option value="all">全部状态</option><option value="open">未完成</option><option value="completed">已完成</option>
          </select></label>
          <button aria-pressed={selecting} onClick={toggleSelecting}>多选</button>
          {selectedProject && <div className="project-actions">
            <button className="icon-button" aria-label={`重命名 ${selectedProject.name}`} title="重命名项目"
              onClick={() => setProjectEditor(selectedProject)}><Pencil aria-hidden="true" /></button>
            <button className="icon-button danger-icon" aria-label={`删除 ${selectedProject.name}`} title="删除项目"
              onClick={() => setDeletingProject(selectedProject)}><Trash2 aria-hidden="true" /></button>
          </div>}
        </div>
        <TaskList groups={groups} tasks={workspace.tasks} projects={workspace.projects} busy={busy} error={error} run={run}
          selectable={selecting} selected={selectedIds} onToggleSelected={toggleSelected}
          onEdit={(task) => setEditor({ task })} onAddChild={(parent) => setEditor({ parent })}
          onAddToToday={(task) => void run({ kind: "addToToday", ids: [task.id] })} />
        {selecting && <MultiSelectBar count={selectedIds.size} busy={busy} projects={workspace.projects}
          onComplete={() => void bulk({ kind: "setCompletion", ids: selectedArray, completed: true })}
          onReopen={() => void bulk({ kind: "setCompletion", ids: selectedArray, completed: false })}
          onDelete={() => void bulk({ kind: "deleteTasks", ids: selectedArray })}
          onAddToToday={() => void bulk({ kind: "addToToday", ids: selectedArray })}
          onMoveToGroup={(projectId) => void bulk({ kind: "moveToGroup", ids: selectedArray, projectId })}
          onExit={exitSelection} />}
      </div>
    </div>
    {editor && <TaskEditor workspace={workspace} task={editor.task} parentId={editor.parent?.id}
      initialProjectId={editor.parent?.projectId ?? selectedProject?.id ?? null} scheduleToday={false} busy={busy} run={run}
      error={error}
      onClose={() => setEditor(null)} />}
    {projectEditor && <ProjectDialog project={projectEditor === "new" ? undefined : projectEditor} busy={busy} error={error}
      run={run} onClose={() => setProjectEditor(null)} />}
    {deletingProject && <DeleteProjectDialog project={deletingProject} busy={busy} error={error} run={run}
      onClose={() => setDeletingProject(null)} onDeleted={() => { setDeletingProject(null); setSelected("all"); }} />}
  </>;
}
