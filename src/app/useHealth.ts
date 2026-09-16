import { useEffect, useState } from "react";
import type { HealthCheck, HealthState } from "../application/health";

export function useHealth(check: HealthCheck): HealthState {
  const [state, setState] = useState<HealthState>({ phase: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ phase: "loading" });
    check().then(
      (report) => { if (!cancelled) setState({ phase: "ready", report }); },
      (error: unknown) => {
        if (!cancelled) setState({
          phase: "unavailable",
          desktopRequired: error instanceof Error && error.message === "desktop_required",
        });
      },
    );
    return () => { cancelled = true; };
  }, [check]);
  return state;
}
