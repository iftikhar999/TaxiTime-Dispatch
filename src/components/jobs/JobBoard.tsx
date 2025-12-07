import classNames from "classnames";
import {
    AlertCircle,
    Calendar,
    ChevronDown,
    ChevronRight,
    Clock,
    Filter,
    Grip,
    MapPin,
    MoreHorizontal,
    Phone,
    Plus,
    RotateCcw,
    Search,
    Send,
    User,
    UserCircle,
    Users,
    X
} from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTheme } from "../../contexts/ThemeContext";
import { useDispatchController } from "../../hooks/useDispatchController";
import { cancelJob } from "../../services/jobService";
import { JobStatus, useDispatchStore } from "../../store/useDispatchStore";
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

const canCancelJob = (status: JobStatus): boolean => {
  return status === "UNASSIGNED" || status === "OFFERED" || status === "ASSIGNED";
};

// Jobs that can be recalled (taken back from driver)
const canRecallJob = (status: JobStatus): boolean => {
  return status === "OFFERED" || status === "ASSIGNED";
};

const isNowJob = (job: any): boolean => {
  if (!job.scheduledAt) return true;
  const scheduledTime = new Date(job.scheduledAt).getTime();
  const now = Date.now();
  return scheduledTime <= now + 5 * 60 * 1000;
};

const getJobUrgency = (job: any) => {
  const now = Date.now();
  const createdTime = new Date(job.requestedAt).getTime();
  const minutesSinceCreation = Math.floor((now - createdTime) / 60000);
  
  if (isNowJob(job)) {
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
    return { 
      urgencyLevel: 'OK' as const, 
      minutesSinceCreation,
      minutesUntilScheduled: 0, 
      isLate: false,
      isNow: true,
      remainingMinutes: 5 - minutesSinceCreation
    };
  }

  const scheduledTime = new Date(job.scheduledAt).getTime();
  const diffMs = scheduledTime - now;
  const minutesUntilScheduled = Math.floor(diffMs / 60000);

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

  if (minutesUntilScheduled <= 15) {
    return { 
      urgencyLevel: 'WARNING' as const, 
      minutesSinceCreation,
      minutesUntilScheduled, 
      isLate: false,
      isNow: false
    };
  }

  return { 
    urgencyLevel: 'OK' as const, 
    minutesSinceCreation,
    minutesUntilScheduled, 
    isLate: false,
    isNow: false
  };
};

const getSourceInfo = (job: any): { label: string; icon: string; color: string } => {
  if (job.isWalkIn || job.createdByDriver) {
    return { label: 'Walk-In', icon: '👋', color: 'amber' };
  }
  const source = (job.source || job.requirements?.source || '').toString().toUpperCase();
  switch (source) {
    case 'WALKIN':
      return { label: 'Walk-In', icon: '👋', color: 'amber' };
    case 'APP':
      return { label: 'App', icon: '📱', color: 'emerald' };
    case 'WEB':
      return { label: 'Web', icon: '🌐', color: 'violet' };
    case 'PHONE':
      return { label: 'Phone', icon: '📞', color: 'orange' };
    default:
      return { label: 'Dispatch', icon: '🎧', color: 'blue' };
  }
};

