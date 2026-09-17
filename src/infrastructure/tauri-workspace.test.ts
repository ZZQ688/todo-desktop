import { expect, test, vi } from "vitest";
import { asLocalDate } from "../domain/local-date";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
import { invoke } from "@tauri-apps/api/core";
import { desktopRepository, workspaceRepository } from "./tauri-workspace";

test("desktop uses exact native commands and never falls back on a failed database", async () => {
  const failure = { code: "database_unavailable", message: "本地数据无法打开" };
  vi.mocked(invoke).mockRejectedValue(failure);
  expect(workspaceRepository.demo).toBe(false);
  await expect(desktopRepository.load()).rejects.toBe(failure);
  expect(invoke).toHaveBeenCalledWith("load_workspace");
  const mutation = { kind: "carryover" } as const;
  const today = asLocalDate("2026-09-17");
  await expect(desktopRepository.mutate(mutation, today)).rejects.toBe(failure);
  expect(invoke).toHaveBeenCalledWith("mutate_workspace", { mutation, today });
});
