import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Mutation, Workspace } from "../../application/workspace";
import type { LocalDate } from "../../domain/local-date";
import type { Project, Task } from "../../domain/models";
import { TaskEditor } from "../tasks/TaskEditor";
import { InlineMutationError } from "./InlineMutationError";
import { DeleteProjectDialog, ProjectDialog } from "./ProjectDialogs";
import { useModalFocus } from "./useModalFocus";

type View = "daily" | "projects" | "settings";
type Run = (mutation: Mutation) => Promise<boolean>;
type EditorState = { task?: Task; parent?: Task } | null;

type MenuTarget =
  | { kind: "task"; task: Task }
  | { kind: "project"; project: Project }
  | { kind: "blank" };

interface MenuState { x: number; y: number; target: MenuTarget; submenuOpen: boolean; }

interface Props {
  workspace: Workspace;
  busy: boolean;
  error: string | null;
  run: Run;
  view: View;
  today: () => LocalDate;
}

const MENU_WIDTH = 200;
const MENU_HEIGHT = 320;

function clampX(clientX: number) {
  return Math.max(4, Math.min(clientX, window.innerWidth - MENU_WIDTH - 4));
}

function clampY(clientY: number) {
  return Math.max(4, Math.min(clientY, window.innerHeight - MENU_HEIGHT - 4));
}

