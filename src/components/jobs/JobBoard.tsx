import classNames from "classnames";
import {
    Accessibility,
    AlertCircle,
    Briefcase,
    Calendar,
    CheckSquare,
    ChevronDown,
    ChevronRight,
    Clock,
    CreditCard,
    Download,
    Eye,
    Filter,
    Grip,
    MapPin,
    MoreHorizontal,
    Pencil,
    Phone,
    Plus,
    RotateCcw,
    Search,
    Send,
    Settings,
    Square,
    Timer,
    User,
    UserCircle,
    Users,
    X
} from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTheme } from "../../contexts/ThemeContext";
import { useDispatchController } from "../../hooks/useDispatchController";
import { useDispatchSocket } from "../../providers/SocketProvider";
import { cancelJob } from "../../services/jobService";
import { JobStatus, useDispatchStore } from "../../store/useDispatchStore";
import { isAssignableJobStatus } from "../../utils/jobStatusHelpers";
import {
    formatOverSec,
    jobSlaOverSec,
    loadSlaThresholds,
    type SlaThresholds,
} from "../../utils/slaThresholds";
import ServiceTypeSelector from "../v2/ServiceTypeSelector";
import SlaSettingsModal from "../settings/SlaSettingsModal";
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

// Jobs that can be edited — not active, finished, cancelled, or noshow
const canEditJob = (status: JobStatus): boolean => {
  return status !== "ACTIVE" && status !== "FINISHED" && status !== "CANCELLED" && status !== "NOSHOW";
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
  const selectedServiceType = useDispatchStore(
    (state) => state.selectedServiceType
  );
  const setSelectedServiceType = useDispatchStore(
    (state) => state.setSelectedServiceType
  );
  const jobCounters = useDispatchStore((state) => state.jobCounters);
  const loading = useDispatchStore((state) => state.loading);
  const drivers = useDispatchStore((state) => state.drivers);
  const assignDriver = useDispatchStore((state) => state.assignDriver);
  const unassignJob = useDispatchStore((state) => state.unassignJob);
  const setHoveredJobId = useDispatchStore((state) => state.setHoveredJobId);
  
  const { fetchJobs, fetchJobCounters } = useDispatchController();
  const { socket, connected: socketConnected } = useDispatchSocket();
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Live job lifecycle listeners. The dispatch-store socket listeners in
  // useDispatchController already pick up many of these, but we want the
  // board to refetch counters + list so grouping and badges stay honest
  // without relying on polling.
  React.useEffect(() => {
    if (!socket) return;
    const handleLifecycle = (payload: any) => {
      console.log("[JobBoard] job lifecycle event", payload);
      fetchJobs();
      fetchJobCounters();
    };
    socket.on("job:assigned", handleLifecycle);
    socket.on("job:status", handleLifecycle);
    socket.on("job:cancelled", handleLifecycle);
    socket.on("job:completed", handleLifecycle);
    return () => {
      socket.off("job:assigned", handleLifecycle);
      socket.off("job:status", handleLifecycle);
      socket.off("job:cancelled", handleLifecycle);
      socket.off("job:completed", handleLifecycle);
    };
  }, [socket, fetchJobs, fetchJobCounters]);

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

  // 1-second tick while any OFFERED job is on the board so the "Offered → X
  // · Ns" countdown actually decreases in real time. Stays idle otherwise so
  // we're not re-rendering the board every second on a quiet shift.
  const hasPendingOffer = React.useMemo(
    () => jobs.some((j: any) => j.status === 'OFFERED' && j.offerExpiresAt),
    [jobs],
  );
  React.useEffect(() => {
    if (!hasPendingOffer) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasPendingOffer]);

  // Fetch jobs when service type changes
  React.useEffect(() => {
    fetchJobs();
  }, [selectedServiceType, fetchJobs]);

  // Bulletproof initial load. The first fetch on mount races auth hydration
  // and socket handshake; under live latency we sometimes get a stale/empty
  // result and the dispatcher has to switch tabs to see their jobs. Retry
  // once on socket connect, and one more time if the list is still empty a
  // second later. Cheap and idempotent.
  const hasInitialLoaded = useRef(false);
  React.useEffect(() => {
    if (!socketConnected) return;
    fetchJobs();
    fetchJobCounters();
  }, [socketConnected, fetchJobs, fetchJobCounters]);
  React.useEffect(() => {
    if (hasInitialLoaded.current) return;
    if (jobs.length > 0) {
      hasInitialLoaded.current = true;
      return;
    }
    const t = setTimeout(() => {
      if (!hasInitialLoaded.current) {
        fetchJobs();
        fetchJobCounters();
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [jobs.length, fetchJobs, fetchJobCounters]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      for (const job of jobs) {
        if (job.status !== 'UNASSIGNED' && job.status !== 'PENDING') continue;
        const urgency = getJobUrgency(job);
        if (urgency.isNow && urgency.isLate && !alertedRef.current.has(job.id + '_now_late')) {
          alertedRef.current.add(job.id + '_now_late');
          playLateJobSound();
          toast.error(
            (t) => (
              <div className="flex flex-col gap-2" style={{ minWidth: '260px' }}>
                <span className="text-sm font-medium">🚨 NOW Job {job.reference} is LATE! ({urgency.lateMinutes}m overdue)</span>
                <div className="flex gap-2">
                  <button
                    className="flex-1 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    onClick={() => {
                      toast.dismiss(t.id);
                      cancelJob(job.id, 'Late job cancelled from alert').then(() => {
                        toast.success(`Job ${job.reference} cancelled`);
                        fetchJobs();
                        fetchJobCounters();
                      }).catch(() => toast.error('Failed to cancel job'));
                    }}
                  >Cancel Job</button>
                  <button
                    className="flex-1 px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors border border-gray-300"
                    onClick={() => toast.dismiss(t.id)}
                  >Dismiss</button>
                </div>
              </div>
            ),
            { duration: 30000 }
          );
        }
        if (!urgency.isNow && urgency.urgencyLevel === 'WARNING' && !alertedRef.current.has(job.id + '_warning')) {
          alertedRef.current.add(job.id + '_warning');
          toast.error(`⚠️ Scheduled Job ${job.reference} is due in ${urgency.minutesUntilScheduled} minutes!`, { duration: 6000 });
        }
        if (!urgency.isNow && urgency.isLate && !alertedRef.current.has(job.id + '_sched_late')) {
          alertedRef.current.add(job.id + '_sched_late');
          playLateJobSound();
          toast.error(
            (t) => (
              <div className="flex flex-col gap-2" style={{ minWidth: '260px' }}>
                <span className="text-sm font-medium">🚨 Scheduled Job {job.reference} is now LATE! ({urgency.lateMinutes}m past scheduled time)</span>
                <div className="flex gap-2">
                  <button
                    className="flex-1 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    onClick={() => {
                      toast.dismiss(t.id);
                      cancelJob(job.id, 'Late scheduled job cancelled from alert').then(() => {
                        toast.success(`Job ${job.reference} cancelled`);
                        fetchJobs();
                        fetchJobCounters();
                      }).catch(() => toast.error('Failed to cancel job'));
                    }}
                  >Cancel Job</button>
                  <button
                    className="flex-1 px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors border border-gray-300"
                    onClick={() => toast.dismiss(t.id)}
                  >Dismiss</button>
                </div>
              </div>
            ),
            { duration: 30000 }
          );
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs, fetchJobCounters]);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<{ jobId: string; driverId: string; driverName: string; jobReference: string } | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Wave 2D — SLA + bulk ops
  const [slaThresholds, setSlaThresholds] = useState<SlaThresholds>(() => loadSlaThresholds());
  const [slaOnlyFilter, setSlaOnlyFilter] = useState(false);
  const [showSlaSettings, setShowSlaSettings] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{
    action: string;
    done: number;
    total: number;
    fails: string[];
  } | null>(null);
  const [showBulkReassign, setShowBulkReassign] = useState(false);
  const [bulkReassignDriverId, setBulkReassignDriverId] = useState("");
  const [showBulkCancelConfirm, setShowBulkCancelConfirm] = useState(false);

  const toggleJobSelection = useCallback((jobId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  const clearJobSelection = useCallback(() => setSelectedJobIds(new Set()), []);

  // Helper function to check if a date is today
  const isToday = (date: string | Date): boolean => {
    const today = new Date();
    const checkDate = new Date(date);
    return (
      checkDate.getDate() === today.getDate() &&
      checkDate.getMonth() === today.getMonth() &&
      checkDate.getFullYear() === today.getFullYear()
    );
  };

  // 🎯 Group job statuses so jobs never fall between tabs. A job in ON_THE_WAY / ARRIVED /
  // STARTED / REACHED / IN_PROGRESS is actively being worked by a driver — it belongs in
  // the ACTIVE tab alongside ACTIVE jobs. FINISHED/COMPLETED and NOSHOW/NO_SHOW are kept
  // interchangeable so historic jobs in either spelling still show up. Nothing is removed
  // from business logic — we're only widening the filter sets.
  const ACTIVE_TAB_STATUSES = ['ACTIVE', 'ON_THE_WAY', 'ARRIVED', 'STARTED', 'REACHED', 'IN_PROGRESS', 'ACCEPTED'];
  const FINISHED_TAB_STATUSES = ['FINISHED', 'COMPLETED'];
  const NOSHOW_TAB_STATUSES = ['NOSHOW', 'NO_SHOW'];

  const filteredJobs = useMemo(() => {
    let result = jobs;

    // Status-specific filtering with date restrictions
    if (selectedStatus === "UNASSIGNED") {
      result = result.filter((job) => job.status === "UNASSIGNED" || job.status === "PENDING" || job.status === "REJECTED" || job.status === "RECALLED");
    } else if (selectedStatus === "FINISHED" || selectedStatus === "CANCELLED" || selectedStatus === "NOSHOW") {
      // For completed, cancelled, and no-show: filter by status first (accept both spellings)
      if (selectedStatus === "FINISHED") {
        result = result.filter((job) => FINISHED_TAB_STATUSES.includes(job.status));
      } else if (selectedStatus === "NOSHOW") {
        result = result.filter((job) => NOSHOW_TAB_STATUSES.includes(job.status));
      } else {
        result = result.filter((job) => job.status === selectedStatus);
      }

      // Apply date filtering for these statuses
      if (dateFilter === "today") {
        result = result.filter((job) => isToday(job.requestedAt));
      } else if (dateFilter === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        result = result.filter((job) => new Date(job.requestedAt) >= weekAgo);
      } else if (dateFilter === "all") {
        // Default behavior: show only today's jobs for these statuses
        result = result.filter((job) => isToday(job.requestedAt));
      }
    } else if (selectedStatus === "ACTIVE") {
      // ACTIVE tab shows all in-transit states so a job never disappears between ASSIGNED and FINISHED
      result = result.filter((job) => ACTIVE_TAB_STATUSES.includes(job.status));
    } else {
      // For other statuses (OFFERED, ASSIGNED): show all regardless of date
      result = result.filter((job) => job.status === selectedStatus);
    }

    // Apply service type filter
    if (selectedServiceType) {
      result = result.filter((job: any) => {
        // Treat jobs without serviceType as TAXI (default)
        const jobServiceType = job.serviceType || "TAXI";
        return jobServiceType === selectedServiceType;
      });
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

    // Apply general date filter only for statuses that aren't FINISHED, CANCELLED, or NOSHOW
    if (selectedStatus !== "FINISHED" && selectedStatus !== "CANCELLED" && selectedStatus !== "NOSHOW") {
      if (dateFilter === "today") {
        result = result.filter((job) => isToday(job.requestedAt));
      } else if (dateFilter === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        result = result.filter((job) => new Date(job.requestedAt) >= weekAgo);
      }
    }

    if (driverFilter !== "all") {
      result = result.filter((job) => job.driverId === driverFilter);
    }
    // SLA escalation filter — only jobs exceeding their status threshold
    if (slaOnlyFilter) {
      result = result.filter((job) => jobSlaOverSec(job, slaThresholds) > 0);
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
  }, [jobs, selectedStatus, selectedServiceType, searchQuery, dateFilter, driverFilter, slaOnlyFilter, slaThresholds]);

  // Count of SLA-escalated jobs across the whole board (after service-type filter)
  const slaEscalatedCount = useMemo(() => {
    let list = jobs;
    if (selectedServiceType) {
      list = list.filter((j: any) => (j.serviceType || "TAXI") === selectedServiceType);
    }
    return list.filter((j) => jobSlaOverSec(j, slaThresholds) > 0).length;
  }, [jobs, selectedServiceType, slaThresholds]);

  // UNASSIGNED tab shows UNASSIGNED + PENDING + REJECTED + RECALLED jobs (matches filter logic)
  // Calculate proper counters with date filtering for specific statuses
  const statusCounts = useMemo(() => {
    // Filter jobs by service type first if selected
    let filteredForCount = jobs;
    if (selectedServiceType) {
      filteredForCount = jobs.filter((job: any) => {
        const jobServiceType = job.serviceType || "TAXI";
        return jobServiceType === selectedServiceType;
      });
    }
    
    // Filter today's jobs for FINISHED, CANCELLED, and NOSHOW
    const todayJobs = filteredForCount.filter(job => isToday(job.requestedAt));
    
    // Calculate counts from filtered jobs
    const unassignedCount = filteredForCount.filter(job => 
      job.status === 'UNASSIGNED' || job.status === 'PENDING' || 
      job.status === 'REJECTED' || job.status === 'RECALLED'
    ).length;
    
    const offeredCount = filteredForCount.filter(job => job.status === 'OFFERED').length;
    const assignedCount = filteredForCount.filter(job => job.status === 'ASSIGNED').length;
    // ACTIVE count covers every in-transit state so the badge matches what the tab shows
    const activeCount = filteredForCount.filter(job => ACTIVE_TAB_STATUSES.includes(job.status)).length;

    return {
      PENDING: 0,
      UNASSIGNED: unassignedCount,
      OFFERED: offeredCount,
      ASSIGNED: assignedCount,
      REJECTED: 0, // Included in UNASSIGNED count
      NOSHOW: todayJobs.filter(job => NOSHOW_TAB_STATUSES.includes(job.status)).length,
      RECALLED: 0, // Included in UNASSIGNED count
      ACTIVE: activeCount,
      FINISHED: todayJobs.filter(job => FINISHED_TAB_STATUSES.includes(job.status)).length,
      CANCELLED: todayJobs.filter(job => job.status === 'CANCELLED').length,
    };
  }, [jobCounters, jobs, selectedServiceType]);

  const selectedJobDetails = useMemo(() => {
    if (!selectedJobForDetails) return null;
    return jobs.find((job) => job.id === selectedJobForDetails) || null;
  }, [selectedJobForDetails, jobs]);

  const availableDrivers = useMemo(() => drivers.filter((d) => d.status === "AVAILABLE"), [drivers]);

  const handleAssignDriver = async (jobId: string, driverId: string) => {
    const driver = drivers.find((d) => d.id === driverId);
    const job = jobs.find((j) => j.id === jobId);
    // Verbose console trace + visible toast so the dispatcher can SEE
    // where the chain breaks when "click Test Driver1 in dropdown does
    // nothing" happens. Each branch logs a distinct message.
    console.log('[assign-trace] click', { jobId, driverId, driverFound: !!driver, jobFound: !!job, driverName: driver?.name });
    if (!driver) {
      console.warn('[assign-trace] driver missing from store', { driverId, knownIds: drivers.map(d => d.id) });
      toast.error(`Driver ${String(driverId).slice(-6)} not found in current driver list — try refreshing`);
      return;
    }
    if (!job) {
      console.warn('[assign-trace] job missing from store', { jobId, knownIds: jobs.map(j => j.id).slice(0, 5) });
      toast.error(`Job not found in store — try refreshing the page`);
      return;
    }
    if (!driver.name) {
      console.warn('[assign-trace] driver has no name field, falling back to id slice', driver);
    }
    const driverName = driver.name || `Driver ${String(driverId).slice(-6)}`;
    console.log('[assign-trace] opening confirm modal', { jobId, driverId, driverName, jobReference: job.reference });
    setPendingAssignment({ jobId, driverId, driverName, jobReference: job.reference });
    setShowConfirmModal(true);
  };

  const confirmAssignment = async () => {
    if (!pendingAssignment) {
      console.warn('[assign-trace] confirmAssignment fired without pendingAssignment');
      return;
    }
    const { jobId, driverId, driverName } = pendingAssignment;
    console.log('[assign-trace] confirmAssignment -> POST /api/dispatch/jobs/:id/assign', { jobId, driverId });
    try {
      await assignDriver(jobId, driverId);
      console.log('[assign-trace] assign API returned success', { jobId, driverId });
      toast.success(`Job offered to ${driverName}`);
      setPendingAssignment(null);
      // Refresh once so the JobBoard reflects the OFFERED state without
      // waiting for the next socket roundtrip — useful when sockets are
      // briefly disconnected.
      try { await fetchJobs(); } catch { /* non-fatal */ }
    } catch (error: any) {
      // Surface the real backend reason so dispatchers don't see a
      // generic "nothing happened" — the readiness check was previously
      // failing silently with 409s the user couldn't read.
      const reason =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to assign driver";
      console.error("[JobBoard] Manual assign failed:", error?.response?.data || error);
      toast.error(reason);
    }
  };

  const handleCancelJob = async (
    jobId: string,
    reason?: string,
    refundAction?: 'STRIPE_REFUND' | 'WALLET_CREDIT' | 'MANUAL_REFUND',
    manualRefundAcknowledged?: boolean
  ) => {
    try {
      await cancelJob(jobId, {
        reason: reason || "Cancelled by dispatcher",
        refundAction,
        manualRefundAcknowledged,
      });
      const refundMsg = refundAction === 'STRIPE_REFUND' 
        ? ' — Stripe refund initiated'
        : refundAction === 'WALLET_CREDIT'
        ? ' — credited to customer wallet'
        : refundAction === 'MANUAL_REFUND'
        ? ' — manual refund acknowledged'
        : '';
      toast.success(`Job cancelled successfully${refundMsg}`);
      await Promise.all([fetchJobs(), fetchJobCounters()]);
    } catch (error: any) {
      console.error("Failed to cancel job:", error);
      if (error?.code === 'PAID_JOB_REQUIRES_REFUND') {
        toast.error("This job is paid — please select a refund option");
      } else {
        toast.error("Failed to cancel job");
      }
      throw error; // Re-throw so modal knows it failed
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

  // ── Wave 2D — bulk ops helpers ──────────────────────────────────────────────
  const selectAllVisible = () => {
    const next = new Set<string>();
    filteredJobs.forEach((j) => next.add(j.id));
    setSelectedJobIds(next);
  };

  const runBulkAction = async (
    action: string,
    jobIds: string[],
    operation: (id: string) => Promise<void>
  ) => {
    if (jobIds.length === 0) return;
    setBulkProgress({ action, done: 0, total: jobIds.length, fails: [] });
    const fails: string[] = [];
    // Run sequentially so we don't overload the single-job endpoints.
    for (let i = 0; i < jobIds.length; i++) {
      const id = jobIds[i];
      try {
        await operation(id);
      } catch (err: any) {
        const ref = jobs.find((j) => j.id === id)?.reference || id.slice(0, 6);
        console.error(`[bulk:${action}] failed for ${ref}`, err);
        fails.push(ref);
      }
      setBulkProgress((prev) =>
        prev ? { ...prev, done: i + 1, fails: [...fails] } : prev
      );
    }
    const succeeded = jobIds.length - fails.length;
    if (fails.length === 0) {
      toast.success(`${action}: all ${succeeded} jobs processed`);
    } else {
      toast.error(
        `${action}: ${succeeded}/${jobIds.length} succeeded. Failed: ${fails.slice(0, 3).join(", ")}${
          fails.length > 3 ? "…" : ""
        }`,
        { duration: 8000 }
      );
    }
    clearJobSelection();
    await Promise.all([fetchJobs(), fetchJobCounters()]);
    // Keep the progress visible for a beat so users can read it
    setTimeout(() => setBulkProgress(null), 2500);
  };

  const handleBulkCancel = async () => {
    setShowBulkCancelConfirm(false);
    await runBulkAction("Cancel", Array.from(selectedJobIds), async (id) => {
      await cancelJob(id, "Bulk cancellation by dispatcher");
    });
  };

  const handleBulkReassign = async () => {
    if (!bulkReassignDriverId) {
      toast.error("Pick a driver first");
      return;
    }
    const driverId = bulkReassignDriverId;
    setShowBulkReassign(false);
    setBulkReassignDriverId("");
    await runBulkAction("Reassign", Array.from(selectedJobIds), async (id) => {
      await assignDriver(id, driverId);
    });
  };

  const handleBulkExportCsv = () => {
    const target = jobs.filter((j) => selectedJobIds.has(j.id));
    if (target.length === 0) {
      toast.error("No jobs selected");
      return;
    }
    const headers = [
      "reference",
      "status",
      "requestedAt",
      "scheduledAt",
      "pickup",
      "dropoff",
      "rider",
      "phone",
      "driver",
      "fare",
      "paymentStatus",
    ];
    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const lines = [headers.join(",")];
    for (const j of target) {
      lines.push(
        [
          j.reference,
          j.status,
          j.requestedAt,
          j.scheduledAt,
          getAddressString(j.pickupAddress),
          getAddressString(j.dropoffAddress),
          j.riderName || j.customer?.firstName,
          j.riderPhone || j.customer?.phone,
          j.assignedDriver
            ? `${j.assignedDriver.firstName || ""} ${j.assignedDriver.lastName || ""}`.trim()
            : j.driverId,
          resolveFareAmount(j).toFixed(2),
          j.paymentStatus,
        ]
          .map(esc)
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jobs-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`Exported ${target.length} job(s) to CSV`);
  };

  return (
    <div className={classNames("flex h-full flex-col overflow-hidden", isDark ? "bg-slate-900" : "bg-white")}>
      
      {/* ═══════════════════════════════════════════════════════════════════════════
          HEADER: Compact Toolbar
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className={classNames(
        "flex items-center justify-between px-2 py-1 border-b gap-2",
        isDark ? "bg-slate-800/80 border-slate-700/50" : "bg-white border-slate-200"
      )}>
        {/* Left: Create Button + Stats */}
        <div className="flex items-center gap-2">
          <button
            onClick={onCreateJobClick}
            className={classNames(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-all duration-150",
              "bg-blue-600 text-white",
              "hover:bg-blue-500",
              "active:scale-[0.98]"
            )}
          >
            <Plus size={12} strokeWidth={2.5} />
            <span>Create Job</span>
          </button>
          {/* Quick Stats */}
          <div className="hidden md:flex items-center gap-1">
            <span className={classNames(
              "text-[10px] font-medium tabular-nums",
              isDark ? "text-slate-400" : "text-slate-500"
            )}>
              {filteredJobs.length} total
            </span>
            {statusCounts.UNASSIGNED > 0 && (
              <span className={classNames(
                "text-[10px] font-semibold tabular-nums",
                isDark ? "text-rose-400" : "text-rose-500"
              )}>
                · {statusCounts.UNASSIGNED} pending
              </span>
            )}
          </div>
        </div>

        {/* Right: Service Type + Search + Filters */}
        <div className="flex items-center gap-1.5">
          {/* Service type switcher */}
          <div className="hidden md:block">
            <ServiceTypeSelector
              value={selectedServiceType || null}
              onChange={(value) => {
                setSelectedServiceType((value as any) ?? null);
              }}
              allowedTypes={["TAXI", "DELIVERY", "COURIER"]}
              showAll
              variant="tabs"
            />
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={11} className={classNames(
              "absolute left-2 top-1/2 -translate-y-1/2",
              isDark ? "text-slate-500" : "text-slate-400"
            )} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Job #, address..."
              className={classNames(
                "w-28 md:w-36 rounded-md border py-1 pl-6 pr-6 text-[11px] outline-none transition-all duration-200",
                isDark
                  ? "border-slate-700 bg-slate-800 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                  : "border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              )}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={11} />
              </button>
            )}
          </div>

          {/* SLA-only toggle */}
          <button
            onClick={() => setSlaOnlyFilter((v) => !v)}
            className={classNames(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all duration-200",
              slaOnlyFilter
                ? "border-red-500 bg-red-500/10 text-red-500"
                : isDark
                  ? "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-700"
            )}
            title="Show only SLA-escalated jobs"
          >
            <Timer size={11} />
            <span className="hidden md:inline">Escalated</span>
            {slaEscalatedCount > 0 && (
              <span
                className={classNames(
                  "ml-0.5 rounded-full px-1 text-[9px] font-bold",
                  slaOnlyFilter ? "bg-red-500 text-white" : "bg-red-500/80 text-white"
                )}
              >
                {slaEscalatedCount}
              </span>
            )}
          </button>

          {/* SLA settings */}
          <button
            onClick={() => setShowSlaSettings(true)}
            className={classNames(
              "rounded-md border px-1.5 py-1 text-[11px] transition-all",
              isDark
                ? "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-700"
            )}
            title="Configure SLA thresholds"
          >
            <Settings size={11} />
          </button>

          {/* Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={classNames(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all duration-200",
              showFilters
                ? "border-blue-500 bg-blue-500/10 text-blue-500"
                : isDark
                  ? "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-700"
            )}
          >
            <Filter size={11} />
            <ChevronDown size={10} className={classNames("transition-transform", showFilters && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* Bulk actions bar — shown when selections exist */}
      {selectedJobIds.size > 0 && (
        <div
          className={classNames(
            "flex items-center justify-between gap-2 border-b px-2 py-1.5",
            isDark ? "bg-blue-900/20 border-blue-800" : "bg-blue-50 border-blue-200"
          )}
        >
          <div className="flex items-center gap-2">
            <CheckSquare size={14} className={isDark ? "text-blue-300" : "text-blue-700"} />
            <span className={classNames(
              "text-xs font-semibold",
              isDark ? "text-blue-200" : "text-blue-800"
            )}>
              {selectedJobIds.size} selected
            </span>
            <button
              onClick={selectAllVisible}
              className={classNames(
                "text-[10px] underline",
                isDark ? "text-blue-300" : "text-blue-700"
              )}
            >
              Select all visible ({filteredJobs.length})
            </button>
            <button
              onClick={clearJobSelection}
              className={classNames(
                "text-[10px] underline",
                isDark ? "text-slate-400" : "text-slate-500"
              )}
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowBulkCancelConfirm(true)}
              disabled={!!bulkProgress}
              className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Cancel selected
            </button>
            <button
              onClick={() => setShowBulkReassign(true)}
              disabled={!!bulkProgress}
              className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Reassign…
            </button>
            <button
              onClick={handleBulkExportCsv}
              disabled={!!bulkProgress}
              className={classNames(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-50",
                isDark ? "bg-slate-700 text-slate-200 hover:bg-slate-600" : "bg-slate-200 text-slate-800 hover:bg-slate-300"
              )}
            >
              <Download size={11} />
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Bulk progress bar */}
      {bulkProgress && (
        <div
          className={classNames(
            "flex items-center gap-2 border-b px-2 py-1.5 text-xs",
            isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"
          )}
        >
          <span className={isDark ? "text-slate-200" : "text-slate-700"}>
            {bulkProgress.action}: {bulkProgress.done}/{bulkProgress.total}
          </span>
          <div className={classNames(
            "flex-1 h-1.5 rounded-full overflow-hidden",
            isDark ? "bg-slate-700" : "bg-slate-200"
          )}>
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
            />
          </div>
          {bulkProgress.fails.length > 0 && (
            <span className="text-red-500 font-semibold">{bulkProgress.fails.length} failed</span>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          FILTERS PANEL (Collapsible)
          ═══════════════════════════════════════════════════════════════════════════ */}
      {showFilters && (
        <div className={classNames(
          "flex flex-col gap-2 px-3 py-2 border-b",
          isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-slate-50/80 border-slate-100"
        )}>
          <div className="flex items-center gap-4 flex-wrap">
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
                <option value="all">
                  {(selectedStatus === "FINISHED" || selectedStatus === "CANCELLED" || selectedStatus === "NOSHOW") 
                    ? "Today Only (Default)" 
                    : "All Time"}
                </option>
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
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.vehicle && d.vehicle !== 'N/A' ? ` - ${d.vehicle}` : ''}</option>)}
              </select>
            </div>
            <button
              onClick={() => { setDateFilter("all"); setDriverFilter("all"); setSearchQuery(""); }}
              className={classNames("text-xs underline ml-auto", isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-500 hover:text-slate-700")}
            >
              Clear All
            </button>
          </div>
          
          {/* Info message for date-restricted statuses */}
          {(selectedStatus === "FINISHED" || selectedStatus === "CANCELLED" || selectedStatus === "NOSHOW") && dateFilter === "all" && (
            <div className={classNames(
              "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs",
              isDark ? "bg-blue-900/20 text-blue-300" : "bg-blue-50 text-blue-700"
            )}>
              <AlertCircle size={12} />
              <span>Showing today's {selectedStatus.toLowerCase()} jobs only. Use date filter to view historical data.</span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          STATUS TABS: Clean Horizontal Navigation
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className={classNames(
        "flex items-center gap-0.5 px-1.5 py-1 overflow-x-auto scrollbar-hide border-b",
        isDark ? "bg-slate-800/40 border-slate-700/30" : "bg-slate-50/80 border-slate-100"
      )}>
        {statusTabs.map((tab) => {
          const isActive = selectedStatus === tab.value;
          const count = statusCounts[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              onClick={() => setSelectedStatus(tab.value)}
              className={classNames(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all duration-150 whitespace-nowrap",
                isActive
                  ? isDark
                    ? "bg-slate-700 text-white shadow-sm"
                    : "bg-white text-slate-800 shadow-sm border border-slate-200"
                  : isDark
                    ? "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                    : "text-slate-500 hover:bg-white/60 hover:text-slate-700"
              )}
            >
              <span>{tab.label}</span>
              <span className={classNames(
                "inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full text-[9px] font-semibold tabular-nums",
                isActive
                  ? count > 0 ? "bg-blue-500 text-white" : "bg-slate-500 text-white"
                  : count > 0
                    ? isDark ? "bg-slate-600 text-slate-300" : "bg-slate-200 text-slate-600"
                    : isDark ? "bg-slate-700 text-slate-500" : "bg-slate-100 text-slate-400"
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
      <div className={classNames("flex-1 overflow-y-auto px-1.5 py-1 space-y-1", isDark ? "bg-slate-900" : "bg-slate-50/50")}>
        
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

        {(() => {
          const nowJobs = filteredJobs.filter(j => isNowJob(j));
          const scheduledJobs = filteredJobs.filter(j => !isNowJob(j));
          const sections: Array<{ type: 'job'; job: any } | { type: 'divider' }> = [];
          nowJobs.forEach(j => sections.push({ type: 'job', job: j }));
          if (nowJobs.length > 0 && scheduledJobs.length > 0) sections.push({ type: 'divider' });
          scheduledJobs.forEach(j => sections.push({ type: 'job', job: j }));
          // If only scheduled jobs exist, add divider at top
          if (nowJobs.length === 0 && scheduledJobs.length > 0) sections.unshift({ type: 'divider' });
          return sections.map((section, sIdx) => {
            if (section.type === 'divider') {
              return (
                <div key={`sched-divider-${sIdx}`} className="flex items-center gap-2 py-1.5 px-1">
                  <div className={classNames("flex-1 h-px", isDark ? "bg-amber-500/30" : "bg-amber-300")} />
                  <span className={classNames("flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider", isDark ? "text-amber-400" : "text-amber-600")}>
                    <Calendar size={10} />
                    Scheduled Jobs
                  </span>
                  <div className={classNames("flex-1 h-px", isDark ? "bg-amber-500/30" : "bg-amber-300")} />
                </div>
              );
            }
            const job = section.job;
          const urgency = getJobUrgency(job);
          const statusInfo = statusConfig[job.status] || statusConfig.UNASSIGNED;
          const sourceInfo = getSourceInfo(job);
          const isExpanded = expandedJobId === job.id;
          const isSelected = selectedJobId === job.id;
          const isScheduled = !isNowJob(job);
          const slaOverSec = jobSlaOverSec(job, slaThresholds);
          const isBulkSelected = selectedJobIds.has(job.id);

          return (
            <article
              key={job.id}
              onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
              // Note: hovering the card no longer auto-draws the job's route
              // on the map — dispatchers found it too noisy when scrolling
              // through the list. The Eye icon in the action row is the
              // explicit opt-in; hovering it previews the path, leaving it
              // clears the preview.
              className={classNames(
                "group relative rounded-lg border transition-all duration-200 cursor-pointer overflow-hidden",
                isDark
                  ? "bg-slate-800/80 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600"
                  : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-sm",
                isSelected && (isDark ? "ring-2 ring-blue-500/50 border-blue-500/50" : "ring-2 ring-blue-500/30 border-blue-400"),
                // Wheelchair job: distinctive purple left border
                (job.wheelchairs > 0 || job.requirements?.wheelchairs > 0) && (isDark ? "border-l-[3px] border-l-purple-500" : "border-l-[3px] border-l-purple-500"),
                // Card-paid job: red left border (if not wheelchair)
                !(job.wheelchairs > 0 || job.requirements?.wheelchairs > 0) && job.paymentStatus === 'PAID' && (isDark ? "border-l-[3px] border-l-red-500" : "border-l-[3px] border-l-red-500"),
                // Late/warning borders (only if not wheelchair or paid - avoid conflict)
                !(job.wheelchairs > 0 || job.requirements?.wheelchairs > 0) && job.paymentStatus !== 'PAID' && job.status !== 'UNASSIGNED' && job.status !== 'PENDING' && urgency.isLate && (isDark ? "border-l-2 border-l-red-500" : "border-l-2 border-l-red-500"),
                !(job.wheelchairs > 0 || job.requirements?.wheelchairs > 0) && job.paymentStatus !== 'PAID' && job.status !== 'UNASSIGNED' && job.status !== 'PENDING' && urgency.urgencyLevel === 'WARNING' && !urgency.isLate && (isDark ? "border-l-2 border-l-amber-500" : "border-l-2 border-l-amber-500")
              )}
            >
              {/* Main Job Card Content */}
              <div className="px-2 py-1.5">
                
                {/* Row 1: Reference, Time, Status, Urgency */}
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Bulk select checkbox */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleJobSelection(job.id); }}
                      className={classNames(
                        "flex-shrink-0 rounded p-0.5 transition-colors",
                        isBulkSelected
                          ? isDark ? "text-blue-400 bg-blue-900/40" : "text-blue-600 bg-blue-100"
                          : isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"
                      )}
                      title={isBulkSelected ? "Deselect" : "Select"}
                    >
                      {isBulkSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>

                    {/* SLA red clock */}
                    {slaOverSec > 0 && (
                      <span
                        className="flex items-center flex-shrink-0 text-red-500 animate-pulse"
                        title={`SLA: ${formatOverSec(slaOverSec)}`}
                      >
                        <Timer size={13} />
                      </span>
                    )}

                    {/* Job Reference Badge */}
                    <button
                      onClick={(e) => { e.stopPropagation(); selectJob(job.id); }}
                      className={classNames(
                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide transition-all flex-shrink-0",
                        "bg-slate-900 text-amber-400 hover:bg-slate-800",
                        isDark && "bg-slate-950"
                      )}
                    >
                      <span className="text-[10px]">🚖</span>
                      {(job.reference || job.id || 'N/A').slice(-6).toUpperCase()}
                    </button>

                    {/* Time */}
                    <span className={classNames(
                      "flex items-center gap-1 text-[11px] font-medium flex-shrink-0",
                      isDark ? "text-slate-400" : "text-slate-500"
                    )}>
                      <Clock size={10} />
                      {job.scheduledAt ? formatTime(job.scheduledAt) : formatTime(job.requestedAt)}
                    </span>

                    {/* Date if scheduled */}
                    {job.scheduledAt && (
                      <span className={classNames(
                        "text-[10px] hidden lg:inline",
                        isDark ? "text-slate-500" : "text-slate-400"
                      )}>
                        {formatDate(job.scheduledAt)}
                      </span>
                    )}

                    {/* LATER badge for scheduled jobs */}
                    {isScheduled && (
                      <span className={classNames(
                        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0",
                        isDark ? "bg-amber-600 text-white" : "bg-amber-500 text-white"
                      )}>
                        <Calendar size={8} />
                        Later
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Urgency Badge - Only show for jobs waiting for dispatch (UNASSIGNED, PENDING, REJECTED, RECALLED) */}
                    {(job.status === 'UNASSIGNED' || job.status === 'PENDING' || job.status === 'REJECTED' || job.status === 'RECALLED') && urgency.isLate && (
                      <span className="flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse">
                        <AlertCircle size={10} />
                        {urgency.lateMinutes}m late
                      </span>
                    )}
                    {(job.status === 'UNASSIGNED' || job.status === 'PENDING' || job.status === 'REJECTED' || job.status === 'RECALLED') && urgency.urgencyLevel === 'WARNING' && !urgency.isLate && (
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

                    {/* Dispatch-Mode Badge — shows the dispatcher's broadcast intent
                        chosen at create time: AUTO (system picks driver), ASSIGNED
                        (specific driver), or NONE (held in queue, no driver notified). */}
                    {(() => {
                      const rawMode = String(job.requirements?.broadcastMode || '').toLowerCase();
                      const hasAssignedDriver = !!(job.assignedDriverId || job.driverId || job.assignedDriver);
                      let mode: 'AUTO' | 'ASSIGNED' | 'NONE';
                      if (rawMode === 'none' || rawMode === 'unassigned') mode = 'NONE';
                      else if (rawMode === 'manual' || hasAssignedDriver) mode = 'ASSIGNED';
                      else mode = 'AUTO';
                      const modeStyle =
                        mode === 'AUTO'
                          ? (isDark ? 'bg-blue-900/50 text-blue-200 border border-blue-700' : 'bg-blue-50 text-blue-700 border border-blue-300')
                          : mode === 'ASSIGNED'
                          ? (isDark ? 'bg-emerald-900/50 text-emerald-200 border border-emerald-700' : 'bg-emerald-50 text-emerald-700 border border-emerald-300')
                          : (isDark ? 'bg-orange-900/50 text-orange-200 border border-orange-700' : 'bg-orange-50 text-orange-700 border border-orange-300');
                      return (
                        <span
                          className={classNames(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                            modeStyle
                          )}
                          title={
                            mode === 'AUTO'
                              ? 'Auto: system picks the driver'
                              : mode === 'ASSIGNED'
                              ? 'Assigned: dispatcher picked a specific driver'
                              : 'None: held in queue, no driver notified'
                          }
                        >
                          {mode}
                        </span>
                      );
                    })()}

                    {/* Driver-name pill — visible right next to the status so the
                        dispatcher can tell at a glance who is on the job (or who
                        rejected it). For ASSIGNED/OFFERED jobs we show the active
                        driver from job.assignedDriver. For REJECTED jobs we fall
                        back to the most recent assignment row to surface "rejected
                        by X" — server clears assignedDriverId on reject, but the
                        assignments[] history is preserved. */}
                    {(() => {
                      const active = job.assignedDriver as any;
                      let label: string | null = null;
                      let isRejection = false;
                      if (active && (active.firstName || active.lastName)) {
                        label = `${active.firstName || ''} ${active.lastName || ''}`.trim();
                      } else if (job.status === 'REJECTED') {
                        const assignments: any[] = (job as any).assignments || [];
                        const lastRejected = assignments.find(
                          (a) => String(a?.status || '').toUpperCase() === 'REJECTED'
                        );
                        const rejectedDriver = lastRejected?.driver || lastRejected?.users;
                        if (rejectedDriver?.firstName || rejectedDriver?.lastName) {
                          label = `${rejectedDriver.firstName || ''} ${rejectedDriver.lastName || ''}`.trim();
                          isRejection = true;
                        }
                      }
                      if (!label) return null;
                      return (
                        <span
                          className={classNames(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold max-w-[140px] truncate',
                            isRejection
                              ? (isDark ? 'bg-rose-900/50 text-rose-200 border border-rose-700' : 'bg-rose-50 text-rose-700 border border-rose-300')
                              : (isDark ? 'bg-indigo-900/50 text-indigo-200 border border-indigo-700' : 'bg-indigo-50 text-indigo-700 border border-indigo-300')
                          )}
                          title={isRejection ? `Rejected by ${label}` : `Driver: ${label}`}
                        >
                          {isRejection ? '✕' : '🚕'} {label}
                        </span>
                      );
                    })()}

                    {/* 🎯 Service Type Badge (TAXI / DELIVERY / COURIER) — only show non-TAXI so card stays clean */}
                    {job.serviceType && job.serviceType !== 'TAXI' && (
                      <span className={classNames(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border",
                        job.serviceType === 'DELIVERY' && (isDark ? "bg-amber-900 text-amber-100 border-amber-700" : "bg-amber-100 text-amber-800 border-amber-300"),
                        job.serviceType === 'COURIER'  && (isDark ? "bg-cyan-900 text-cyan-100 border-cyan-700" : "bg-cyan-100 text-cyan-800 border-cyan-300")
                      )}>
                        {job.serviceType}
                      </span>
                    )}

                    {/* Parcel summary chips — quick visual cue on the card so
                        the dispatcher can see weight / fragile flags without
                        opening details. Reads from either ride.* or job-level
                        details to cope with both v1/v2 payload shapes. */}
                    {job.serviceType && job.serviceType !== 'TAXI' && (() => {
                      const meta = (job as any).ride?.courierDetails
                        || (job as any).ride?.foodDeliveryDetails
                        || (job as any).courierDetails
                        || (job as any).deliveryDetails
                        || null;
                      if (!meta) return null;
                      const weight = meta.totalWeightKg ?? meta.weightKg ?? null;
                      return (
                        <>
                          {weight != null && Number(weight) > 0 && (
                            <span className={classNames(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                              isDark ? "bg-slate-800 text-slate-200 border-slate-600" : "bg-slate-100 text-slate-700 border-slate-300"
                            )}>
                              {Number(weight).toFixed(1)} kg
                            </span>
                          )}
                          {meta.fragile && (
                            <span className={classNames(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border",
                              isDark ? "bg-rose-900/60 text-rose-200 border-rose-700" : "bg-rose-100 text-rose-700 border-rose-300"
                            )}>FRAGILE</span>
                          )}
                        </>
                      );
                    })()}

                    {/* PAID Badge with amount - always visible next to status */}
                    {job.paymentStatus === 'PAID' && (
                      <span className={classNames(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        isDark ? "bg-red-600 text-white" : "bg-red-500 text-white"
                      )}>
                        <CreditCard size={10} />
                        {job.chargedAmount ? `$${Number(job.chargedAmount).toFixed(2)}` : 'Paid'}
                      </span>
                    )}

                    {/* Finished-job summary chips: total + payment method.
                        Dispatcher needs to see "what did this trip earn and
                        how was it paid" at a glance from the FINISHED tab
                        without opening the details modal each time. We only
                        render for finalised jobs to avoid clutter on
                        active/offered rows. The PAID badge above already
                        covers up-front-card jobs, so this chip is the
                        catch-all for cash + post-trip card. */}
                    {(() => {
                      const isFinalised = ['FINISHED', 'COMPLETED', 'CANCELLED', 'CANCELED', 'NOSHOW', 'NO_SHOW'].includes(String(job.status || '').toUpperCase());
                      if (!isFinalised) return null;
                      const fareAmount = resolveFareAmount(job);
                      const method = String(job.paymentMethod || '').toUpperCase();
                      const txCurrency = Array.isArray((job as any).transactions) && (job as any).transactions.length > 0
                        ? ((job as any).transactions[0]?.currency || null)
                        : null;
                      const cur = String(
                        txCurrency || (job as any).currency || (job as any).requirements?.currency || 'NZD'
                      ).toUpperCase();
                      const showAmount = fareAmount > 0;
                      const showMethod = method === 'CASH' || method === 'CARD';
                      // If this is the up-front-paid card case, the PAID
                      // badge above already shows everything — skip to
                      // avoid duplicating info in two adjacent chips.
                      if (job.paymentStatus === 'PAID' && method === 'CARD') return null;
                      if (!showAmount && !showMethod) return null;
                      return (
                        <span className={classNames(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border",
                          method === 'CASH'
                            ? (isDark ? 'bg-emerald-900/40 text-emerald-200 border-emerald-700' : 'bg-emerald-50 text-emerald-700 border-emerald-300')
                            : (isDark ? 'bg-blue-900/40 text-blue-200 border-blue-700' : 'bg-blue-50 text-blue-700 border-blue-300')
                        )}>
                          {method === 'CASH' ? '💵' : <CreditCard size={10} />}
                          {showAmount ? `${cur} ${fareAmount.toFixed(2)}` : (method || 'Paid')}
                          {showAmount && showMethod ? ` · ${method}` : ''}
                        </span>
                      );
                    })()}

                    {/* Offered-to badge — surfaces which driver the job is
                        currently being offered to and the countdown until the
                        offer auto-expires. Only shown for OFFERED jobs. */}
                    {job.status === 'OFFERED' && (job as any).offeredDriverId && (() => {
                      const expiresAt = (job as any).offerExpiresAt ? new Date((job as any).offerExpiresAt).getTime() : null;
                      const secsLeft = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : null;
                      const driverId = (job as any).offeredDriverId;
                      const driver = drivers.find((d: any) => d.id === driverId || d.userId === driverId);
                      const driverLabel = driver
                        ? (driver.firstName || driver.name || `Driver ${String(driverId).slice(-4)}`)
                        : `Driver ${String(driverId).slice(-4)}`;
                      return (
                        <span
                          className={classNames(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            isDark ? "bg-purple-900/50 text-purple-300 border border-purple-700" : "bg-purple-50 text-purple-700 border border-purple-300"
                          )}
                          title={`Offered to ${driverLabel}${secsLeft != null ? `, ${secsLeft}s until auto-expiry` : ''}`}
                        >
                          → {driverLabel}{secsLeft != null ? ` · ${secsLeft}s` : ''}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Row 2: Addresses - Inline Layout */}
                <div className="flex items-center gap-1.5 mb-1">
                  {/* Pickup */}
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-emerald-500/20 flex-shrink-0" />
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
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <div className={classNames(
                      "w-1.5 h-1.5 rounded-full flex-shrink-0",
                      getAddressString(job.dropoffAddress) 
                        ? "bg-red-500 ring-1 ring-red-500/20" 
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
                <div className="flex items-center justify-between gap-1.5">
                  {/* Left: Meta chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Vehicle Type */}
                    <span className={classNames(
                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                      isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                    )}>
                      🚗 {job.vehicleTypeName || job.vehicleType || "Any"}
                    </span>

                    {/* Tariff */}
                    {job.tariffName && (
                      <span className={classNames(
                        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        isDark ? "bg-indigo-600 text-white border border-indigo-400" : "bg-indigo-100 text-indigo-700 border border-indigo-300"
                      )}>
                        {job.tariffName}
                      </span>
                    )}

                    {/* Passengers */}
                    <span className={classNames(
                      "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                      isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                    )}>
                      <Users size={10} />
                      {job.passengers || job.requirements?.passengers || 1}
                    </span>

                    {/* Bags - only show if > 0 */}
                    {(job.bags > 0 || job.requirements?.bags > 0) && (
                      <span className={classNames(
                        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                        isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                      )}>
                        <Briefcase size={10} />
                        {job.bags || job.requirements?.bags || 0}
                      </span>
                    )}

                    {/* Wheelchairs - distinctive styling for quick recognition */}
                    {(job.wheelchairs > 0 || job.requirements?.wheelchairs > 0) && (
                      <span className={classNames(
                        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                        isDark
                          ? "bg-purple-600 text-white border border-purple-400"
                          : "bg-purple-500 text-white border border-purple-600"
                      )}>
                        <Accessibility size={10} />
                        {job.wheelchairs || job.requirements?.wheelchairs || 0}
                      </span>
                    )}

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

                    {/* Card Paid chip in meta row */}
                    {job.paymentStatus === 'PAID' && (
                      <span className={classNames(
                        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                        isDark
                          ? "bg-red-600 text-white border border-red-400"
                          : "bg-red-500 text-white border border-red-600"
                      )}>
                        <CreditCard size={10} />
                        PAID
                      </span>
                    )}

                    {/* Stops */}
                    {((job.stops?.length || 0) + (job.requirements?.stops?.length || 0)) > 0 && (
                      <span className={classNames(
                        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                        isDark
                          ? "bg-amber-500/25 text-amber-300 border border-amber-500/40"
                          : "bg-amber-100 text-amber-700"
                      )}>
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
                          {availableDrivers.slice(0, 15).map((d) => <option key={d.id} value={d.id}>{d.name}{d.vehicle && d.vehicle !== 'N/A' ? ` - ${d.vehicle}` : ''}</option>)}
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
                            <option key={d.id} value={d.id}>{d.name}{d.vehicle && d.vehicle !== 'N/A' ? ` - ${d.vehicle}` : ''}</option>
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

                    {onEditJob && canEditJob(job.status) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditJob(job.id, job); }}
                        className={classNames(
                          "rounded-md p-1.5 transition-colors",
                          isDark ? "hover:bg-emerald-900/50 text-emerald-400" : "hover:bg-emerald-50 text-emerald-600"
                        )}
                        title="Edit Job"
                      >
                        <Pencil size={12} />
                      </button>
                    )}

                    {/* Eye icon — hover to preview this job's route on the
                        map without selecting / expanding / navigating.
                        Intentionally triggers on onMouseMove rather than
                        onMouseEnter: when the Create Job panel closes, the
                        layout shifts and the cursor can end up over this
                        icon without the user moving the mouse, firing a
                        phantom onMouseEnter that would paint the route.
                        onMouseMove requires actual pointer motion. */}
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      onMouseMove={(e) => {
                        e.stopPropagation();
                        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        // Only set if not already the hovered job, so we're
                        // not churning the store on every pointer tick.
                        const current = useDispatchStore.getState().hoveredJobId;
                        if (current !== job.id) setHoveredJobId(job.id);
                      }}
                      onMouseLeave={(e) => {
                        e.stopPropagation();
                        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        setHoveredJobId(null);
                      }}
                      className={classNames(
                        "rounded-md p-1.5 transition-colors",
                        isDark ? "hover:bg-blue-900/50 text-blue-300" : "hover:bg-blue-50 text-blue-600"
                      )}
                      title="Hover to preview route on map"
                      aria-label="Preview job route on map"
                    >
                      <Eye size={12} />
                    </button>

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
                  "border-t px-2.5 py-2",
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
                      {(job.status === 'UNASSIGNED' || job.status === 'PENDING' || job.status === 'REJECTED' || job.status === 'RECALLED') && urgency.isLate ? (
                        <p className="text-xs font-bold text-red-500">{urgency.lateMinutes}m Late</p>
                      ) : (job.status === 'UNASSIGNED' || job.status === 'PENDING' || job.status === 'REJECTED' || job.status === 'RECALLED') && urgency.minutesUntilScheduled > 0 ? (
                        <p className={classNames("text-xs font-medium", isDark ? "text-blue-400" : "text-blue-600")}>{urgency.minutesUntilScheduled}m until pickup</p>
                      ) : (job.status === 'UNASSIGNED' || job.status === 'PENDING' || job.status === 'REJECTED' || job.status === 'RECALLED') ? (
                        <p className="text-xs font-medium text-emerald-500">Ready Now</p>
                      ) : (
                        <p className={classNames("text-xs font-medium", isDark ? "text-slate-400" : "text-slate-600")}>{statusInfo.label}</p>
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
          });
        })()}
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

      {/* SLA settings */}
      <SlaSettingsModal
        open={showSlaSettings}
        onClose={() => setShowSlaSettings(false)}
        onSaved={(t) => setSlaThresholds(t)}
      />

      {/* Bulk cancel confirmation */}
      {showBulkCancelConfirm && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowBulkCancelConfirm(false)}
        >
          <div
            className={classNames(
              "w-full max-w-sm rounded-xl shadow-2xl border p-4",
              isDark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-2">Cancel {selectedJobIds.size} jobs?</h3>
            <p className={classNames("text-xs mb-4", isDark ? "text-slate-400" : "text-slate-500")}>
              This will call the single-job cancel endpoint for each selected job. Paid jobs may
              require manual refund handling afterwards.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBulkCancelConfirm(false)}
                className={classNames(
                  "rounded px-3 py-1.5 text-xs",
                  isDark ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                Keep jobs
              </button>
              <button
                onClick={handleBulkCancel}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Cancel all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk reassign picker */}
      {showBulkReassign && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowBulkReassign(false)}
        >
          <div
            className={classNames(
              "w-full max-w-sm rounded-xl shadow-2xl border p-4",
              isDark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-2">Reassign {selectedJobIds.size} jobs</h3>
            <p className={classNames("text-xs mb-3", isDark ? "text-slate-400" : "text-slate-500")}>
              Each job will be unassigned from its current driver (if any) and reassigned.
            </p>
            <select
              value={bulkReassignDriverId}
              onChange={(e) => setBulkReassignDriverId(e.target.value)}
              className={classNames(
                "w-full rounded border px-2 py-1.5 text-sm outline-none mb-3",
                isDark
                  ? "border-slate-700 bg-slate-800 text-white"
                  : "border-slate-300 bg-white text-slate-800"
              )}
            >
              <option value="">Select driver…</option>
              {availableDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.vehicle && d.vehicle !== "N/A" ? ` — ${typeof d.vehicle === "string" ? d.vehicle : d.vehicle?.plateNumber || ""}` : ""}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowBulkReassign(false); setBulkReassignDriverId(""); }}
                className={classNames(
                  "rounded px-3 py-1.5 text-xs",
                  isDark ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkReassign}
                disabled={!bulkReassignDriverId}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Reassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobBoard;
