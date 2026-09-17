import { useState } from "react";
import type { Project } from "../../domain/models";

const UNGROUPED = "__ungrouped__";

interface Props {
  count: number;
  busy: boolean;
  projects: Project[];
  onComplete: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onAddToToday: () => void;
  onMoveToGroup: (projectId: string | null) => void;
  onExit: () => void;
}

export function MultiSelectBar({ count, busy, projects, onComplete, onReopen, onDelete, onAddToToday, onMoveToGroup, onExit }: Props) {
  const [group, setGroup] = useState("");
  return <div className="multi-select-bar" role="group" aria-label="批量操作">
    <span className="multi-select-count">已选 {count} 项</span>
    <button onClick={onComplete} disabled={busy}>完成</button>
    <button onClick={onReopen} disabled={busy}>重开</button>
    <button onClick={onAddToToday} disabled={busy}>加入今日</button>
    <select aria-label="移动分组" value={group} disabled={busy} onChange={(event) => {
      const value = event.target.value;
      setGroup("");
      if (value === UNGROUPED) onMoveToGroup(null);
      else if (value !== "") onMoveToGroup(value);
    }}>
      <option value="" disabled>移动分组…</option>
      <option value={UNGROUPED}>未分组</option>
      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
    <button className="danger-button" onClick={onDelete} disabled={busy}>删除</button>
    <button onClick={onExit} disabled={busy}>退出</button>
  </div>;
}
