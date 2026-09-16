import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => mocks);
import { checkHealth } from "./tauri-health";

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.isTauri.mockReset().mockReturnValue(true);
});

test("uses the registered IPC command and validates its response", async () => {
  mocks.invoke.mockResolvedValue({ schemaVersion: 1, databaseReady: true });
  await expect(checkHealth()).resolves.toEqual({ schemaVersion: 1, databaseReady: true });
  expect(mocks.invoke).toHaveBeenCalledWith("health_check");
});

test("a browser preview cannot report a connected database", async () => {
  mocks.isTauri.mockReturnValue(false);
  await expect(checkHealth()).rejects.toThrow("desktop_required");
  expect(mocks.invoke).not.toHaveBeenCalled();
});

test("rejects invalid IPC payloads and propagates native failures", async () => {
  mocks.invoke.mockResolvedValue({ schemaVersion: 2, databaseReady: true });
  await expect(checkHealth()).rejects.toThrow("invalid_health_response");
  mocks.invoke.mockRejectedValue({ code: "database_unavailable", message: "Cannot open database" });
  await expect(checkHealth()).rejects.toMatchObject({ code: "database_unavailable" });
});
