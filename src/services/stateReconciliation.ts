import type { DispatchDriver, DispatchJob, JobStatus } from "../store/useDispatchStore";

export type ReconciliationIssueType =
  | "DRIVER_BUSY_NO_JOB"
  | "JOB_EXISTS_NO_DRIVER"
  | "STATUS_MISMATCH";

export interface ReconciliationIssue {
  type: ReconciliationIssueType;
  driverId?: string;
  jobId?: string;
  message: string;
  timestamp: string;
}

const ACTIVE_JOB_STATUSES: JobStatus[] = [
  "ASSIGNED",
  "ACTIVE",
  "PENDING",
  "OFFERED",
];

const DRIVER_BUSY_STATUSES: Array<DispatchDriver["status"]> = ["BUSY", "ROGER"];

export class StateReconciliationService {
  private issues: ReconciliationIssue[] = [];

  reconcile(drivers: DispatchDriver[], jobs: DispatchJob[]): ReconciliationIssue[] {
    const newIssues: ReconciliationIssue[] = [];
    const jobById = new Map<string, DispatchJob>();
    const jobsWithActiveStatus: DispatchJob[] = [];

    jobs.forEach((job) => {
      jobById.set(job.id, job);
      if (ACTIVE_JOB_STATUSES.includes(job.status)) {
        jobsWithActiveStatus.push(job);
      }
    });

    const now = new Date().toISOString();

    drivers.forEach((driver) => {
      if (
        DRIVER_BUSY_STATUSES.includes(driver.status) &&
        driver.currentJobId &&
        !jobById.has(driver.currentJobId)
      ) {
        newIssues.push({
          type: "DRIVER_BUSY_NO_JOB",
          driverId: driver.id,
          jobId: driver.currentJobId,
          message: `Driver ${driver.name} is ${driver.status} but job ${driver.currentJobId} is missing from dispatch state.`,
          timestamp: now,
        });
      }
    });

    jobsWithActiveStatus.forEach((job) => {
      if (!job.driverId && !job.assignedDriverId) {
        newIssues.push({
          type: "JOB_EXISTS_NO_DRIVER",
          jobId: job.id,
          message: `Job ${job.reference || job.id} is ${job.status} but no driver is assigned.`,
          timestamp: now,
        });
      }

      const assignedDriverId = job.driverId || job.assignedDriverId;
      if (assignedDriverId) {
        const driver = drivers.find((d) => d.id === assignedDriverId);
        if (driver) {
          const expectedDriverStatus =
            job.status === "ACTIVE" || job.status === "ASSIGNED" || job.status === "PENDING"
              ? "BUSY"
              : "AVAILABLE";
          if (driver.status !== expectedDriverStatus) {
            newIssues.push({
              type: "STATUS_MISMATCH",
              driverId: driver.id,
              jobId: job.id,
              message: `Driver ${driver.name} is ${driver.status} but job ${job.reference || job.id} is ${job.status} (expected driver to be ${expectedDriverStatus}).`,
              timestamp: now,
            });
          }
        }
      }
    });

    this.issues = newIssues;
    return newIssues;
  }

  getIssues(): ReconciliationIssue[] {
    return this.issues;
  }

  clearIssues(): void {
    this.issues = [];
  }
}
