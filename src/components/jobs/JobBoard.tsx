import classNames from "classnames";
import {
    Calendar,
    Car,
    ChevronDown,
    Clock,
    Filter,
    MapPin,
    Package,
    PenSquare,
    Search,
    UserCheck,
    UserCircle,
    Users,
    X,
} from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useDispatchController } from "../../hooks/useDispatchController";
import { cancelJob } from "../../services/jobService";
import { JobStatus, useDispatchStore } from "../../store/useDispatchStore";
import { getJobStatusBadgeClass } from "../../utils/jobStatusColors";
import ConfirmAssignmentModal from "./ConfirmAssignmentModal";
import JobDetailsModal from "./JobDetailsModal";

/**
 * Determines if a job can be cancelled based on its status
 * Can cancel: UNASSIGNED, OFFERED, ASSIGNED (before driver starts)
 * Cannot cancel: ACTIVE (started), FINISHED, CANCELLED, REJECTED, NOSHOW, RECALLED
 */
const canCancelJob = (status: JobStatus): boolean => {
  return status === "UNASSIGNED" || status === "OFFERED" || status === "ASSIGNED";
};

/**
 * Calculate urgency level for a scheduled job
 * @returns { urgencyLevel: 'LATE' | 'WARNING' | 'OK', minutesUntilScheduled: number, isLate: boolean }
 */
const getJobUrgency = (job: any) => {
  // Only calculate urgency for scheduled jobs
  if (!job.scheduledAt) {
    return { urgencyLevel: 'OK' as const, minutesUntilScheduled: Infinity, isLate: false };
  }

  const now = Date.now();
  const scheduledTime = new Date(job.scheduledAt).getTime();
  const diffMs = scheduledTime - now;
  const minutesUntilScheduled = Math.floor(diffMs / 60000);

  // Job is late (past scheduled time)
  if (minutesUntilScheduled < 0) {
    return { urgencyLevel: 'LATE' as const, minutesUntilScheduled, isLate: true };
  }

  // Job is within 15 minutes of scheduled time (warning)
  if (minutesUntilScheduled <= 15) {
    return { urgencyLevel: 'WARNING' as const, minutesUntilScheduled, isLate: false };
  }

  // Job is OK
  return { urgencyLevel: 'OK' as const, minutesUntilScheduled, isLate: false };
};

const statusTabs: { label: string; value: JobStatus }[] = [
  {
    label: "U-A",
    value: "UNASSIGNED",
  },
  {
    label: "Offer",
    value: "OFFERED",
  },
  {
    label: "Assign",
    value: "ASSIGNED",
  },
  {
    label: "Active",
    value: "ACTIVE",
  },
  {
    label: "Completed",
    value: "FINISHED",
  },
  {
    label: "Cancelled",
    value: "CANCELLED",
  },
];

const formatTimeAgo = (iso: string) => {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes <= 0) return "Now";
  return `${minutes}m ago`;
};

interface JobBoardProps {
  onCreateJobClick?: () => void;
  onEditJob?: (jobId: string, jobData: any) => void;
}

