import classNames from "classnames";
import {
    Calendar,
    ChevronDown,
    Filter,
    MapPin,
    PenSquare,
    Search,
    UserCircle,
    X
} from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTheme } from "../../contexts/ThemeContext";
import { useDispatchController } from "../../hooks/useDispatchController";
import { cancelJob } from "../../services/jobService";
import { JobStatus, useDispatchStore } from "../../store/useDispatchStore";
import { getJobStatusBadgeClass } from "../../utils/jobStatusColors";
import { isAssignableJobStatus } from "../../utils/jobStatusHelpers";
import ConfirmAssignmentModal from "./ConfirmAssignmentModal";
import JobDetailsModal from "./JobDetailsModal";

// Audio alert for late jobs
let lateJobAudio: HTMLAudioElement | null = null;
const playLateJobSound = () => {
  try {
    if (!lateJobAudio) {
      lateJobAudio = new Audio('/sounds/a.wav');
      lateJobAudio.volume = 0.7;
    }
    lateJobAudio.currentTime = 0;
    lateJobAudio.play().catch(console.error);
  } catch (error) {
    console.error('Error playing late job sound:', error);
  }
};

/**
 * Determines if a job can be cancelled based on its status
 * Can cancel: UNASSIGNED, OFFERED, ASSIGNED (before driver starts)
 * Cannot cancel: ACTIVE (started), FINISHED, CANCELLED, REJECTED, NOSHOW, RECALLED
 */
const canCancelJob = (status: JobStatus): boolean => {
  return status === "UNASSIGNED" || status === "OFFERED" || status === "ASSIGNED";
};

/**
 * Check if job is a "NOW" job (no scheduledAt or scheduledAt is within 5 minutes)
 */
const isNowJob = (job: any): boolean => {
  if (!job.scheduledAt) return true;
  const scheduledTime = new Date(job.scheduledAt).getTime();
  const now = Date.now();
  // If scheduled within 5 minutes from now, treat as NOW job
  return scheduledTime <= now + 5 * 60 * 1000;
};

/**
 * Calculate urgency level for jobs
 * NOW jobs: Late after 5 minutes from creation
 * LATER jobs: Late after scheduled time passes
 * @returns { urgencyLevel: 'LATE' | 'WARNING' | 'OK', minutesSinceCreation: number, minutesUntilScheduled: number, isLate: boolean, isNow: boolean }
 */
const getJobUrgency = (job: any) => {
  const now = Date.now();
  const createdTime = new Date(job.requestedAt).getTime();
  const minutesSinceCreation = Math.floor((now - createdTime) / 60000);
  
  // NOW jobs (no scheduledAt or scheduled within 5 min)
  if (isNowJob(job)) {
    // NOW job becomes LATE after 5 minutes from creation
    if (minutesSinceCreation >= 5) {
      return { 
        urgencyLevel: 'LATE' as const, 
        minutesSinceCreation,
        minutesUntilScheduled: 0, 
        isLate: true,
        isNow: true,
        lateMinutes: minutesSinceCreation - 5
      };
    }
    // NOW job is OK (under 5 min)
    return { 
      urgencyLevel: 'OK' as const, 
      minutesSinceCreation,
      minutesUntilScheduled: 0, 
      isLate: false,
      isNow: true,
      remainingMinutes: 5 - minutesSinceCreation
    };
  }

  // LATER jobs (scheduled for future)
  const scheduledTime = new Date(job.scheduledAt).getTime();
  const diffMs = scheduledTime - now;
  const minutesUntilScheduled = Math.floor(diffMs / 60000);

  // LATER job is late (past scheduled time)
  if (minutesUntilScheduled < 0) {
    return { 
      urgencyLevel: 'LATE' as const, 
      minutesSinceCreation,
      minutesUntilScheduled, 
      isLate: true,
      isNow: false,
      lateMinutes: Math.abs(minutesUntilScheduled)
    };
  }

  // LATER job is within 15 minutes of scheduled time (warning)
  if (minutesUntilScheduled <= 15) {
    return { 
      urgencyLevel: 'WARNING' as const, 
      minutesSinceCreation,
      minutesUntilScheduled, 
      isLate: false,
      isNow: false
    };
  }

  // LATER job is OK (more than 15 min until scheduled)
  return { 
    urgencyLevel: 'OK' as const, 
    minutesSinceCreation,
    minutesUntilScheduled, 
    isLate: false,
    isNow: false
  };
};

/**
 * Get source display info
 */
