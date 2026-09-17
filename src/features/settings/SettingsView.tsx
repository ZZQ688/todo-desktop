import type { Mutation, Workspace } from "../../application/workspace";

interface Props {
  workspace: Workspace;
  busy: boolean;
  run: (mutation: Mutation) => Promise<boolean>;
}

export function SettingsView({ workspace, busy, run }: Props) {
  return <>
    <header className="view-heading"><div><h1>设置</h1><p>外观</p></div></header>
    <section className="settings-section" aria-labelledby="density-heading">
      <div><h2 id="density-heading">界面密度</h2></div>
      <div className="segmented" role="group" aria-label="界面密度">
        <button className={workspace.settings.density === "comfortable" ? "selected" : ""}
          aria-pressed={workspace.settings.density === "comfortable"} disabled={busy}
          onClick={() => void run({ kind: "saveSettings", density: "comfortable" })}>舒适</button>
        <button className={workspace.settings.density === "compact" ? "selected" : ""}
          aria-pressed={workspace.settings.density === "compact"} disabled={busy}
          onClick={() => void run({ kind: "saveSettings", density: "compact" })}>紧凑</button>
      </div>
    </section>
  </>;
}
