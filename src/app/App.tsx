import { useState, type KeyboardEvent } from "react";
import { CalendarDays, Folder, Settings } from "lucide-react";
import { localToday, type LocalDate } from "../domain/local-date";
import { DailyView } from "../features/daily/DailyView";
import { ProjectsView } from "../features/projects/ProjectsView";
import { SettingsView } from "../features/settings/SettingsView";
import type { HealthCheck } from "../application/health";
import { checkHealth } from "../infrastructure/tauri-health";
import { useHealth } from "./useHealth";

const views = [
  { id: "daily", label: "每日", Icon: CalendarDays },
  { id: "projects", label: "项目", Icon: Folder },
  { id: "settings", label: "设置", Icon: Settings },
] as const;
type View = (typeof views)[number]["id"];

export function App({ today = localToday, getHealth = checkHealth }: {
  today?: () => LocalDate;
  getHealth?: HealthCheck;
}) {
  const [view, setView] = useState<View>("daily");
  const [date, setDate] = useState(today);
  const health = useHealth(getHealth);

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

  return <div className="app-shell">
    <aside className="navigation">
      <div className="brand">待办</div>
      <div className="view-tabs" role="tablist" aria-label="视图">
        {views.map(({ id, label, Icon }, index) => <button key={id} id={`tab-${id}`}
          role="tab" aria-selected={view === id} aria-controls={`panel-${id}`}
          tabIndex={view === id ? 0 : -1} onKeyDown={(event) => moveTab(event, index)}
          onClick={() => setView(id)}><Icon aria-hidden="true" />{label}</button>)}
      </div>
    </aside>
    <main>
      <p className="health-status" role={health.phase === "unavailable" && !health.desktopRequired ? "alert" : "status"}>
        {health.phase === "loading" ? "正在连接本地数据" :
          health.phase === "ready" ? "本地数据已连接" :
          health.desktopRequired ? "未连接本地数据" : "本地数据无法打开。已有文件已保留。"}
      </p>
      <section role="tabpanel" id="panel-daily" aria-labelledby="tab-daily" tabIndex={0} hidden={view !== "daily"}>
        <DailyView date={date} today={today} onDateChange={setDate} />
      </section>
      <section role="tabpanel" id="panel-projects" aria-labelledby="tab-projects" tabIndex={0} hidden={view !== "projects"}>
        <ProjectsView />
      </section>
      <section role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" tabIndex={0} hidden={view !== "settings"}>
        <SettingsView />
      </section>
    </main>
  </div>;
}
