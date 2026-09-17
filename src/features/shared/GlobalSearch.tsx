import { Repeat, Search } from "lucide-react";
import type { Project, Task } from "../../domain/models";

export function GlobalSearch({ query, onQueryChange }: {
  query: string; onQueryChange: (query: string) => void;
}) {
  return <label className="search-field global-search">
    <Search aria-hidden="true" />
    <input type="search" aria-label="搜索任务" placeholder="搜索任务" value={query}
      onChange={(event) => onQueryChange(event.target.value)} />
  </label>;
}

function projectName(projectId: string | null, projects: Project[]): string {
  if (projectId === null) return "未分组";
  return projects.find(({ id }) => id === projectId)?.name ?? "未分组";
}

export function SearchResults({ query, tasks, projects }: {
  query: string; tasks: Task[]; projects: Project[];
}) {
  const needle = query.trim().toLowerCase();
  const matches = tasks.filter((task) => task.title.toLowerCase().includes(needle));
  return <section aria-label="搜索结果">
    <header className="view-heading"><div><h1>搜索结果</h1><p>{matches.length} 个匹配</p></div></header>
    {matches.length === 0 ? <p className="empty-state">没有匹配的任务</p> :
      <ul className="search-results">
        {matches.map((task) => <li key={task.id}>
          <span className="search-result-title">{task.title}</span>
          <span className="search-result-meta">{projectName(task.projectId, projects)} · {task.status === "completed" ? "已完成" : "未完成"}</span>
          {task.recurrenceSourceId !== null && <span className="repeat-badge"><Repeat aria-hidden="true" />重复实例</span>}
        </li>)}
      </ul>}
  </section>;
}