const statusConfig: Record<string, { label: string; color: string; bgLight: string; bgDark: string; textLight: string; textDark: string }> = {
  UNASSIGNED: { label: 'Pending', color: 'blue', bgLight: 'bg-blue-500', bgDark: 'bg-blue-600', textLight: 'text-white', textDark: 'text-white' },
  PENDING: { label: 'Pending', color: 'blue', bgLight: 'bg-blue-500', bgDark: 'bg-blue-600', textLight: 'text-white', textDark: 'text-white' },
  OFFERED: { label: 'Offered', color: 'purple', bgLight: 'bg-purple-500', bgDark: 'bg-purple-600', textLight: 'text-white', textDark: 'text-white' },
  ASSIGNED: { label: 'Assigned', color: 'indigo', bgLight: 'bg-indigo-500', bgDark: 'bg-indigo-600', textLight: 'text-white', textDark: 'text-white' },
  ACTIVE: { label: 'Active', color: 'emerald', bgLight: 'bg-emerald-500', bgDark: 'bg-emerald-600', textLight: 'text-white', textDark: 'text-white' },
  FINISHED: { label: 'Complete', color: 'slate', bgLight: 'bg-slate-500', bgDark: 'bg-slate-600', textLight: 'text-white', textDark: 'text-white' },
  CANCELLED: { label: 'Cancelled', color: 'red', bgLight: 'bg-red-500', bgDark: 'bg-red-600', textLight: 'text-white', textDark: 'text-white' },
  NOSHOW: { label: 'No-Show', color: 'orange', bgLight: 'bg-orange-500', bgDark: 'bg-orange-600', textLight: 'text-white', textDark: 'text-white' },
  RECALLED: { label: 'Recalled', color: 'amber', bgLight: 'bg-amber-500', bgDark: 'bg-amber-600', textLight: 'text-white', textDark: 'text-white' },
  REJECTED: { label: 'Rejected', color: 'rose', bgLight: 'bg-rose-500', bgDark: 'bg-rose-600', textLight: 'text-white', textDark: 'text-white' },
};

const statusTabs: { label: string; value: JobStatus; icon?: string }[] = [
  { label: "Unassigned", value: "UNASSIGNED", icon: "🔴" },
  { label: "Offered", value: "OFFERED", icon: "📤" },
  { label: "Assigned", value: "ASSIGNED", icon: "✅" },
  { label: "Active", value: "ACTIVE", icon: "🚗" },
  { label: "Completed", value: "FINISHED", icon: "🏁" },
  { label: "Cancelled", value: "CANCELLED", icon: "❌" },
  { label: "No-Show", value: "NOSHOW", icon: "👻" },
];

const resolveFareAmount = (job: any): number => {
  const candidates = [job.actualFare, job.finalAmount, job.rideMetrics?.finalAmount, job.rideMetrics?.actualFare, job.fareEstimate];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

const getAddressString = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.address) return value.address;
  if (typeof value === "object" && value.formattedAddress) return value.formattedAddress;
  return "";
};

