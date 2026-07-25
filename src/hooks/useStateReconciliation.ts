import { useEffect, useRef, useState } from "react";
import { StateReconciliationService, type ReconciliationIssue } from "../services/stateReconciliation";
import { triggerDispatchAutoHeal } from "../services/dispatchSyncBus";
import { useDispatchStore } from "../store/useDispatchStore";

// Reconciliation runs often so drift is caught fast, but nothing shows to the
// dispatcher until the same issue has survived a silent re-sync with the
// server. That way transient mismatches (socket event arriving a split-second
// before the mirror event) never surface as "click refresh" noise.
const RECONCILIATION_INTERVAL_MS = 10_000;
// Grace window: how long an issue must stay visible in local state before we
// treat it as real drift worth re-pulling from the server.
const GRACE_WINDOW_MS = 8_000;

export const useStateReconciliation = () => {
  const drivers = useDispatchStore((state) => state.drivers);
  const jobs = useDispatchStore((state) => state.jobs);
  const [reconciler] = useState(() => new StateReconciliationService());
  const [issues, setIssues] = useState<ReconciliationIssue[]>([]);
  // Tracks when each issue key was first observed, so we only auto-heal after
  // the grace window has elapsed without the socket healing it naturally.
  const firstSeenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const run = async () => {
      const nextIssues = reconciler.reconcile(drivers, jobs);
      const nowMs = Date.now();
      const keys = new Set<string>();
      let persistentCount = 0;
      const persistentReasons: string[] = [];

      nextIssues.forEach((issue) => {
        const key = `${issue.type}:${issue.driverId ?? ""}:${issue.jobId ?? ""}`;
        keys.add(key);
        const firstSeen = firstSeenRef.current.get(key) ?? nowMs;
        if (!firstSeenRef.current.has(key)) {
          firstSeenRef.current.set(key, nowMs);
        }
        if (nowMs - firstSeen >= GRACE_WINDOW_MS) {
          persistentCount += 1;
          if (persistentReasons.length < 3) persistentReasons.push(issue.type);
        }
      });

      // Drop entries for issues that have resolved themselves.
      for (const key of Array.from(firstSeenRef.current.keys())) {
        if (!keys.has(key)) firstSeenRef.current.delete(key);
      }

      // Expose only the persistent issues to any subscribers (debug overlays,
      // admin tooling). The standard dispatcher UI no longer renders these.
      setIssues(
        nextIssues.filter((issue) => {
          const key = `${issue.type}:${issue.driverId ?? ""}:${issue.jobId ?? ""}`;
          const firstSeen = firstSeenRef.current.get(key) ?? nowMs;
          return nowMs - firstSeen >= GRACE_WINDOW_MS;
        })
      );

      if (persistentCount > 0) {
        // Silently re-pull authoritative state. The bus rate-limits internally
        // so a stuck record on the server doesn't cause a request storm.
        await triggerDispatchAutoHeal(
          `persistent drift x${persistentCount}: ${persistentReasons.join(",")}`
        );
      }
    };

    run();
    const intervalId = setInterval(run, RECONCILIATION_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [drivers, jobs, reconciler]);

  return { issues };
};
