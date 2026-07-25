/**
 * SLA timer configuration — per-dispatcher thresholds stored in localStorage.
 *
 * If a dedicated Settings UI is not available (dispatch app uses panel layout,
 * not routed views), thresholds fall back to these defaults and the user can
 * override via the "SLA thresholds" control in the JobBoard filter bar.
 */
export interface SlaThresholds {
  /** Seconds a job can sit in PENDING/UNASSIGNED before flagging */
  pendingSec: number;
  /** Seconds between ASSIGNED/ON_THE_WAY and actual pickup */
  onTheWaySec: number;
  /** Seconds a ride can be in STARTED/ACTIVE before flagging */
  startedSec: number;
}

export const DEFAULT_SLA_THRESHOLDS: SlaThresholds = {
  pendingSec: 120, // 2 min
  onTheWaySec: 600, // 10 min
  startedSec: 3600, // 60 min
};

const STORAGE_KEY = "dispatch_sla_thresholds_v1";

export function loadSlaThresholds(): SlaThresholds {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SLA_THRESHOLDS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SLA_THRESHOLDS };
    const parsed = JSON.parse(raw);
    return {
      pendingSec: Number(parsed.pendingSec) || DEFAULT_SLA_THRESHOLDS.pendingSec,
      onTheWaySec: Number(parsed.onTheWaySec) || DEFAULT_SLA_THRESHOLDS.onTheWaySec,
      startedSec: Number(parsed.startedSec) || DEFAULT_SLA_THRESHOLDS.startedSec,
    };
  } catch {
    return { ...DEFAULT_SLA_THRESHOLDS };
  }
}

export function saveSlaThresholds(thresholds: SlaThresholds): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
  } catch {
    /* swallow */
  }
}

/**
 * Returns SLA over-threshold seconds for a job, or 0 if within SLA.
 * Applies only to UNASSIGNED/PENDING, ASSIGNED/ON_THE_WAY/OFFERED, and
 * ACTIVE/STARTED buckets so other jobs never get flagged red.
 */
export function jobSlaOverSec(
  job: { status?: string; requestedAt?: string; lastUpdateAt?: string },
  thresholds: SlaThresholds,
  now: number = Date.now()
): number {
  if (!job?.status) return 0;
  const status = String(job.status).toUpperCase();
  const createdMs = job.requestedAt ? new Date(job.requestedAt).getTime() : 0;
  const updatedMs = job.lastUpdateAt ? new Date(job.lastUpdateAt).getTime() : createdMs;
  if (!createdMs) return 0;
  const sinceCreated = (now - createdMs) / 1000;
  const sinceUpdated = (now - updatedMs) / 1000;

  if (status === "UNASSIGNED" || status === "PENDING") {
    return sinceCreated > thresholds.pendingSec ? sinceCreated - thresholds.pendingSec : 0;
  }
  if (
    status === "ASSIGNED" ||
    status === "ON_THE_WAY" ||
    status === "OFFERED" ||
    status === "ARRIVED"
  ) {
    return sinceUpdated > thresholds.onTheWaySec ? sinceUpdated - thresholds.onTheWaySec : 0;
  }
  if (status === "ACTIVE" || status === "STARTED" || status === "IN_PROGRESS") {
    return sinceUpdated > thresholds.startedSec ? sinceUpdated - thresholds.startedSec : 0;
  }
  return 0;
}

export function formatOverSec(overSec: number): string {
  if (overSec <= 0) return "";
  if (overSec < 60) return `${Math.floor(overSec)}s over`;
  const mins = Math.floor(overSec / 60);
  if (mins < 60) return `${mins}m over`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m over`;
}