const formatTime = (date: string | Date) => {
  return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
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
  const setSelectedStatus = useDispatchStore((state) => state.setSelectedStatus);
  const jobCounters = useDispatchStore((state) => state.jobCounters);
  const loading = useDispatchStore((state) => state.loading);
  const drivers = useDispatchStore((state) => state.drivers);
  const assignDriver = useDispatchStore((state) => state.assignDriver);
  const unassignJob = useDispatchStore((state) => state.unassignJob);
  const setHoveredJobId = useDispatchStore((state) => state.setHoveredJobId);
  
  const { fetchJobs, fetchJobCounters } = useDispatchController();
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week">("all");
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const alertedRef = React.useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  
  React.useEffect(() => {
    const tickInterval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(tickInterval);
  }, []);

  React.useEffect(() => {
    const interval = setInterval(() => {
      for (const job of jobs) {
        if (job.status !== 'UNASSIGNED' && job.status !== 'PENDING') continue;
        const urgency = getJobUrgency(job);
        if (urgency.isNow && urgency.isLate && !alertedRef.current.has(job.id + '_now_late')) {
          alertedRef.current.add(job.id + '_now_late');
          playLateJobSound();
          toast.error(`🚨 NOW Job ${job.reference} is LATE! (${urgency.lateMinutes}m overdue)`, { duration: 10000 });
        }
        if (!urgency.isNow && urgency.urgencyLevel === 'WARNING' && !alertedRef.current.has(job.id + '_warning')) {
          alertedRef.current.add(job.id + '_warning');
          toast.error(`⚠️ Scheduled Job ${job.reference} is due in ${urgency.minutesUntilScheduled} minutes!`, { duration: 6000 });
        }
        if (!urgency.isNow && urgency.isLate && !alertedRef.current.has(job.id + '_sched_late')) {
          alertedRef.current.add(job.id + '_sched_late');
          playLateJobSound();
          toast.error(`🚨 Scheduled Job ${job.reference} is now LATE! (${urgency.lateMinutes}m past scheduled time)`, { duration: 10000 });
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [jobs]);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<{ jobId: string; driverId: string; driverName: string; jobReference: string } | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (selectedStatus === "UNASSIGNED") {
      result = result.filter((job) => job.status === "UNASSIGNED" || job.status === "PENDING" || job.status === "REJECTED" || job.status === "RECALLED");
    } else {
      result = result.filter((job) => job.status === selectedStatus);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((job) =>
        job.reference.toLowerCase().includes(query) ||
        getAddressString(job.pickupAddress).toLowerCase().includes(query) ||
        getAddressString(job.dropoffAddress).toLowerCase().includes(query) ||
        job.riderName?.toLowerCase().includes(query)
      );
    }
    if (dateFilter === "today") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      result = result.filter((job) => new Date(job.requestedAt) >= today);
    } else if (dateFilter === "week") {
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      result = result.filter((job) => new Date(job.requestedAt) >= weekAgo);
    }
    if (driverFilter !== "all") {
      result = result.filter((job) => job.driverId === driverFilter);
    }
    result.sort((a, b) => {
      const urgencyA = getJobUrgency(a);
      const urgencyB = getJobUrgency(b);
      if (urgencyA.isLate && !urgencyB.isLate) return -1;
      if (!urgencyA.isLate && urgencyB.isLate) return 1;
      if (urgencyA.isLate && urgencyB.isLate) return (urgencyB.lateMinutes || 0) - (urgencyA.lateMinutes || 0);
      if (urgencyA.urgencyLevel === 'WARNING' && urgencyB.urgencyLevel !== 'WARNING') return -1;
      if (urgencyA.urgencyLevel !== 'WARNING' && urgencyB.urgencyLevel === 'WARNING') return 1;
      if (urgencyA.isNow && !urgencyB.isNow) return -1;
      if (!urgencyA.isNow && urgencyB.isNow) return 1;
      if (urgencyA.isNow && urgencyB.isNow) return new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
      if (!urgencyA.isNow && !urgencyB.isNow) {
        const schedA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity;
        const schedB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity;
        return schedA - schedB;
      }
      return 0;
    });
    return result;
  }, [jobs, selectedStatus, searchQuery, dateFilter, driverFilter]);

  // UNASSIGNED tab shows UNASSIGNED + PENDING + REJECTED + RECALLED jobs (matches filter logic)
  const statusCounts = useMemo(() => ({
    PENDING: 0,
    UNASSIGNED: (jobCounters.unassigned ?? 0) + (jobCounters.rejected ?? 0) + (jobCounters.recalled ?? 0),
    OFFERED: jobCounters.offered ?? 0,
    ASSIGNED: jobCounters.assigned ?? 0,
    REJECTED: 0, // Included in UNASSIGNED count
    NOSHOW: jobCounters.noShow ?? 0,
    RECALLED: 0, // Included in UNASSIGNED count
    ACTIVE: jobCounters.active ?? 0,
    FINISHED: jobCounters.finished ?? 0,
    CANCELLED: jobCounters.cancelled ?? 0,
  }), [jobCounters]);

  const selectedJobDetails = useMemo(() => {
    if (!selectedJobForDetails) return null;
    return jobs.find((job) => job.id === selectedJobForDetails) || null;
  }, [selectedJobForDetails, jobs]);

  const availableDrivers = useMemo(() => drivers.filter((d) => d.status === "AVAILABLE"), [drivers]);

  const handleAssignDriver = async (jobId: string, driverId: string) => {
    const driver = drivers.find((d) => d.id === driverId);
    const job = jobs.find((j) => j.id === jobId);
    if (!driver || !job) { toast.error("Driver or job not found"); return; }
    setPendingAssignment({ jobId, driverId, driverName: driver.name, jobReference: job.reference });
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
      await Promise.all([fetchJobs(), fetchJobCounters()]);
    } catch (error) {
      console.error("Failed to cancel job:", error);
      toast.error("Failed to cancel job");
    }
  };

  const handleQuickAssign = async (jobId: string, driverId: string) => {
    if (!driverId) { toast.error("Please select a driver"); return; }
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
    <div className={classNames("flex h-full flex-col overflow-hidden rounded-lg", isDark ? "bg-slate-900" : "bg-white")}>
      
      {/* ═══════════════════════════════════════════════════════════════════════════
          HEADER: Professional Top Bar with Actions
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className={classNames(
        "flex items-center justify-between px-3 py-2 border-b",
        isDark ? "bg-slate-800/80 border-slate-700/50" : "bg-gradient-to-r from-slate-50 to-white border-slate-200"
      )}>
        {/* Left: Title + Create Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Grip size={14} className={isDark ? "text-slate-500" : "text-slate-400"} />
            <h2 className={classNames("text-sm font-semibold tracking-tight", isDark ? "text-white" : "text-slate-800")}>
              Jobs
            </h2>
          </div>
          <button
            onClick={onCreateJobClick}
            className={classNames(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200",
              "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm shadow-blue-500/25",
              "hover:from-blue-500 hover:to-blue-400 hover:shadow-md hover:shadow-blue-500/30",
              "active:scale-[0.98]"
            )}
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>Create Job</span>
          </button>
        </div>

        {/* Right: Stats + Search + Filters */}
        <div className="flex items-center gap-2">
          {/* Quick Stats Pills */}
          <div className="hidden md:flex items-center gap-1.5">
            <span className={classNames(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
            )}>
              Total: {filteredJobs.length}
            </span>
            <span className={classNames(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              isDark ? "bg-rose-900/40 text-rose-300" : "bg-rose-50 text-rose-600"
            )}>
              Pending: {statusCounts.UNASSIGNED}
            </span>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={12} className={classNames(
              "absolute left-2.5 top-1/2 -translate-y-1/2",
              isDark ? "text-slate-500" : "text-slate-400"
            )} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className={classNames(
                "w-32 md:w-40 rounded-lg border py-1.5 pl-7 pr-7 text-xs outline-none transition-all duration-200",
                isDark
                  ? "border-slate-700 bg-slate-800 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                  : "border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              )}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={classNames(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
              showFilters
                ? "border-blue-500 bg-blue-500/10 text-blue-500"
                : isDark
                  ? "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-700"
            )}
          >
            <Filter size={12} />
            <span className="hidden md:inline">Filters</span>
            <ChevronDown size={12} className={classNames("transition-transform", showFilters && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          FILTERS PANEL (Collapsible)
          ═══════════════════════════════════════════════════════════════════════════ */}
      {showFilters && (
        <div className={classNames(
          "flex items-center gap-4 px-3 py-2 border-b",
          isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-slate-50/80 border-slate-100"
        )}>
          <div className="flex items-center gap-1.5">
            <Calendar size={12} className={isDark ? "text-slate-500" : "text-slate-400"} />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className={classNames(
                "rounded-md border px-2 py-1 text-xs outline-none",
                isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-200 bg-white text-slate-700"
              )}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <UserCircle size={12} className={isDark ? "text-slate-500" : "text-slate-400"} />
            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className={classNames(
                "rounded-md border px-2 py-1 text-xs outline-none",
                isDark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-200 bg-white text-slate-700"
              )}
            >
              <option value="all">All Drivers</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <button
            onClick={() => { setDateFilter("all"); setDriverFilter("all"); setSearchQuery(""); }}
            className={classNames("text-xs underline ml-auto", isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-500 hover:text-slate-700")}
          >
            Clear All
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          STATUS TABS: Clean Horizontal Navigation
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className={classNames(
        "flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-hide",
        isDark ? "bg-slate-800/40" : "bg-slate-100/60"
      )}>
        {statusTabs.map((tab) => {
          const isActive = selectedStatus === tab.value;
          const count = statusCounts[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              onClick={() => setSelectedStatus(tab.value)}
              className={classNames(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 whitespace-nowrap",
                isActive
                  ? isDark
                    ? "bg-slate-700 text-white shadow-sm"
                    : "bg-white text-slate-800 shadow-sm"
                  : isDark
                    ? "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                    : "text-slate-500 hover:bg-white/60 hover:text-slate-700"
              )}
            >
              <span>{tab.label}</span>
              <span className={classNames(
                "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold tabular-nums",
                isActive
                  ? "bg-blue-500 text-white"
                  : isDark
                    ? "bg-slate-600 text-slate-400"
                    : "bg-slate-200 text-slate-500"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          JOB LIST: Modern Card-Based Design
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className={classNames("flex-1 overflow-y-auto px-2 py-2 space-y-1.5", isDark ? "bg-slate-900" : "bg-slate-50/50")}>
        
        {loading && (
          <div className={classNames("flex items-center justify-center py-12", isDark ? "text-slate-400" : "text-slate-500")}>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading jobs...</span>
            </div>
          </div>
        )}

        {!loading && filteredJobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className={classNames("rounded-2xl p-4 mb-3", isDark ? "bg-slate-800" : "bg-slate-100")}>
              <MapPin size={28} className={isDark ? "text-slate-600" : "text-slate-400"} />
            </div>
            <p className={classNames("text-sm font-medium", isDark ? "text-slate-300" : "text-slate-600")}>No jobs found</p>
            <p className={classNames("text-xs mt-1 max-w-[200px]", isDark ? "text-slate-500" : "text-slate-400")}>
              {searchQuery ? "Try adjusting your search or filters" : "Jobs will appear here when created"}
            </p>
          </div>
        )}

        {filteredJobs.map((job) => {
          const urgency = getJobUrgency(job);
          const statusInfo = statusConfig[job.status] || statusConfig.UNASSIGNED;
          const sourceInfo = getSourceInfo(job);
          const isExpanded = expandedJobId === job.id;
          const isSelected = selectedJobId === job.id;

          return (
            <article
              key={job.id}
              onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
              onMouseEnter={() => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); setHoveredJobId(job.id); }}
              onMouseLeave={() => { hoverTimeoutRef.current = setTimeout(() => setHoveredJobId(null), 4000); }}
              className={classNames(
                "group relative rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden",
                isDark
                  ? "bg-slate-800/80 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600"
                  : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-sm",
                isSelected && (isDark ? "ring-2 ring-blue-500/50 border-blue-500/50" : "ring-2 ring-blue-500/30 border-blue-400"),
                job.status !== 'UNASSIGNED' && job.status !== 'PENDING' && urgency.isLate && (isDark ? "border-l-2 border-l-red-500" : "border-l-2 border-l-red-500"),
                job.status !== 'UNASSIGNED' && job.status !== 'PENDING' && urgency.urgencyLevel === 'WARNING' && !urgency.isLate && (isDark ? "border-l-2 border-l-amber-500" : "border-l-2 border-l-amber-500")
              )}
            >
              {/* Main Job Card Content */}
              <div className="p-2.5">
                
                {/* Row 1: Reference, Time, Status, Urgency */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {/* Job Reference Badge */}
                    <button
                      onClick={(e) => { e.stopPropagation(); selectJob(job.id); }}
                      className={classNames(
                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide transition-all",
                        "bg-slate-900 text-amber-400 hover:bg-slate-800",
                        isDark && "bg-slate-950"
                      )}
                    >
                      <span className="text-[10px]">🚖</span>
                      {(job.reference || job.id || 'N/A').slice(-6).toUpperCase()}
                    </button>

                    {/* Time */}
                    <span className={classNames(
                      "flex items-center gap-1 text-[11px] font-medium",
                      isDark ? "text-slate-400" : "text-slate-500"
                    )}>
                      <Clock size={10} />
                      {job.scheduledAt ? formatTime(job.scheduledAt) : formatTime(job.requestedAt)}
                    </span>

                    {/* Date if scheduled */}
                    {job.scheduledAt && (
                      <span className={classNames(
                        "text-[10px]",
                        isDark ? "text-slate-500" : "text-slate-400"
                      )}>
                        {formatDate(job.scheduledAt)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Urgency Badge - Only show for non-UNASSIGNED jobs */}
                    {job.status !== 'UNASSIGNED' && job.status !== 'PENDING' && urgency.isLate && (
                      <span className="flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse">
                        <AlertCircle size={10} />
                        {urgency.lateMinutes}m late
                      </span>
                    )}
                    {job.status !== 'UNASSIGNED' && job.status !== 'PENDING' && urgency.urgencyLevel === 'WARNING' && !urgency.isLate && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        <Clock size={10} />
                        {urgency.minutesUntilScheduled}m
                      </span>
                    )}

                    {/* Status Badge */}
                    <span className={classNames(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      isDark ? statusInfo.bgDark : statusInfo.bgLight,
                      statusInfo.textLight
                    )}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>

                {/* Row 2: Addresses - Inline Layout */}
                <div className="flex items-center gap-2 mb-2">
                  {/* Pickup */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 flex-shrink-0" />
                    <p className={classNames(
                      "text-xs font-medium leading-tight truncate",
                      isDark ? "text-slate-200" : "text-slate-700"
                    )}>
                      {getAddressString(job.pickupAddress) || "No pickup"}
                    </p>
                  </div>

                  {/* Arrow */}
                  <span className={classNames("text-xs flex-shrink-0", isDark ? "text-slate-500" : "text-slate-400")}>→</span>

                  {/* Dropoff */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className={classNames(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      getAddressString(job.dropoffAddress) 
                        ? "bg-red-500 ring-2 ring-red-500/20" 
                        : isDark ? "bg-slate-600" : "bg-slate-300"
                    )} />
                    <p className={classNames(
                      "text-xs leading-tight truncate",
                      getAddressString(job.dropoffAddress)
                        ? isDark ? "text-slate-400" : "text-slate-500"
                        : isDark ? "text-slate-500 italic" : "text-slate-400 italic"
                    )}>
                      {getAddressString(job.dropoffAddress) || "As directed"}
                    </p>
                  </div>
                </div>

                {/* Row 3: Meta Info + Actions */}
                <div className="flex items-center justify-between gap-2">
                  {/* Left: Meta chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Vehicle Type */}
                    <span className={classNames(
                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                      isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                    )}>
                      🚗 {job.vehicleTypeName || job.vehicleType || "Any"}
                    </span>

                    {/* Passengers */}
                    <span className={classNames(
                      "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                      isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                    )}>
                      <Users size={10} />
                      {job.passengers || job.requirements?.passengers || 1}
                    </span>

                    {/* Phone */}
                    {(job.riderPhone || job.customer?.phone) && (
                      <span className={classNames(
                        "hidden md:inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                        isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                      )}>
                        <Phone size={10} />
                        {(job.riderPhone || job.customer?.phone || '').slice(-8)}
                      </span>
                    )}

                    {/* Stops */}
                    {((job.stops?.length || 0) + (job.requirements?.stops?.length || 0)) > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                        +{job.stops?.length || job.requirements?.stops?.length || 0} stops
                      </span>
                    )}
                  </div>

                  {/* Right: Action Buttons */}
                  <div className="flex items-center gap-1">
                    {isAssignableJobStatus(job.status) && (
                      <>
                        <select
                          className={classNames(
                            "rounded-md border px-1.5 py-1 text-[10px] font-medium outline-none w-20",
                            isDark
                              ? "border-slate-600 bg-slate-700 text-slate-200 focus:border-blue-500"
                              : "border-slate-200 bg-white text-slate-700 focus:border-blue-500"
                          )}
                          onChange={(e) => { e.stopPropagation(); if (e.target.value) { handleQuickAssign(job.id, e.target.value); e.target.value = ""; }}}
                          onClick={(e) => e.stopPropagation()}
                          defaultValue=""
                        >
                          <option value="">Assign...</option>
                          {availableDrivers.slice(0, 15).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>

                        <button
                          onClick={(e) => { e.stopPropagation(); selectJob(job.id); }}
                          className={classNames(
                            "rounded-md p-1.5 transition-colors",
                            isDark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"
                          )}
                          title="Show on Map"
                        >
                          <Send size={12} />
                        </button>
                      </>
                    )}

                    {canCancelJob(job.status) && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (globalThis.confirm(`Cancel job ${job.reference}?`)) {
                            await handleCancelJob(job.id);
                          }
                        }}
                        className={classNames(
                          "rounded-md p-1.5 transition-colors",
                          isDark ? "hover:bg-red-900/50 text-red-400" : "hover:bg-red-50 text-red-500"
                        )}
                        title="Cancel Job"
                      >
                        <X size={12} />
                      </button>
                    )}

                    {/* Recall Job - Take back from driver */}
                    {canRecallJob(job.status) && (
                      <>
                        {/* Reassign to another driver dropdown */}
                        <select
                          className={classNames(
                            "rounded-md border px-1 py-1 text-[10px] font-medium outline-none w-20",
                            isDark
                              ? "border-amber-600 bg-slate-700 text-amber-300 focus:border-amber-500"
                              : "border-amber-300 bg-amber-50 text-amber-700 focus:border-amber-500"
                          )}
                          onChange={async (e) => {
                            e.stopPropagation();
                            if (e.target.value) {
                              const newDriverId = e.target.value;
                              const newDriver = drivers.find(d => d.id === newDriverId);
                              if (globalThis.confirm(`Reassign job ${job.reference} to ${newDriver?.name || 'this driver'}? The current driver will be notified.`)) {
                                await handleUnassignJob(job.id);
                                await handleQuickAssign(job.id, newDriverId);
                              }
                              e.target.value = "";
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          defaultValue=""
                          title="Reassign to another driver"
                        >
                          <option value="">Reassign...</option>
                          {drivers.filter(d => d.id !== job.driverId && d.id !== job.assignedDriver?.id).slice(0, 15).map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>

                        {/* Recall button - just take back */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (globalThis.confirm(`Recall job ${job.reference} from driver? The driver will be notified that the job has been taken back.`)) {
                              await handleUnassignJob(job.id);
                            }
                          }}
                          className={classNames(
                            "rounded-md p-1.5 transition-colors",
                            isDark ? "hover:bg-amber-900/50 text-amber-400" : "hover:bg-amber-50 text-amber-600"
                          )}
                          title="Recall Job (Take back from driver)"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </>
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedJobForDetails(job.id); }}
                      className={classNames(
                        "rounded-md p-1.5 transition-colors",
                        isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"
                      )}
                      title="View Details"
                    >
                      <MoreHorizontal size={12} />
                    </button>

                    <ChevronRight size={14} className={classNames(
                      "transition-transform",
                      isDark ? "text-slate-500" : "text-slate-400",
                      isExpanded && "rotate-90"
                    )} />
                  </div>
                </div>
              </div>

              {/* Expanded Details Panel */}
              {isExpanded && (
                <div className={classNames(
                  "border-t px-3 py-2.5",
                  isDark ? "bg-slate-900/50 border-slate-700/50" : "bg-slate-50 border-slate-100"
                )}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    
                    {/* Customer */}
                    <div className={classNames("rounded-lg p-2", isDark ? "bg-slate-800" : "bg-white border border-slate-100")}>
                      <p className={classNames("text-[10px] uppercase tracking-wide mb-0.5", isDark ? "text-slate-500" : "text-slate-400")}>Customer</p>
                      <p className={classNames("text-xs font-medium flex items-center gap-1", isDark ? "text-slate-200" : "text-slate-700")}>
                        <User size={12} />
                        {job.riderName || job.customer?.firstName || "Guest"}
                      </p>
                    </div>

                    {/* Source */}
                    <div className={classNames("rounded-lg p-2", isDark ? "bg-slate-800" : "bg-white border border-slate-100")}>
                      <p className={classNames("text-[10px] uppercase tracking-wide mb-0.5", isDark ? "text-slate-500" : "text-slate-400")}>Source</p>
                      <p className={classNames("text-xs font-medium", isDark ? "text-slate-200" : "text-slate-700")}>
                        {sourceInfo.icon} {sourceInfo.label}
                      </p>
                    </div>

                    {/* Fare */}
                    <div className={classNames("rounded-lg p-2", isDark ? "bg-emerald-900/30" : "bg-emerald-50 border border-emerald-100")}>
                      <p className={classNames("text-[10px] uppercase tracking-wide mb-0.5", isDark ? "text-emerald-500" : "text-emerald-600")}>Fare</p>
                      <p className={classNames("text-xs font-bold", isDark ? "text-emerald-400" : "text-emerald-700")}>
                        ${resolveFareAmount(job).toFixed(2)}
                      </p>
                    </div>

                    {/* Timer/Status */}
                    <div className={classNames("rounded-lg p-2", isDark ? "bg-slate-800" : "bg-white border border-slate-100")}>
                      <p className={classNames("text-[10px] uppercase tracking-wide mb-0.5", isDark ? "text-slate-500" : "text-slate-400")}>Status</p>
                      {urgency.isLate ? (
                        <p className="text-xs font-bold text-red-500">{urgency.lateMinutes}m Late</p>
                      ) : urgency.minutesUntilScheduled > 0 ? (
                        <p className={classNames("text-xs font-medium", isDark ? "text-blue-400" : "text-blue-600")}>{urgency.minutesUntilScheduled}m until pickup</p>
                      ) : (
                        <p className="text-xs font-medium text-emerald-500">Ready Now</p>
                      )}
                    </div>

                    {/* Driver (if assigned) */}
                    {job.assignedDriver && (
                      <div className={classNames("col-span-2 rounded-lg p-2", isDark ? "bg-purple-900/20" : "bg-purple-50 border border-purple-100")}>
                        <p className={classNames("text-[10px] uppercase tracking-wide mb-0.5", isDark ? "text-purple-400" : "text-purple-600")}>Assigned Driver</p>
                        <p className={classNames("text-xs font-medium", isDark ? "text-purple-300" : "text-purple-700")}>
                          🚕 {job.assignedDriver.firstName} {job.assignedDriver.lastName}
                          {job.assignedDriver.phone && <span className="ml-2 opacity-75">📞 {job.assignedDriver.phone}</span>}
                        </p>
                      </div>
                    )}

                    {/* Notes */}
                    {job.notes && (
                      <div className={classNames("col-span-full rounded-lg p-2", isDark ? "bg-amber-900/20" : "bg-amber-50 border border-amber-100")}>
                        <p className={classNames("text-[10px] uppercase tracking-wide mb-0.5", isDark ? "text-amber-400" : "text-amber-600")}>Notes</p>
                        <p className={classNames("text-xs", isDark ? "text-amber-200" : "text-amber-800")}>{job.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-dashed" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                    {(job.status === "OFFERED" || job.status === "ASSIGNED") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnassignJob(job.id); }}
                        className={classNames(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                          isDark ? "bg-amber-900/30 text-amber-400 hover:bg-amber-900/50" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                        )}
                      >
                        Unassign
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedJobForDetails(job.id); }}
                      className={classNames(
                        "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ml-auto",
                        isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      )}
                    >
                      Full Details →
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Modals */}
      <JobDetailsModal
        job={selectedJobDetails}
        onClose={() => setSelectedJobForDetails(null)}
        onAssignDriver={handleAssignDriver}
        onCancelJob={handleCancelJob}
        onUnassignDriver={handleUnassignJob}
        onEditJob={onEditJob}
      />

      <ConfirmAssignmentModal
        isOpen={showConfirmModal}
        onClose={() => { setShowConfirmModal(false); setPendingAssignment(null); }}
        onConfirm={confirmAssignment}
        driverName={pendingAssignment?.driverName || ""}
        jobReference={pendingAssignment?.jobReference || ""}
      />
    </div>
  );
};

export default JobBoard;
