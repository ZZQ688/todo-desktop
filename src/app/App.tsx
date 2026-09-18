import { useState, type KeyboardEvent } from "react";
import { CalendarDays, Folder, Settings } from "lucide-react";
import type { WorkspaceRepository } from "../application/workspace";
import { localToday, type LocalDate } from "../domain/local-date";
import type { Task } from "../domain/models";
import { DailyView } from "../features/daily/DailyView";
import { ProjectsView } from "../features/projects/ProjectsView";
import { SettingsView } from "../features/settings/SettingsView";
import { ContextMenu } from "../features/shared/ContextMenu";
import { GlobalSearch, SearchResults } from "../features/shared/GlobalSearch";
import { ModalActivityContext } from "../features/shared/ModalActivityContext";
import { TaskEditor } from "../features/tasks/TaskEditor";
import { useWorkspace } from "./useWorkspace";

const views = [
  { id: "daily", label: "每日", Icon: CalendarDays },
  { id: "projects", label: "项目", Icon: Folder },
  { id: "settings", label: "设置", Icon: Settings },
] as const;
type View = (typeof views)[number]["id"];

interface Props { repository?: WorkspaceRepository; today?: () => LocalDate }

export function App({ repository, today = localToday }: Props) {
  const [view, setView] = useState<View>("daily");
  const [date, setDate] = useState(today);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const workspace = useWorkspace(repository, today);

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % views.length,
      ArrowDown: (index + 1) % views.length,
      ArrowLeft: (index + views.length - 1) % views.length,
      ArrowUp: (index + views.length - 1) % views.length,
      Home: 0,
      End: views.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setView(views[next].id);
    document.getElementById(`tab-${views[next].id}`)?.focus();
  }

  function changeDate(next: LocalDate) {
    setDate(next);
    void workspace.ensureDate(next);
  }

  const density = workspace.data?.settings.density ?? "comfortable";
  return <ModalActivityContext.Provider value={setModalOpen}>
    <div className={`app-shell density-${density}`} aria-busy={workspace.busy}>
    <aside className="navigation">
      <div className="brand">待办</div>
      <GlobalSearch query={query} onQueryChange={setQuery} />
      <div className="view-tabs" role="tablist" aria-label="视图">
        {views.map(({ id, label, Icon }, index) => <button key={id} id={`tab-${id}`}
          role="tab" aria-selected={view === id} aria-controls={`panel-${id}`}
          tabIndex={view === id ? 0 : -1} onKeyDown={(event) => moveTab(event, index)}
          onClick={() => setView(id)}><Icon aria-hidden="true" />{label}</button>)}
      </div>
      {workspace.demo && <p className="demo-notice">浏览器演示 · 关闭页面后清空</p>}
    </aside>
    <main>
      {workspace.error && !modalOpen && <div className="error-banner" role="alert">
        <span>{workspace.error}</span><button onClick={() => void workspace.refresh()} disabled={workspace.busy}>重试</button>
      </div>}
      {!workspace.data ? <p className="loading-state" role="status">正在打开任务…</p> : <>
        {query.trim() !== "" ? <SearchResults query={query} tasks={workspace.data.tasks} projects={workspace.data.projects} onOpenTask={setEditingTask} /> : <>
          {view === "daily" && <section role="tabpanel" id="panel-daily" aria-labelledby="tab-daily" tabIndex={0}>
            <DailyView workspace={workspace.data} date={date} today={today} onDateChange={changeDate}
              busy={workspace.busy} error={workspace.error} run={workspace.run} />
          </section>}
          {view === "projects" && <section role="tabpanel" id="panel-projects" aria-labelledby="tab-projects" tabIndex={0}>
            <ProjectsView workspace={workspace.data} today={today} busy={workspace.busy} error={workspace.error} run={workspace.run} />
          </section>}
          {view === "settings" && <section role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" tabIndex={0}>
            <SettingsView workspace={workspace.data} busy={workspace.busy} run={workspace.run} />
          </section>}
        </>}
      </>}
    </main>
    {workspace.data && <ContextMenu workspace={workspace.data} busy={workspace.busy} error={workspace.error}
      run={workspace.run} view={view} today={today} />}
    {workspace.data && editingTask && <TaskEditor workspace={workspace.data} task={editingTask}
      scheduleToday={view === "daily"} initialProjectId={editingTask.projectId}
      busy={workspace.busy} error={workspace.error} run={workspace.run}
      onClose={() => setEditingTask(null)} />}
    </div>
  </ModalActivityContext.Provider>;
}
