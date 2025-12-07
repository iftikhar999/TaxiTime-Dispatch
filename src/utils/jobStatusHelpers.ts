import type { JobStatus } from "../store/useDispatchStore";

const ASSIGNABLE_STATUS_SET = new Set<string>([
  "UNASSIGNED",
  "PENDING",
  "REJECTED",
  "NOSHOW",
  "NO_SHOW",
  "RECALLED",
  "RECALL",
]);

export const isAssignableJobStatus = (status?: string | null): boolean => {
  if (!status) {
    return false;
  }
  return ASSIGNABLE_STATUS_SET.has(status.toUpperCase());
};

export const ASSIGNABLE_STATUSES = Array.from(ASSIGNABLE_STATUS_SET);