function ConfirmDeleteTask({ task, busy, error, onCancel, onConfirm }: {
  task: Task; busy: boolean; error: string | null; onCancel: () => void; onConfirm: () => Promise<boolean>;
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
      aria-labelledby="confirm-delete-task-title" aria-describedby="confirm-delete-task-copy"
      onKeyDown={(event) => { trapFocus(event); if (event.key === "Escape" && !busy) onCancel(); }}>
      <div className="modal-heading"><h2 id="confirm-delete-task-title">删除任务？</h2>
        <button className="icon-button" aria-label="关闭" title="关闭" onClick={onCancel} disabled={busy}>
          <X aria-hidden="true" /></button></div>
      <p id="confirm-delete-task-copy">“{task.title}”及其子任务会被永久删除。</p>
      <InlineMutationError show={failed} error={error} />
      <div className="form-actions"><button ref={cancelRef} onClick={onCancel} disabled={busy}>取消</button>
        <button className="danger-button" onClick={() => void confirm()} disabled={busy}>删除</button></div>
    </div>
  </div>;
}

export function ContextMenu({ workspace, busy, error, run, view, today }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [projectEditor, setProjectEditor] = useState<Project | "new" | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scheduleToday = view === "daily";

  useEffect(() => {
    function onContextMenu(event: MouseEvent) {
      event.preventDefault();
      const el = event.target instanceof Element ? event.target : null;
      const taskEl = el?.closest<HTMLElement>("[data-task-id]");
      if (taskEl?.dataset.taskId) {
        const task = workspace.tasks.find((item) => item.id === taskEl.dataset.taskId);
        if (task) {
          setMenu({ x: clampX(event.clientX), y: clampY(event.clientY), target: { kind: "task", task }, submenuOpen: false });
          return;
        }
      }
      const projectEl = el?.closest<HTMLElement>("[data-project-id]");
      if (projectEl?.dataset.projectId) {
        const project = workspace.projects.find((item) => item.id === projectEl.dataset.projectId);
        if (project) {
          setMenu({ x: clampX(event.clientX), y: clampY(event.clientY), target: { kind: "project", project }, submenuOpen: false });
          return;
        }
      }
      setMenu({ x: clampX(event.clientX), y: clampY(event.clientY), target: { kind: "blank" }, submenuOpen: false });
    }
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, [workspace]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const onMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) close();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  function closeMenu() { setMenu(null); }

  function toggleCompletion(task: Task) {
    void run({ kind: "setCompletion", ids: [task.id], completed: task.status !== "completed" });
    closeMenu();
  }

  function addToToday(task: Task) {
    void run({ kind: "addToToday", ids: [task.id] });
    closeMenu();
  }

  function removeFromToday(task: Task) {
    void run({ kind: "removeFromToday", ids: [task.id] });
    closeMenu();
  }

  function moveToGroup(task: Task, projectId: string | null) {
    void run({ kind: "moveToGroup", ids: [task.id], projectId });
    closeMenu();
  }

  function editTask(task: Task) {
    setEditor({ task });
    closeMenu();
  }

  function addChild(task: Task) {
    setEditor({ parent: task });
    closeMenu();
  }

  function newTask() {
    setEditor({});
    closeMenu();
  }

  function renameProject(project: Project) {
    setProjectEditor(project);
    closeMenu();
  }

  function newProject() {
    setProjectEditor("new");
    closeMenu();
  }

  function confirmDeleteProject(project: Project) {
    setDeletingProject(project);
    closeMenu();
  }

  function confirmDeleteTask(task: Task) {
    setDeletingTask(task);
    closeMenu();
  }

  const taskTarget = menu?.target.kind === "task" ? menu.target.task : undefined;
  const projectTarget = menu?.target.kind === "project" ? menu.target.project : undefined;
  const todayDate = today();
  const taskInToday = taskTarget !== undefined &&
    workspace.entries.some((entry) => entry.taskId === taskTarget.id && entry.localDate === todayDate);

  return <>
    {menu && <div ref={menuRef} className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
      {taskTarget && <>
        <button role="menuitem" onClick={() => toggleCompletion(taskTarget)}>
          {taskTarget.status === "completed" ? "重开" : "完成"}</button>
        <button role="menuitem" onClick={() => editTask(taskTarget)}>编辑</button>
        {taskInToday
          ? <button role="menuitem" onClick={() => removeFromToday(taskTarget)}>移出今日</button>
          : <button role="menuitem" onClick={() => addToToday(taskTarget)}>加入今日</button>}
        {!taskTarget.parentId && <button role="menuitem" onClick={() => addChild(taskTarget)}>添加子任务</button>}
        <button role="menuitem" onClick={() => setMenu((prev) => prev && { ...prev, submenuOpen: !prev.submenuOpen })}>移动分组</button>
        {menu.submenuOpen && <div className="context-submenu" role="group" aria-label="移动到分组">
          <button role="menuitem" onClick={() => moveToGroup(taskTarget, null)}>未分组</button>
          {workspace.projects.map((project) => <button key={project.id} role="menuitem"
            onClick={() => moveToGroup(taskTarget, project.id)}>{project.name}</button>)}
        </div>}
        <button role="menuitem" className="danger" onClick={() => confirmDeleteTask(taskTarget)}>删除</button>
      </>}
      {projectTarget && <>
        <button role="menuitem" onClick={() => renameProject(projectTarget)}>重命名</button>
        <button role="menuitem" className="danger" onClick={() => confirmDeleteProject(projectTarget)}>删除</button>
      </>}
      {!taskTarget && !projectTarget && <>
        {view === "daily" && <button role="menuitem" onClick={newTask}>新建任务</button>}
        {view === "projects" && <button role="menuitem" onClick={newProject}>新建项目</button>}
      </>}
    </div>}
    {editor && <TaskEditor workspace={workspace} task={editor.task} parentId={editor.parent?.id}
      initialProjectId={editor.parent?.projectId ?? null} scheduleToday={scheduleToday} busy={busy} run={run}
      error={error}
      onClose={() => setEditor(null)} />}
    {projectEditor && <ProjectDialog project={projectEditor === "new" ? undefined : projectEditor} busy={busy} error={error}
      run={run} onClose={() => setProjectEditor(null)} />}
    {deletingProject && <DeleteProjectDialog project={deletingProject} busy={busy} error={error} run={run}
      onClose={() => setDeletingProject(null)} onDeleted={() => setDeletingProject(null)} />}
    {deletingTask && <ConfirmDeleteTask task={deletingTask} busy={busy} error={error}
      onCancel={() => setDeletingTask(null)} onConfirm={() => run({ kind: "deleteTasks", ids: [deletingTask.id] })} />}
  </>;
}