const JobBoard: React.FC<JobBoardProps> = ({ onCreateJobClick, onEditJob }) => {
  const jobs = useDispatchStore((state) => state.jobs);
  const selectedJobId = useDispatchStore((state) => state.selectedJobId);
  const selectJob = useDispatchStore((state) => state.selectJob);
  const selectedStatus = useDispatchStore((state) => state.selectedStatus);
  const setSelectedStatus = useDispatchStore(
    (state) => state.setSelectedStatus
  );
  const jobCounters = useDispatchStore((state) => state.jobCounters);
  const loading = useDispatchStore((state) => state.loading);
  const drivers = useDispatchStore((state) => state.drivers);
  const assignDriver = useDispatchStore((state) => state.assignDriver);
  const unassignJob = useDispatchStore((state) => state.unassignJob);
  const setHoveredJobId = useDispatchStore((state) => state.setHoveredJobId);
  
  // Get fetchJobs and fetchJobCounters from useDispatchController
  const { fetchJobs, fetchJobCounters } = useDispatchController();
  
  // Hover timeout ref for auto-hide
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Local state for filters and modals
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<
    string | null
  >(null);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week">("all");
  const [driverFilter, setDriverFilter] = useState<string>("all");
  // Track which jobs have triggered alerts to avoid duplicates
  const alertedRef = React.useRef<Set<string>>(new Set());

  // Monitor jobs for urgency alerts
  React.useEffect(() => {
    const interval = setInterval(() => {
      for (const job of jobs) {
        if (!job.scheduledAt) continue;
        const urgency = getJobUrgency(job);

        // Alert when job enters WARNING state (within 15 minutes)
        if (urgency.urgencyLevel === 'WARNING' && !alertedRef.current.has(job.id)) {
          alertedRef.current.add(job.id);
          toast.error(`⚠️ Job ${job.reference} is due in ${urgency.minutesUntilScheduled} minutes!`, {
            duration: 6000,
            icon: '⏰',
          });
        }

        // Alert when job becomes LATE
        if (urgency.isLate && !alertedRef.current.has(job.id + '_late')) {
          alertedRef.current.add(job.id + '_late');
          toast.error(
            `🚨 Job ${job.reference} is now LATE! (${Math.abs(urgency.minutesUntilScheduled)}m past scheduled time)`,
            {
              duration: 10000,
              icon: '🚨',
            }
          );
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [jobs]);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<{
    jobId: string;
    driverId: string;
    driverName: string;
    jobReference: string;
  } | null>(null);

  const filteredJobs = useMemo(() => {
    let result = jobs;

    console.log("🔍 Filtering jobs:", {
      totalJobs: jobs.length,
      selectedStatus,
      jobsByStatus: jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    });

    // Filter by backend status
    // ✅ FIX: U-A tab should show UNASSIGNED, PENDING, REJECTED, RECALLED, and NOSHOW
    if (selectedStatus === "UNASSIGNED") {
      result = result.filter((job) => 
        job.status === "UNASSIGNED" || 
        job.status === "PENDING" || 
        job.status === "REJECTED" ||
        job.status === "RECALLED" ||
        job.status === "NOSHOW"
      );
    } else {
      result = result.filter((job) => job.status === selectedStatus);
    }

    console.log("📋 After status filter:", {
      selectedStatus,
      resultCount: result.length,
      jobs: result.map((j) => ({
        id: j.id,
        ref: j.reference,
        status: j.status,
      })),
    });

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (job) =>
          job.reference.toLowerCase().includes(query) ||
          job.pickupAddress.toLowerCase().includes(query) ||
          job.dropoffAddress.toLowerCase().includes(query) ||
          job.riderName?.toLowerCase().includes(query)
      );
    }

    // Date filter
    if (dateFilter === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      result = result.filter((job) => new Date(job.requestedAt) >= today);
    } else if (dateFilter === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      result = result.filter((job) => new Date(job.requestedAt) >= weekAgo);
    }

    // Driver filter
    if (driverFilter !== "all") {
      result = result.filter((job) => job.driverId === driverFilter);
    }

    // Sort by urgency (LATE jobs first, then WARNING, then by scheduled/requested time)
    result.sort((a, b) => {
      const urgencyA = getJobUrgency(a);
      const urgencyB = getJobUrgency(b);

      // Priority order: LATE > WARNING > OK
      const urgencyOrder = { LATE: 0, WARNING: 1, OK: 2 };
      const priorityDiff = urgencyOrder[urgencyA.urgencyLevel] - urgencyOrder[urgencyB.urgencyLevel];
      
      if (priorityDiff !== 0) return priorityDiff;

      // Within same urgency level, sort by time (earliest first for scheduled, latest first for ASAP)
      if (a.scheduledAt && b.scheduledAt) {
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      } else if (a.scheduledAt) {
        return -1; // Scheduled jobs before ASAP
      } else if (b.scheduledAt) {
        return 1;
      } else {
        return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(); // Latest ASAP first
      }
    });

    return result;
  }, [jobs, selectedStatus, searchQuery, dateFilter, driverFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<JobStatus, number> = {
      UNASSIGNED: jobCounters.unassigned ?? 0,
      OFFERED: jobCounters.offered ?? 0,
      ASSIGNED: jobCounters.assigned ?? 0,
      REJECTED: jobCounters.rejected ?? 0,
      NOSHOW: jobCounters.noShow ?? 0,
      RECALLED: jobCounters.recalled ?? 0,
      ACTIVE: jobCounters.active ?? 0,
      FINISHED: jobCounters.finished ?? 0,
      CANCELLED: jobCounters.cancelled ?? 0,
    };
    return counts;
  }, [jobCounters]);

  const selectedJobDetails = useMemo(() => {
    if (!selectedJobForDetails) return null;
    return jobs.find((job) => job.id === selectedJobForDetails) || null;
  }, [selectedJobForDetails, jobs]);

  const availableDrivers = useMemo(
    () => drivers.filter((driver) => driver.status === "AVAILABLE"),
    [drivers]
  );

  const handleAssignDriver = async (jobId: string, driverId: string) => {
    console.log("🎯 handleAssignDriver called:", { jobId, driverId });

    // Find driver and job details for confirmation modal
    const driver = drivers.find((d) => d.id === driverId);
    const job = jobs.find((j) => j.id === jobId);

    console.log("👤 Driver found:", driver);
    console.log("📋 Job found:", job);

    if (!driver || !job) {
      toast.error("Driver or job not found");
      return;
    }

    // Show confirmation modal
    console.log("✅ Setting pending assignment and showing modal");
    setPendingAssignment({
      jobId,
      driverId,
      driverName: driver.name,
      jobReference: job.reference,
    });
    setShowConfirmModal(true);
  };

  const confirmAssignment = async () => {
    if (!pendingAssignment) return;

    try {
      await assignDriver(pendingAssignment.jobId, pendingAssignment.driverId);
      toast.success("Driver assigned successfully");
      setPendingAssignment(null);
    } catch (error) {
      console.error("Failed to assign driver:", error);
      toast.error("Failed to assign driver");
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await cancelJob(jobId, "Cancelled by dispatcher");
      toast.success("Job cancelled successfully");
      
      // Auto-refresh job list and counters after successful cancellation
      await Promise.all([fetchJobs(), fetchJobCounters()]);
    } catch (error) {
      console.error("Failed to cancel job:", error);
      toast.error("Failed to cancel job");
    }
  };

  const handleQuickAssign = async (jobId: string, driverId: string) => {
    if (!driverId) {
      toast.error("Please select a driver");
      return;
    }
    // Use handleAssignDriver to show confirmation modal
    handleAssignDriver(jobId, driverId);
  };

  const handleUnassignJob = async (jobId: string) => {
    try {
      await unassignJob(jobId);
      toast.success("Job moved back to unassigned queue");
    } catch (error) {
      console.error("Failed to unassign job:", error);
      toast.error("Unable to unassign job");
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header with Actions */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 bg-slate-50">
        <div className="flex items-center gap-2">
          <button
            onClick={onCreateJobClick}
            className="rounded-md bg-blue-600 px-3 py-1 text-sm font-semibold text-white transition hover:bg-blue-700 shadow-sm"
          >
            + Create Job
          </button>
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 font-medium">
            Total: {filteredJobs.length}
          </span>
          <span className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs text-rose-700 font-medium">
            Pending: {statusCounts.UNASSIGNED}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs..."
              className="w-48 rounded-md border border-slate-300 py-1 pl-8 pr-8 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={classNames(
              "flex items-center gap-1 rounded-md border px-3 py-1 transition",
              showFilters
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-300 hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50"
            )}
          >
            <Filter size={14} />
            Filters
            <ChevronDown
              size={12}
              className={classNames("transition", showFilters && "rotate-180")}
            />
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Date Filter */}
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-500" />
              <select
                value={dateFilter}
                onChange={(e) =>
                  setDateFilter(e.target.value as "all" | "today" | "week")
                }
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
              </select>
            </div>

            {/* Driver Filter */}
            <div className="flex items-center gap-2">
              <UserCircle size={14} className="text-slate-500" />
              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                <option value="all">All Drivers</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear Filters */}
            <button
              onClick={() => {
                setDateFilter("all");
                setDriverFilter("all");
                setSearchQuery("");
              }}
              className="ml-auto text-xs text-slate-600 hover:text-slate-900 underline"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 px-4 py-2 text-xs bg-white">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            className={classNames(
              "flex items-center gap-1 rounded-md px-2 py-1 font-medium transition",
              "bg-white text-slate-700 border border-slate-300", // ✅ Plain styling for all tabs
              selectedStatus === tab.value
                ? "ring-2 ring-inset ring-blue-500 shadow-sm bg-blue-50"
                : "opacity-70 hover:opacity-100 hover:bg-slate-50"
            )}
            onClick={() => setSelectedStatus(tab.value)}
          >
            {tab.label}{" "}
            <span className="rounded-full bg-slate-900/10 px-2 font-semibold">
              {statusCounts[tab.value] ?? 0}
            </span>
          </button>
        ))}
        <button
          className={classNames(
            "flex items-center gap-1 rounded-md px-2 py-1 font-medium transition bg-slate-100 text-slate-700 border border-slate-300",
            selectedStatus === "CANCELLED"
              ? "ring-2 ring-inset ring-current shadow-sm"
              : "opacity-70 hover:opacity-100"
          )}
          onClick={() => setSelectedStatus("CANCELLED")}
        >
          Cancelled{" "}
          <span className="rounded-full bg-slate-900/10 px-2 font-semibold">
            {statusCounts.CANCELLED ?? 0}
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50">
        {loading && (
          <div className="flex items-center justify-center py-6 text-sm text-slate-600">
            Syncing latest jobs…
          </div>
        )}
        {!loading && filteredJobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-slate-100 p-4 mb-3">
              <MapPin size={32} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">No jobs found</p>
            <p className="text-xs text-slate-500 mt-1">
              {searchQuery
                ? "Try adjusting your search or filters"
                : "Jobs will appear here when created"}
            </p>
          </div>
        )}
        {filteredJobs.map((job) => {
          const urgency = getJobUrgency(job);
          let urgencyClass = "bg-blue-100 border-blue-300 text-blue-800";
          let urgencyLabel = "LATER";
          if (urgency.urgencyLevel === 'WARNING') {
            urgencyClass = "bg-amber-100 border-amber-400 text-amber-900 font-semibold";
            urgencyLabel = "SOON";
          }
          if (urgency.isLate) {
            urgencyClass = "bg-red-100 border-red-400 text-red-900 font-bold";
            urgencyLabel = "LATE!";
          }
          // ✅ Get status-based background color
          const statusBgClass = getJobStatusBadgeClass(job.status);
          
          return (
          <article
            key={job.id}
            onMouseEnter={() => {
              // Clear any existing timeout
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
              }
              // Set hovered job immediately
              setHoveredJobId(job.id);
            }}
            onMouseLeave={() => {
              // Auto-hide after 4 seconds
              hoverTimeoutRef.current = setTimeout(() => {
                setHoveredJobId(null);
              }, 4000);
            }}
            className={classNames(
              "border-b px-3 py-2 transition cursor-pointer",
              statusBgClass, // ✅ Apply status background color
              selectedJobId === job.id &&
                "border-l-4 border-l-blue-500",
              // Urgency styling with CSS animations
              urgency.isLate && "job-late",
              urgency.urgencyLevel === 'WARNING' && "job-warning"
            )}
          >
            {/* Narrow Single-Line Design */}
            <div className="flex items-center justify-between text-xs">
              {/* Left Section: Job Info */}
              <button
                type="button"
                onClick={() => {
                  console.log('🎯 Selecting job:', job.id, job.reference);
                  selectJob(job.id);
                }}
                className="flex items-center gap-3 flex-1 min-w-0 text-left bg-transparent"
                title="Select job and focus on map"
              >
                {/* Job Reference - Trimmed to last 5 chars */}
                <span 
                  className="rounded bg-rose-100 px-2 py-0.5 font-semibold text-rose-700 flex-shrink-0"
                  title={job.reference || job.id} // Show full ID on hover
                >
                  ...{(job.reference || job.id || '').slice(-5)}
                </span>

                {/* Schedule Status - Enhanced with urgency indicators */}
                {job.isScheduled && job.scheduledAt && (
                  <div className={classNames(
                    "flex items-center gap-1 px-2 py-0.5 border rounded flex-shrink-0",
                    urgencyClass
                  )}>
                    <Clock size={12} className={classNames(
                      "flex-shrink-0",
                      urgency.isLate && "animate-pulse"
                    )} />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[10px] font-bold">{urgencyLabel}</span>
                      <span className="text-[9px] font-medium">
                        {new Date(job.scheduledAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}
                        {urgency.isLate && (
                          <span className="ml-1 font-bold">
                            ({Math.abs(urgency.minutesUntilScheduled)}m ago)
                          </span>
                        )}
                        {urgency.urgencyLevel === 'WARNING' && (
                          <span className="ml-1 font-semibold">
                            (in {urgency.minutesUntilScheduled}m)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
                {job.isScheduled && !job.scheduledAt && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 rounded text-blue-700 flex-shrink-0">
                    <Clock size={10} />
                    <span className="text-xs font-medium">LATER</span>
                  </div>
                )}

                {/* Pickup & Dropoff */}
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="text-slate-600 truncate max-w-[100px]">
                    {job.pickupAddress.split(",")[0]}
                  </span>
                  <MapPin size={12} className="text-slate-400 flex-shrink-0" />
                  <span className="font-medium text-slate-800 truncate max-w-[100px]">
                    {job.dropoffAddress.split(",")[0]}
                  </span>
                </div>

                {/* Requirements */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Passengers */}
                  {job.passengers && job.passengers > 1 && (
                    <div className="flex items-center gap-0.5 text-slate-600">
                      <Users size={10} />
                      <span className="text-xs">{job.passengers}</span>
                    </div>
                  )}
                  
                  {/* Bags */}
                  {job.bags && job.bags > 0 && (
                    <div className="flex items-center gap-0.5 text-slate-600">
                      <Package size={10} />
                      <span className="text-xs">{job.bags}</span>
                    </div>
                  )}
                  
                  {/* Wheelchairs */}
                  {job.wheelchairs && job.wheelchairs > 0 && (
                    <div className="flex items-center gap-0.5 text-orange-600">
                      <UserCheck size={10} />
                      <span className="text-xs">{job.wheelchairs}</span>
                    </div>
                  )}
                  
                  {/* Multiple Vehicles */}
                  {job.vehiclesNeeded && job.vehiclesNeeded > 1 && (
                    <div className="flex items-center gap-0.5 text-purple-600">
                      <Car size={10} />
                      <span className="text-xs">{job.vehiclesNeeded}</span>
                    </div>
                  )}
                </div>

                {/* Rider */}
                <span className="text-slate-600 truncate max-w-[70px] flex-shrink-0">
                  {job.riderName ?? "No rider"}
                </span>

                {/* Fare */}
                <span className="font-medium text-slate-800 flex-shrink-0">
                  {job.fareEstimate ? `$${job.fareEstimate.toFixed(0)}` : "—"}
                </span>

                {/* Time */}
                <span className="text-amber-600 font-medium flex-shrink-0">
                  {formatTimeAgo(job.requestedAt)}
                </span>
              </button>

              {/* Right Section: Actions */}
              <div
                className="flex items-center gap-1 flex-shrink-0 ml-2"
              >
                {/* Quick Actions based on status */}
                {job.status === "UNASSIGNED" && (
                  <>
                    <select
                      className="text-xs rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-blue-500 min-w-[100px]"
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value) {
                          handleQuickAssign(job.id, value);
                          e.target.value = "";
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="">Assign...</option>
                      {availableDrivers.slice(0, 5).map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="text-xs rounded bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-700 flex-shrink-0"
                      onClick={() => selectJob(job.id)}
                      title="Send to Map"
                    >
                      Send
                    </button>
                  </>
                )}

                {/* Unassign button for OFFERED and ASSIGNED jobs */}
                {(job.status === "OFFERED" || job.status === "ASSIGNED") && (
                  <button
                    className="text-xs rounded border border-amber-400 px-2 py-1 text-amber-700 hover:bg-amber-50 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnassignJob(job.id);
                    }}
                  >
                    Unassign
                  </button>
                )}

                {/* Cancel button - only for jobs that haven't started yet */}
                {canCancelJob(job.status) && (
                  <button
                    className="text-xs rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50 flex-shrink-0"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const confirmMessage = job.status === "ASSIGNED" 
                        ? `This job is assigned to a driver. Are you sure you want to cancel job ${job.reference}?`
                        : `Cancel job ${job.reference}?`;
                      
                      if (globalThis.confirm(confirmMessage)) {
                        try {
                          await handleCancelJob(job.id);
                          toast.success("Job cancelled successfully");
                        } catch (error: any) {
                          console.error("Cancel job error:", error);
                          toast.error(error?.message || "Failed to cancel job");
                        }
                      }
                    }}
                    title={job.status === "ASSIGNED" ? "Cancel Job (Driver will be notified)" : "Cancel Job"}
                  >
                    ✕
                  </button>
                )}
                
                {/* Show info message for jobs that can't be cancelled */}
                {job.status === "ACTIVE" && (
                  <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded" title="Job has started and cannot be cancelled from dispatch">
                    🚗 In Progress
                  </span>
                )}

                {/* Details button */}
                <button
                  className="text-xs rounded border border-slate-300 px-2 py-1 text-slate-700 hover:border-blue-500 hover:text-blue-700 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedJobForDetails(job.id);
                  }}
                  title="View Details"
                >
                  <PenSquare size={12} />
                </button>
              </div>
            </div>

            {/* Show notes if available (collapsible) */}
            {job.notes && selectedJobId === job.id && (
              <div className="mt-1 pt-1 border-t border-slate-100">
                <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1 line-clamp-2">
                  {job.notes}
                </p>
              </div>
            )}
          </article>
          );
        })}
      </div>

      {/* Job Details Modal */}
      <JobDetailsModal
        job={selectedJobDetails}
        onClose={() => setSelectedJobForDetails(null)}
        onAssignDriver={handleAssignDriver}
        onCancelJob={handleCancelJob}
        onUnassignDriver={handleUnassignJob}
        onEditJob={onEditJob}
      />

      {/* Confirm Assignment Modal */}
      <ConfirmAssignmentModal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false);
          setPendingAssignment(null);
        }}
        onConfirm={confirmAssignment}
        driverName={pendingAssignment?.driverName || ""}
        jobReference={pendingAssignment?.jobReference || ""}
      />
    </div>
  );
};

export default JobBoard;
