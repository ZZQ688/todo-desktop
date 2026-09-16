import { invoke, isTauri } from "@tauri-apps/api/core";
import type { HealthCheck } from "../application/health";

export const checkHealth: HealthCheck = async () => {
  if (!isTauri()) throw new Error("desktop_required");
  const value: unknown = await invoke("health_check");
  if (typeof value !== "object" || value === null ||
      !("schemaVersion" in value) || value.schemaVersion !== 1 ||
      !("databaseReady" in value) || value.databaseReady !== true) {
    throw new Error("invalid_health_response");
  }
  return { schemaVersion: 1, databaseReady: true };
};
