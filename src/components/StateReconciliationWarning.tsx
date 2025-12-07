import { AlertTriangle } from "lucide-react";
import { useStateReconciliation } from "../hooks/useStateReconciliation";

export const StateReconciliationWarning = () => {
  const { issues } = useStateReconciliation();

  if (issues.length === 0) {
    return null;
  }

  const visibleIssues = issues.slice(0, 3);
  const hiddenCount = issues.length - visibleIssues.length;

  return (
    <div className="mx-4 mb-4 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div className="font-semibold">State Synchronization Issues Detected</div>
          <ul className="list-disc space-y-1 pl-5">
            {visibleIssues.map((issue, index) => (
              <li key={`${issue.type}-${issue.driverId ?? issue.jobId ?? index}`}>
                {issue.message}
              </li>
            ))}
            {hiddenCount > 0 && (
              <li className="font-medium text-amber-800">…and {hiddenCount} more.</li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-xs font-medium text-amber-900 underline hover:text-amber-700"
          >
            Refresh data
          </button>
        </div>
      </div>
    </div>
  );
};
