export interface HealthReport { schemaVersion: 1; databaseReady: true }
export type HealthCheck = () => Promise<HealthReport>;
export type HealthState =
  | { phase: "loading" }
  | { phase: "ready"; report: HealthReport }
  | { phase: "unavailable"; desktopRequired: boolean };
