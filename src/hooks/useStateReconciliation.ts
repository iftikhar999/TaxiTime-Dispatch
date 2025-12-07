import { useEffect, useState } from "react";
import { StateReconciliationService, type ReconciliationIssue } from "../services/stateReconciliation";
import { useDispatchStore } from "../store/useDispatchStore";

const RECONCILIATION_INTERVAL_MS = 30_000;

export const useStateReconciliation = () => {
  const drivers = useDispatchStore((state) => state.drivers);
  const jobs = useDispatchStore((state) => state.jobs);
  const [reconciler] = useState(() => new StateReconciliationService());
  const [issues, setIssues] = useState<ReconciliationIssue[]>([]);

  useEffect(() => {
    const run = () => {
      const nextIssues = reconciler.reconcile(drivers, jobs);
      if (nextIssues.length > 0) {
        console.warn("[StateReconciliation] Issues detected", nextIssues);
      }
      setIssues(nextIssues);
    };

    run();
    const intervalId = setInterval(run, RECONCILIATION_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [drivers, jobs, reconciler]);

  return { issues };
};