const getSourceInfo = (job: any): { label: string; icon: string; bgClass: string } => {
  // Check for walk-in first
  if (job.isWalkIn || job.createdByDriver) {
    return { label: 'WALK-IN', icon: '👋', bgClass: 'bg-amber-500 text-white' };
  }
  
  // Check explicit source field (both top-level and in requirements)
  const source = (job.source || job.requirements?.source || '').toString().toUpperCase();
  switch (source) {
    case 'WALKIN':
      return { label: 'WALK-IN', icon: '👋', bgClass: 'bg-amber-500 text-white' };
    case 'APP':
      return { label: 'APP', icon: '📱', bgClass: 'bg-green-600 text-white' };
    case 'WEB':
      return { label: 'WEB', icon: '🌐', bgClass: 'bg-purple-600 text-white' };
    case 'PHONE':
      return { label: 'PHONE', icon: '📞', bgClass: 'bg-orange-600 text-white' };
    case 'DISPATCH':
    default:
      return { label: 'DISPATCH', icon: '🎧', bgClass: 'bg-blue-600 text-white' };
  }
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
  {
    label: "No-Show",
    value: "NOSHOW",
  },
];

/**
 * Get status badge styling - UNASSIGNED shows as PENDING with blue bg
 */
const getStatusBadgeInfo = (status: JobStatus): { label: string; className: string } => {
  switch (status) {
    case 'UNASSIGNED':
    case 'PENDING':
      return { label: 'PENDING', className: 'bg-blue-600 text-white' };
    case 'OFFERED':
      return { label: 'OFFERED', className: 'bg-purple-500 text-white' };
    case 'ASSIGNED':
      return { label: 'ASSIGNED', className: 'bg-indigo-500 text-white' };
    case 'ACTIVE':
      return { label: 'ACTIVE', className: 'bg-green-600 text-white' };
    case 'FINISHED':
      return { label: 'FINISHED', className: 'bg-slate-600 text-white' };
    case 'CANCELLED':
      return { label: 'CANCELLED', className: 'bg-red-600 text-white' };
    case 'NOSHOW':
      return { label: 'NO-SHOW', className: 'bg-orange-600 text-white' };
    case 'RECALLED':
      return { label: 'RECALLED', className: 'bg-amber-600 text-white' };
    case 'REJECTED':
      return { label: 'REJECTED', className: 'bg-rose-600 text-white' };
    default:
      return { label: status, className: 'bg-slate-500 text-white' };
  }
};

const formatJobStatusLabel = (status: JobStatus) =>
  status.replace(/_/g, " ").toUpperCase();

const resolveFareAmount = (job: any): number => {
  const candidates = [
    job.actualFare,
    job.finalAmount,
    job.rideMetrics?.finalAmount,
    job.rideMetrics?.actualFare,
    job.fareEstimate,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return 0;
};

const formatTimelineLabel = (status?: string) =>
  status ? status.replace(/_/g, " ").toUpperCase() : "UNKNOWN";

const formatTimelineTimestamp = (timestamp?: string) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const ACTIVE_METER_STATUSES = new Set<JobStatus | string>([
  "ACTIVE",
  "STARTED",
  "IN_PROGRESS",
  "REACHED",
  "ASSIGNED",
  "ACCEPTED",
]);

const formatKilometers = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return `${value.toFixed(2)} km`;
};

const formatDurationText = (seconds?: number | null) => {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return null;
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hrs > 0) {
    return `${hrs}h ${remainingMins}m`;
  }
  if (mins > 0) {
    return `${mins}m`;
  }
  return `${seconds}s`;
};

const formatTimeAgo = (iso: string) => {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes <= 0) return "Now";
  return `${minutes}m ago`;
};

/**
 * Safely extract address string from various formats
 * Handles: string, {address, latitude, longitude}, null/undefined
 */
const getAddressString = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.address) return value.address;
  if (typeof value === "object" && value.formattedAddress) return value.formattedAddress;
  return "";
};

interface JobBoardProps {
  onCreateJobClick?: () => void;
  onEditJob?: (jobId: string, jobData: any) => void;
}

