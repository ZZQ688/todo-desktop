import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Workspace, WorkspaceRepository } from "../application/workspace";
import { createMemoryRepository } from "./memory-repository";

export const desktopRepository: WorkspaceRepository = {
  demo: false,
  load: () => invoke<Workspace>("load_workspace"),
  mutate: (mutation, today) => invoke<Workspace>("mutate_workspace", { mutation, today }),
};

export const workspaceRepository = isTauri() ? desktopRepository : createMemoryRepository();
