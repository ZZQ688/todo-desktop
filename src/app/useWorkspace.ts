import { useCallback, useEffect, useRef, useState } from "react";
import type { Mutation, OccurrenceBatch, Workspace, WorkspaceRepository } from "../application/workspace";
import { localToday, type LocalDate } from "../domain/local-date";
import { workspaceRepository } from "../infrastructure/tauri-workspace";
import { expandBatch } from "../infrastructure/rrule-expander";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return typeof error === "string" ? error : "无法保存或读取任务。请重试，已有数据已保留。";
}

export function useWorkspace(repository: WorkspaceRepository = workspaceRepository, today = localToday) {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const snapshot = useRef<Workspace | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const mounted = useRef(false);
  const horizon = useRef(today());
  const lastDay = useRef(today());

  const publish = useCallback((next: Workspace) => {
    snapshot.current = next;
    if (mounted.current) setData(next);
    return next;
  }, []);

  const enqueue = useCallback((action: () => Promise<Workspace>): Promise<boolean> => {
    pending.current += 1;
    if (mounted.current) setBusy(true);
    const operation = queue.current.then(async () => {
      if (mounted.current) setError(null);
      try {
        const next = await action();
        publish(next);
        return true;
      } catch (failure) {
        if (mounted.current) setError(errorMessage(failure));
        return false;
      } finally {
        pending.current -= 1;
        if (mounted.current) setBusy(pending.current > 0);
      }
    });
    queue.current = operation;
    return operation;
  }, [publish]);

  const expand = useCallback(async (current: Workspace, through: LocalDate) => {
    const batches = current.tasks.filter((task) => task.repeat)
      .map((task) => expandBatch(task, through))
      .filter((batch): batch is OccurrenceBatch => batch !== null);
    return batches.length ? repository.mutate({ kind: "materialize", batches }, today()) : current;
  }, [repository, today]);

  const refresh = useCallback(async () => {
    await enqueue(async () => {
      const day = today();
      let next = publish(await repository.load());
      const failures: string[] = [];
      try { next = publish(await expand(next, horizon.current > day ? horizon.current : day)); }
      catch (failure) { failures.push(`重复任务生成失败：${errorMessage(failure)}`); }
      try {
        next = publish(await repository.mutate({ kind: "carryover" }, day));
        lastDay.current = day;
      } catch (failure) { failures.push(`任务顺延失败：${errorMessage(failure)}`); }
      if (failures.length && mounted.current) setError(failures.join("；"));
      return next;
    });
  }, [enqueue, expand, publish, repository, today]);

  const ensureDate = useCallback(async (date: LocalDate) => {
    horizon.current = date;
    await enqueue(async () => expand(snapshot.current ?? await repository.load(), date));
  }, [enqueue, expand, repository]);

  const run = useCallback((mutation: Mutation) => enqueue(async () => {
    const day = today();
    const through = horizon.current > day ? horizon.current : day;
    const result = publish(await repository.mutate(mutation, day));
    if (mutation.kind === "saveTask" && mutation.task.repeat) {
      try { return await expand(result, through); }
      catch (failure) {
        if (mounted.current) setError(`任务已保存，但重复任务生成失败：${errorMessage(failure)}`);
      }
    }
    return result;
  }), [enqueue, expand, publish, repository, today]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const resume = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const timer = window.setInterval(() => {
      if (today() !== lastDay.current) void refresh();
    }, 30_000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh, today]);

  return { data, error, busy, run, refresh, ensureDate, demo: repository.demo };
}