const JobBoard: React.FC<JobBoardProps> = ({ onCreateJobClick, onEditJob }) => {
  const { isDark } = useTheme();
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
  
  // Timer state to force re-render for countdown updates
  const [tick, setTick] = useState(0);
  
  // Use tick in dependency to silence linter (value is used for re-render trigger)
  const tickValue = tick;
  
  // Update timer every 30 seconds for countdown display
  React.useEffect(() => {
    const tickInterval = setInterval(() => {
      setTick(t => t + 1);
    }, 30000);
    return () => clearInterval(tickInterval);
  }, []);

  // Monitor jobs for urgency alerts (both NOW and LATER jobs)
  React.useEffect(() => {
    const interval = setInterval(() => {
      for (const job of jobs) {
        // Skip non-pending jobs
        if (job.status !== 'UNASSIGNED' && job.status !== 'PENDING') continue;
        
        const urgency = getJobUrgency(job);

        // Alert when NOW job becomes LATE (5 min after creation)
        if (urgency.isNow && urgency.isLate && !alertedRef.current.has(job.id + '_now_late')) {
          alertedRef.current.add(job.id + '_now_late');
          playLateJobSound(); // Play sound alert
          toast.error(
            `🚨 NOW Job ${job.reference} is LATE! (${urgency.lateMinutes}m overdue)`,
            {
              duration: 10000,
              icon: '🚨',
            }
          );
        }

        // Alert when LATER job enters WARNING state (within 15 minutes)
        if (!urgency.isNow && urgency.urgencyLevel === 'WARNING' && !alertedRef.current.has(job.id + '_warning')) {
          alertedRef.current.add(job.id + '_warning');
          toast.error(`⚠️ Scheduled Job ${job.reference} is due in ${urgency.minutesUntilScheduled} minutes!`, {
            duration: 6000,
            icon: '⏰',
          });
        }

        // Alert when LATER job becomes LATE
        if (!urgency.isNow && urgency.isLate && !alertedRef.current.has(job.id + '_sched_late')) {
          alertedRef.current.add(job.id + '_sched_late');
          playLateJobSound(); // Play sound alert
          toast.error(
            `🚨 Scheduled Job ${job.reference} is now LATE! (${urgency.lateMinutes}m past scheduled time)`,
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
  
  // Expandable job details state
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

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
    // ✅ FIX: U-A tab should show UNASSIGNED, PENDING, REJECTED, RECALLED (NOT NOSHOW - it has its own tab)
    if (selectedStatus === "UNASSIGNED") {
      result = result.filter((job) => 
        job.status === "UNASSIGNED" || 
        job.status === "PENDING" || 
        job.status === "REJECTED" ||
        job.status === "RECALLED"
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
          getAddressString(job.pickupAddress).toLowerCase().includes(query) ||
          getAddressString(job.dropoffAddress).toLowerCase().includes(query) ||
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

    // Sort: LATE first, then NOW jobs by age, then LATER jobs by scheduled time
    result.sort((a, b) => {
      const urgencyA = getJobUrgency(a);
      const urgencyB = getJobUrgency(b);

      // 1. LATE jobs always first (sorted by how late they are)
      if (urgencyA.isLate && !urgencyB.isLate) return -1;
      if (!urgencyA.isLate && urgencyB.isLate) return 1;
      if (urgencyA.isLate && urgencyB.isLate) {
        // Both late - sort by how late (more late first)
        return (urgencyB.lateMinutes || 0) - (urgencyA.lateMinutes || 0);
      }

      // 2. WARNING jobs second
      if (urgencyA.urgencyLevel === 'WARNING' && urgencyB.urgencyLevel !== 'WARNING') return -1;
      if (urgencyA.urgencyLevel !== 'WARNING' && urgencyB.urgencyLevel === 'WARNING') return 1;

      // 3. NOW jobs before LATER jobs
      if (urgencyA.isNow && !urgencyB.isNow) return -1;
      if (!urgencyA.isNow && urgencyB.isNow) return 1;

      // 4. Within NOW jobs - sort by creation time (oldest first, they're closest to being late)
      if (urgencyA.isNow && urgencyB.isNow) {
        return new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
      }

      // 5. Within LATER jobs - sort by scheduled time (earliest first)
      if (!urgencyA.isNow && !urgencyB.isNow) {
        const schedA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity;
        const schedB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity;
        return schedA - schedB;
      }

      return 0;
    });

    return result;
  }, [jobs, selectedStatus, searchQuery, dateFilter, driverFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<JobStatus, number> = {
      PENDING: 0, // Added PENDING status count
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
    <div className={classNames(
      "flex h-full flex-col overflow-hidden",
      isDark ? "bg-slate-800" : "bg-white"
    )}>
      {/* Header with Actions - Super Responsive */}
      <div className={classNames(
        "flex flex-wrap items-center justify-between border-b px-1.5 sm:px-2 md:px-3 py-1 gap-1 sm:gap-1.5",
        isDark ? "bg-slate-700/50 border-slate-600" : "bg-slate-50 border-slate-200"
      )}>
        <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 flex-wrap">
          <button
            onClick={onCreateJobClick}
            className="rounded-md bg-blue-600 px-1.5 sm:px-2 md:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs md:text-sm font-medium text-white transition hover:bg-blue-700 shadow-sm whitespace-nowrap"
          >
            + Create Job
          </button>
          <span className={classNames(
            "rounded-full border px-1.5 sm:px-2 md:px-3 py-0.5 text-[8px] sm:text-[10px] md:text-xs font-normal whitespace-nowrap",
            isDark 
              ? "border-slate-600 bg-slate-700 text-slate-300" 
              : "border-slate-300 bg-white text-slate-600"
          )}>
            Total: {filteredJobs.length}
          </span>
          <span className={classNames(
            "rounded-full border px-1.5 sm:px-2 md:px-3 py-0.5 text-[8px] sm:text-[10px] md:text-xs font-normal whitespace-nowrap",
            isDark 
              ? "border-rose-700/50 bg-rose-900/30 text-rose-400" 
              : "border-rose-300 bg-rose-50 text-rose-600"
          )}>
            Pending: {statusCounts.UNASSIGNED}
          </span>
        </div>
        <div className={classNames(
          "flex items-center gap-1 sm:gap-1.5 lg:gap-2 text-[8px] sm:text-[10px] md:text-xs",
          isDark ? "text-slate-300" : "text-slate-600"
        )}>
          {/* Search */}
          <div className="relative">
            <Search
              size={10}
              className={classNames(
                "absolute left-1.5 sm:left-2 lg:left-3 top-1/2 -translate-y-1/2 w-2.5 sm:w-3 md:w-3.5 h-2.5 sm:h-3 md:h-3.5",
                isDark ? "text-slate-500" : "text-slate-400"
              )}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs..."
              className={classNames(
                "w-20 sm:w-28 md:w-36 lg:w-44 rounded-md border py-0.5 sm:py-1 pl-5 sm:pl-6 md:pl-7 lg:pl-8 pr-5 sm:pr-6 md:pr-7 text-[8px] sm:text-[10px] md:text-xs outline-none transition focus:ring-1 sm:focus:ring-2",
                isDark 
                  ? "border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-blue-500/30" 
                  : "border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-200"
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className={classNames(
                  "absolute right-1.5 lg:right-2 top-1/2 -translate-y-1/2",
                  isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={classNames(
              "flex items-center gap-0.5 sm:gap-1 rounded-md border px-1.5 sm:px-2 md:px-3 py-0.5 sm:py-1 transition text-[8px] sm:text-[10px] md:text-xs",
              showFilters
                ? "border-blue-500 bg-blue-500/20 text-blue-400"
                : isDark 
                  ? "border-slate-600 hover:border-blue-500 hover:text-blue-400 hover:bg-blue-500/10" 
                  : "border-slate-300 hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50"
            )}
          >
            <Filter className="w-2.5 sm:w-3 md:w-3.5 h-2.5 sm:h-3 md:h-3.5" />
            <span className="hidden md:inline">Filters</span>
            <ChevronDown
              className={classNames("w-2 sm:w-2.5 md:w-3 h-2 sm:h-2.5 md:h-3 transition", showFilters && "rotate-180")}
            />
          </button>
        </div>
      </div>

      {/* Filters Panel - Responsive */}
      {showFilters && (
        <div className={classNames(
          "border-b px-2 lg:px-4 py-2 lg:py-3",
          isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"
        )}>
          <div className="flex flex-wrap items-center gap-2 lg:gap-4">
            {/* Date Filter */}
            <div className="flex items-center gap-1 lg:gap-2">
              <Calendar size={12} className={isDark ? "text-slate-400" : "text-slate-500"} />
              <select
                value={dateFilter}
                onChange={(e) =>
                  setDateFilter(e.target.value as "all" | "today" | "week")
                }
                className={classNames(
                  "rounded-md border px-2 lg:px-3 py-0.5 lg:py-1 text-[10px] lg:text-xs outline-none focus:ring-2",
                  isDark 
                    ? "border-slate-600 bg-slate-700 text-slate-200 focus:border-blue-500 focus:ring-blue-500/30" 
                    : "border-slate-300 bg-white text-slate-700 focus:border-blue-500 focus:ring-blue-200"
                )}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
              </select>
            </div>

            {/* Driver Filter */}
            <div className="flex items-center gap-1 lg:gap-2">
              <UserCircle size={12} className={isDark ? "text-slate-400" : "text-slate-500"} />
              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className={classNames(
                  "rounded-md border px-2 lg:px-3 py-0.5 lg:py-1 text-[10px] lg:text-xs outline-none focus:ring-2",
                  isDark 
                    ? "border-slate-600 bg-slate-700 text-slate-200 focus:border-blue-500 focus:ring-blue-500/30" 
                    : "border-slate-300 bg-white text-slate-700 focus:border-blue-500 focus:ring-blue-200"
                )}
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
              className={classNames(
                "ml-auto text-[10px] lg:text-xs underline",
                isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Status Tabs - Super Responsive with fluid typography */}
      <div className={classNames(
        "flex gap-px sm:gap-0.5 px-1 sm:px-1.5 md:px-2 pt-1 pb-0 relative overflow-x-auto scrollbar-thin scrollbar-hide",
        isDark ? "bg-slate-600" : "bg-slate-200"
      )}>
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            className={classNames(
              "flex items-center gap-0.5 sm:gap-1 rounded-t-md px-1 sm:px-1.5 md:px-2 lg:px-3 py-0.5 sm:py-1 md:py-1.5 text-[7px] sm:text-[9px] md:text-[10px] lg:text-xs font-normal transition-all duration-150 relative whitespace-nowrap flex-shrink-0",
              selectedStatus === tab.value
                ? isDark 
                  ? "bg-slate-800 text-slate-100 border-t-2 border-l border-r border-blue-500 border-l-slate-600 border-r-slate-600 z-10 -mb-px"
                  : "bg-white text-slate-700 border-t-2 border-l border-r border-blue-500 border-l-slate-300 border-r-slate-300 z-10 -mb-px"
                : isDark 
                  ? "bg-slate-600/50 text-slate-400 hover:bg-slate-600 hover:text-slate-200 mb-0"
                  : "bg-slate-400/40 text-slate-600 hover:bg-slate-200 hover:text-slate-700 mb-0"
            )}
            onClick={() => setSelectedStatus(tab.value)}
          >
            {tab.label}
            <span className={classNames(
              "rounded-full px-1 sm:px-1.5 py-px sm:py-0.5 text-[6px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-normal tabular-nums",
              selectedStatus === tab.value
                ? "bg-blue-500 text-white"
                : isDark 
                  ? "bg-slate-500/50 text-slate-400"
                  : "bg-slate-500/25 text-slate-500"
            )}>
              {statusCounts[tab.value] ?? 0}
            </span>
          </button>
        ))}
        {/* Bottom border line that the selected tab breaks through */}
        <div className={classNames(
          "absolute bottom-0 left-0 right-0 h-px",
          isDark ? "bg-slate-500" : "bg-slate-300"
        )}></div>
      </div>

      <div className={classNames(
        "flex-1 overflow-y-auto overflow-x-hidden border-l border-r mx-1 sm:mx-1.5 md:mx-2",
        isDark ? "bg-slate-800 border-slate-600" : "bg-white border-slate-200"
      )}>
        {loading && (
          <div className={classNames(
            "flex items-center justify-center py-6 text-sm",
            isDark ? "text-slate-400" : "text-slate-600"
          )}>
            Syncing latest jobs…
          </div>
        )}
        {!loading && filteredJobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className={classNames(
              "rounded-full p-4 mb-3",
              isDark ? "bg-slate-700" : "bg-slate-100"
            )}>
              <MapPin size={32} className={isDark ? "text-slate-500" : "text-slate-400"} />
            </div>
            <p className={classNames(
              "text-sm font-medium",
              isDark ? "text-slate-300" : "text-slate-600"
            )}>No jobs found</p>
            <p className={classNames(
              "text-xs mt-1",
              isDark ? "text-slate-500" : "text-slate-500"
            )}>
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
            onClick={() => {
              // Toggle expand/collapse on article click
              setExpandedJobId(expandedJobId === job.id ? null : job.id);
            }}
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
              "border-b px-1.5 sm:px-2 md:px-3 py-1.5 sm:py-2 transition cursor-pointer overflow-hidden",
              isDark 
                ? "border-slate-600 bg-slate-800 hover:bg-slate-700"
                : "border-slate-200 bg-slate-50 hover:bg-white",
              selectedJobId === job.id && (isDark ? "ring-1 ring-blue-500 ring-inset bg-slate-700" : "ring-1 ring-blue-500 ring-inset bg-white"),
              expandedJobId === job.id && (isDark ? "bg-slate-700" : "bg-white")
            )}
          >
            {/* REDESIGNED: Responsive Two-Row Layout */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 w-full">
              
              {/* LEFT: Main Job Info */}
              <div className="flex flex-col gap-0.5 sm:gap-1 flex-1 min-w-0">
                
                {/* ROW 1: Reference | Date/Time | Vehicle | Phone */}
                <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 flex-wrap">
                  {/* Job Reference - ALWAYS BLACK background */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectJob(job.id);
                    }}
                    className="rounded bg-black px-1 sm:px-1.5 py-0.5 font-semibold text-white hover:bg-gray-800 transition text-[8px] sm:text-[9px] md:text-[10px] tracking-wide"
                    title={`Job ${job.reference || job.id || 'Unknown'}`}
                  >
                    🏷 {(job.reference || job.id || 'N/A').slice(-6)}
                  </button>

                  {/* Date & Time - Clear format */}
                  <span className={classNames(
                    "font-medium text-[8px] sm:text-[9px] md:text-[10px]",
                    isDark ? "text-slate-400" : "text-slate-600"
                  )}>
                    {job.scheduledAt 
                      ? new Date(job.scheduledAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) + ' ' + 
                        new Date(job.scheduledAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                      : new Date(job.requestedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                    }
                  </span>

                  {/* Vehicle Type */}
                  <span className={classNames(
                    "font-medium text-[8px] sm:text-[9px] md:text-[10px] hidden md:inline",
                    isDark ? "text-slate-300" : "text-slate-700"
                  )}>
                    {job.vehicleTypeName || job.vehicleType || "Any Vehicle"}
                  </span>

                  {/* Phone Number - Clickable */}
                  {(job.riderPhone || job.customer?.phone) && (
                    <span className={classNames(
                      "font-medium text-[8px] sm:text-[9px] md:text-[10px] hidden lg:inline",
                      isDark ? "text-slate-300" : "text-slate-700"
                    )}>
                      📞 {job.riderPhone || job.customer?.phone}
                    </span>
                  )}
                </div>

                {/* ROW 2: Pickup Address + Status Badge + Dropoff indicator */}
                <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                  {/* Green dot + Pickup Address */}
                  <div className="flex items-center gap-0.5 sm:gap-1 flex-1 min-w-0">
                    <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-green-500 flex-shrink-0" />
                    <span className={classNames(
                      "font-medium text-[8px] sm:text-[9px] md:text-[10px] truncate max-w-[100px] sm:max-w-[140px] md:max-w-none",
                      isDark ? "text-slate-200" : "text-slate-800"
                    )} title={getAddressString(job.pickupAddress)}>
                      {getAddressString(job.pickupAddress) || "No pickup address"}
                    </span>
                    
                    {/* Stops indicator */}
                    {(job.stops?.length || job.requirements?.stops?.length) ? (
                      <span className="text-purple-700 text-[7px] sm:text-[8px] md:text-[9px] font-medium bg-purple-100 px-1 py-0.5 rounded flex-shrink-0">
                        +{job.stops?.length || job.requirements?.stops?.length}
                      </span>
                    ) : null}

                    {/* Dropoff indicator - Red dot or X */}
                    {getAddressString(job.dropoffAddress) ? (
                      <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-red-500 flex-shrink-0 ml-0.5 sm:ml-1" title={getAddressString(job.dropoffAddress)} />
                    ) : (
                      <span className="text-red-600 font-bold text-[8px] sm:text-[9px] md:text-[10px] flex-shrink-0 ml-0.5 sm:ml-1" title="No dropoff">✕</span>
                    )}
                  </div>

                  {/* Requirements: Passengers, Bags, Wheelchairs - Hidden on small screens */}
                  <div className="hidden md:flex items-center gap-0.5 text-[6px] sm:text-[7px] md:text-[8px] flex-shrink-0">
                    <span className={isDark ? "text-slate-400" : "text-slate-600"} title="Passengers">👥{job.passengers || job.requirements?.passengers || 1}</span>
                    <span className={isDark ? "text-slate-400" : "text-slate-600"} title="Bags">🧳{job.bags || job.requirements?.bags || 0}</span>
                    <span title="Wheelchairs" className={(job.wheelchairs || job.requirements?.wheelchairs) ? "text-orange-600 font-bold" : isDark ? "text-slate-400" : "text-slate-600"}>
                      ♿{job.wheelchairs || job.requirements?.wheelchairs || 0}
                    </span>
                  </div>

                  {/* Status Badge - Compact */}
                  {(() => {
                    const statusInfo = getStatusBadgeInfo(job.status);
                    return (
                      <span className={classNames(
                        "rounded-full px-1 sm:px-1.5 py-px text-[6px] sm:text-[7px] md:text-[8px] font-medium uppercase tracking-wide",
                        statusInfo.className
                      )}>
                        {statusInfo.label}
                      </span>
                    );
                  })()}

                  {/* Urgency/Timer Badge - Only show blinking animation in U-A tab */}
                  {(() => {
                    const urg = getJobUrgency(job);
                    const isInUnassignedTab = selectedStatus === 'UNASSIGNED';
                    if (urg.isLate) {
                      return (
                        <span className={`text-white font-medium text-[6px] sm:text-[7px] md:text-[8px] bg-red-600 px-1 py-px rounded-full ${isInUnassignedTab ? 'animate-pulse' : ''}`}>
                          🚨{urg.lateMinutes}m
                        </span>
                      );
                    }
                    if (urg.urgencyLevel === 'WARNING') {
                      return (
                        <span className="text-amber-800 font-medium text-[6px] sm:text-[7px] md:text-[8px] bg-amber-200 px-1 py-px rounded-full">
                          ⏰{urg.minutesUntilScheduled}m
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {/* RIGHT: Driver Select + Action Buttons - Responsive */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {/* Driver Assignment Dropdown - Compact */}
                {isAssignableJobStatus(job.status) && (
                  <>
                    <select
                      className={classNames(
                        "text-[7px] sm:text-[8px] md:text-[9px] rounded border px-1 py-0.5 outline-none focus:border-blue-500 w-14 sm:w-16 md:w-20 font-medium",
                        isDark 
                          ? "border-slate-500 bg-slate-700 text-slate-200" 
                          : "border-slate-300 bg-white text-slate-700"
                      )}
                      onChange={(e) => {
                        e.stopPropagation();
                        const value = e.target.value;
                        if (value) {
                          handleQuickAssign(job.id, value);
                          e.target.value = "";
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      defaultValue=""
                    >
                      <option value="">Driver</option>
                      {availableDrivers.slice(0, 10).map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="text-[7px] sm:text-[8px] md:text-[9px] rounded bg-blue-600 px-1 py-0.5 text-white font-medium hover:bg-blue-700 transition"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectJob(job.id);
                      }}
                      title="Send to Map"
                    >
                      📍
                    </button>
                  </>
                )}

                {/* Unassign button */}
                {(job.status === "OFFERED" || job.status === "ASSIGNED") && (
                  <button
                    className={classNames(
                      "text-[6px] sm:text-[7px] md:text-[8px] rounded border px-1 py-0.5 font-medium transition hidden md:inline-block",
                      isDark 
                        ? "border-amber-500/50 text-amber-400 hover:bg-amber-900/30"
                        : "border-amber-400 text-amber-700 hover:bg-amber-50"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnassignJob(job.id);
                    }}
                  >
                    Unassign
                  </button>
                )}

                {/* Cancel button */}
                {canCancelJob(job.status) && (
                  <button
                    className={classNames(
                      "text-[7px] sm:text-[8px] md:text-[9px] rounded border px-1 py-0.5 font-medium transition",
                      isDark 
                        ? "border-red-500/50 text-red-400 hover:bg-red-900/30"
                        : "border-red-300 text-red-600 hover:bg-red-50"
                    )}
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
                    title="Cancel Job"
                  >
                    ✕
                  </button>
                )}
                
                {/* In Progress indicator */}
                {job.status === "ACTIVE" && (
                  <span className={classNames(
                    "text-[6px] sm:text-[7px] md:text-[8px] text-white bg-green-600 px-1 py-px rounded font-medium",
                  )}>
                    🚗
                  </span>
                )}

                {/* Details button */}
                <button
                  className={classNames(
                    "text-[7px] sm:text-[8px] md:text-[9px] rounded border px-1 py-0.5 transition",
                    isDark 
                      ? "border-slate-500 text-slate-300 hover:border-blue-500 hover:text-blue-400"
                      : "border-slate-300 text-slate-600 hover:border-blue-500 hover:text-blue-600"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedJobForDetails(job.id);
                  }}
                  title="View Details"
                >
                  <PenSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                </button>
              </div>
            </div> {/* Close main container */}

            {/* EXPANDED: Clean Details Section - Responsive */}
            {expandedJobId === job.id && (
              <div className={classNames(
                "mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t px-1.5 sm:px-2 md:px-3 py-1.5 sm:py-2 rounded",
                isDark 
                  ? "border-slate-600 bg-slate-700/50"
                  : "border-slate-200 bg-slate-50"
              )}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2 text-[8px] sm:text-[9px] md:text-[10px]">
                  
                  {/* Time Remaining */}
                  <div className={classNames(
                    "flex items-center gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded",
                    isDark ? "bg-slate-600" : "bg-slate-100"
                  )}>
                    <span className={isDark ? "text-slate-400" : "text-slate-500"}>⏱</span>
                    {(() => {
                      const urg = getJobUrgency(job);
                      if (urg.isLate) {
                        return <span className="font-semibold text-red-500">{urg.lateMinutes}m Late</span>;
                      }
                      if (urg.minutesUntilScheduled > 0) {
                        return <span className={classNames("font-medium", isDark ? "text-blue-400" : "text-blue-700")}>{urg.minutesUntilScheduled}m</span>;
                      }
                      return <span className="font-medium text-green-500">Now</span>;
                    })()}
                  </div>

                  {/* Customer Name */}
                  <div className={classNames(
                    "flex items-center gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded",
                    isDark ? "bg-slate-600" : "bg-slate-100"
                  )}>
                    <span className={isDark ? "text-slate-400" : "text-slate-500"}>👤</span>
                    <span className={classNames("font-medium truncate", isDark ? "text-slate-200" : "text-slate-800")}>
                      {job.riderName || job.customer?.firstName || "Guest"}
                    </span>
                  </div>

                  {/* Source */}
                  <div className={classNames(
                    "flex items-center gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded",
                    isDark ? "bg-slate-600" : "bg-slate-100"
                  )}>
                    <span className={isDark ? "text-slate-400" : "text-slate-500"}>🏷</span>
                    {(() => {
                      const sourceInfo = getSourceInfo(job);
                      return <span className={classNames("font-medium", isDark ? "text-slate-200" : "text-slate-700")}>{sourceInfo.icon} {sourceInfo.label}</span>;
                    })()}
                  </div>

                  {/* Fare */}
                  <div className={classNames(
                    "flex items-center gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded",
                    isDark ? "bg-emerald-900/30" : "bg-green-100"
                  )}>
                    <span className="text-green-500">💰</span>
                    <span className={classNames("font-semibold", isDark ? "text-emerald-400" : "text-green-700")}>${resolveFareAmount(job).toFixed(2)}</span>
                  </div>

                  {/* Dropoff Address */}
                  {getAddressString(job.dropoffAddress) && (
                    <div className={classNames(
                      "col-span-2 flex items-start gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded",
                      isDark ? "bg-red-900/20" : "bg-red-50"
                    )}>
                      <span className="text-red-500 flex-shrink-0">📍</span>
                      <span className={classNames("font-medium truncate", isDark ? "text-slate-200" : "text-slate-700")}>
                        {getAddressString(job.dropoffAddress)}
                      </span>
                    </div>
                  )}

                  {/* Driver Info */}
                  {job.assignedDriver && (
                    <div className={classNames(
                      "col-span-2 flex items-center gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded",
                      isDark ? "bg-purple-900/20" : "bg-purple-100"
                    )}>
                      <span className="text-purple-500">🚕</span>
                      <span className={classNames("font-medium", isDark ? "text-purple-300" : "text-purple-800")}>
                        {job.assignedDriver.firstName} {job.assignedDriver.lastName}
                      </span>
                      {job.assignedDriver.phone && (
                        <span className={classNames("hidden md:inline", isDark ? "text-purple-400" : "text-purple-600")}>📞 {job.assignedDriver.phone}</span>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {job.notes && (
                    <div className={classNames(
                      "col-span-full flex items-start gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded",
                      isDark ? "bg-amber-900/20" : "bg-amber-50"
                    )}>
                      <span className="text-amber-500 flex-shrink-0">📝</span>
                      <span className={isDark ? "text-slate-300" : "text-slate-700"}>{job.notes}</span>
                    </div>
                  )}

                  {/* Live Metrics for Active Jobs */}
                  {job.rideMetrics && ACTIVE_METER_STATUSES.has(job.status) && (
                    <div className={classNames(
                      "col-span-full grid grid-cols-3 gap-1 pt-1.5 border-t",
                      isDark ? "border-slate-600" : "border-slate-200"
                    )}>
                      {job.rideMetrics?.actualDistance != null && (
                        <div className={classNames(
                          "px-1.5 sm:px-2 py-1 sm:py-1.5 rounded text-center",
                          isDark ? "bg-emerald-900/20" : "bg-emerald-50"
                        )}>
                          <p className={classNames("text-[7px] sm:text-[8px] uppercase", isDark ? "text-slate-400" : "text-slate-500")}>Dist</p>
                          <p className={classNames("font-semibold text-[8px] sm:text-[9px] md:text-[10px]", isDark ? "text-emerald-400" : "text-emerald-700")}>{formatKilometers(job.rideMetrics.actualDistance)}</p>
                        </div>
                      )}
                      {job.rideMetrics?.actualDuration != null && (
                        <div className={classNames(
                          "px-1.5 sm:px-2 py-1 sm:py-1.5 rounded text-center",
                          isDark ? "bg-blue-900/20" : "bg-blue-50"
                        )}>
                          <p className={classNames("text-[7px] sm:text-[8px] uppercase", isDark ? "text-slate-400" : "text-slate-500")}>Time</p>
                          <p className={classNames("text-[7px] sm:text-[8px] uppercase", isDark ? "text-slate-400" : "text-slate-500")}>Time</p>
                          <p className={classNames("font-semibold text-[8px] sm:text-[9px] md:text-[10px]", isDark ? "text-blue-400" : "text-blue-700")}>{formatDurationText(job.rideMetrics.actualDuration)}</p>
                        </div>
                      )}
                      {(job.rideMetrics?.actualFare ?? job.rideMetrics?.finalAmount) != null && (
                        <div className={classNames(
                          "px-1.5 sm:px-2 py-1 sm:py-1.5 rounded text-center",
                          isDark ? "bg-amber-900/20" : "bg-amber-50"
                        )}>
                          <p className={classNames("text-[7px] sm:text-[8px] uppercase", isDark ? "text-slate-400" : "text-slate-500")}>Fare</p>
                          <p className={classNames("font-semibold text-[8px] sm:text-[9px] md:text-[10px]", isDark ? "text-amber-400" : "text-amber-700")}>${Number(job.rideMetrics?.actualFare ?? job.rideMetrics?.finalAmount).toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
