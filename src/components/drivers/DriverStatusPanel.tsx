import classNames from "classnames";
import {
  Activity,
  AlertTriangle,
  Briefcase,
  Calendar,
  CheckCircle,
  Clock,
  Coffee,
  DollarSign,
  Gauge,
  Hash,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  User,
  Wifi,
  Zap
} from "lucide-react";
import React, { useRef, useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { DispatchJob, useDispatchStore } from "../../store/useDispatchStore";
import api from "../../services/api";
import {
  deriveShiftStatus,
  formatBreakTimer,
  loadBreakWarningMinutes,
  useBreakTracking,
} from "../../hooks/useBreakTracking";
import ShiftsTodayView from "./ShiftsTodayView";

// Status that means job is complete/no longer active for the driver
const COMPLETED_JOB_STATUSES = new Set(['FINISHED', 'CANCELLED', 'NOSHOW', 'REJECTED', 'RECALLED', 'UNASSIGNED', 'PENDING']);

// Compact status badges with abbreviations for space efficiency
const statusConfig: Record<string, { bg: string; text: string; label: string; short: string; rowBgLight: string; rowBgDark: string }> = {
  AVAILABLE: { bg: "bg-emerald-500", text: "text-emerald-700", label: "Available", short: "AVL", rowBgLight: "bg-emerald-50/60", rowBgDark: "bg-emerald-900/20" },
  AWAY: { bg: "bg-amber-500", text: "text-amber-700", label: "Away", short: "AWY", rowBgLight: "bg-orange-50/60", rowBgDark: "bg-orange-900/20" },
  BUSY: { bg: "bg-red-500", text: "text-red-700", label: "On Ride", short: "BSY", rowBgLight: "bg-red-50/60", rowBgDark: "bg-red-900/20" },
  ROGER: { bg: "bg-blue-400", text: "text-blue-700", label: "Roger", short: "RGR", rowBgLight: "bg-blue-100", rowBgDark: "bg-blue-900/40" },
  ASSIGNED: { bg: "bg-blue-400", text: "text-blue-700", label: "Roger", short: "RGR", rowBgLight: "bg-blue-100", rowBgDark: "bg-blue-900/40" },
  ON_THE_WAY: { bg: "bg-indigo-500", text: "text-indigo-700", label: "On the Way", short: "OTW", rowBgLight: "bg-indigo-100", rowBgDark: "bg-indigo-900/40" },
  ARRIVED: { bg: "bg-orange-500", text: "text-orange-700", label: "Arrived", short: "ARV", rowBgLight: "bg-orange-100", rowBgDark: "bg-orange-900/40" },
  STARTED: { bg: "bg-red-600", text: "text-red-800", label: "Active", short: "ACT", rowBgLight: "bg-red-100/70", rowBgDark: "bg-red-800/30" },
  ACTIVE: { bg: "bg-red-600", text: "text-red-800", label: "Active", short: "ACT", rowBgLight: "bg-red-100/70", rowBgDark: "bg-red-800/30" },
  OFFLINE: { bg: "bg-gray-400", text: "text-gray-600", label: "Offline", short: "OFF", rowBgLight: "bg-slate-50/40", rowBgDark: "bg-slate-800/60" },
};

const formatRelativeTime = (iso?: string) => {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) return "now";
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
};

// Get today's date range for filtering
const getTodayRange = () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { startOfDay, endOfDay };
};

const DriverStatusPanel: React.FC = () => {
  const { isDark } = useTheme();
  const drivers = useDispatchStore((state) => state.drivers);
  const jobs = useDispatchStore((state) => state.jobs);
  const focusDriver = useDispatchStore((state) => state.focusDriver);
  const setHoveredDriverId = useDispatchStore((state) => state.setHoveredDriverId);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [zoneFilter, setZoneFilter] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  
  // Kick driver state
  const [kickingDriverId, setKickingDriverId] = useState<string | null>(null);
  const [kickConfirmId, setKickConfirmId] = useState<string | null>(null);
  const [pendingKicks, setPendingKicks] = useState<Set<string>>(new Set());

  // Shift / break tracking — Wave 2D
  const { getBreakElapsedSec } = useBreakTracking();
  const breakWarnMin = loadBreakWarningMinutes();
  const [showShiftsView, setShowShiftsView] = useState(false);

  // Kick driver handler
  const handleKickDriver = async (driverId: string, driverName: string) => {
    setKickingDriverId(driverId);
    try {
      const response = await api.post<{
        success: boolean;
        message: string;
        status: 'kicked' | 'pending';
        activeJobId?: string;
      }>(`/api/dispatch/drivers/${driverId}/kick`, {
        reason: 'Kicked by dispatcher'
      });
      
      if (response.success) {
        if (response.status === 'pending') {
          // Driver has active job - kick is pending
          setPendingKicks(prev => new Set(prev).add(driverId));
          alert(`${driverName} has an active job. They will be kicked once the job completes.`);
        } else {
          // Driver kicked immediately
          alert(`${driverName} has been kicked and logged out.`);
        }
      }
    } catch (error: any) {
      console.error('Failed to kick driver:', error);
      alert(error?.response?.data?.message || 'Failed to kick driver');
    } finally {
      setKickingDriverId(null);
      setKickConfirmId(null);
    }
  };

  // Cancel pending kick
  const handleCancelPendingKick = async (driverId: string) => {
    try {
      await api.delete(`/api/dispatch/drivers/${driverId}/kick`);
      setPendingKicks(prev => {
        const next = new Set(prev);
        next.delete(driverId);
        return next;
      });
    } catch (error: any) {
      console.error('Failed to cancel pending kick:', error);
      alert(error?.response?.data?.message || 'Failed to cancel pending kick');
    }
  };

  // Real-time counter - tick every second
  React.useEffect(() => {
    const interval = setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Create a map for quick job lookup by ID (only active jobs)
  const jobsMap = React.useMemo(() => {
    const map = new Map<string, DispatchJob>();
    for (const job of jobs) {
      // Only include jobs that are not completed
      if (!COMPLETED_JOB_STATUSES.has(job.status)) {
        map.set(job.id, job);
        // Also index by reference (public jobId) for cross-referencing
        if (job.reference && job.reference !== job.id) {
          map.set(job.reference, job);
        }
      }
    }
    return map;
  }, [jobs]);

  // Map driver ID to their active job (fallback when currentJobId is missing)
  const driverJobMap = React.useMemo(() => {
    const map = new Map<string, DispatchJob>();
    for (const job of jobs) {
      if (!COMPLETED_JOB_STATUSES.has(job.status) && job.driverId) {
        map.set(job.driverId, job);
      }
    }
    return map;
  }, [jobs]);

  // Calculate today's completed jobs and earnings per driver
  const driverTodayStats = React.useMemo(() => {
    const { startOfDay } = getTodayRange();
    const statsMap = new Map<string, { completed: number; earnings: number; lastJobTime?: string }>();
    
    for (const job of jobs) {
      if (job.status === 'FINISHED' && job.driverId) {
        // Check if job was completed today
        const jobTime = job.lastUpdateAt || job.requestedAt;
        if (jobTime && jobTime >= startOfDay) {
          const existing = statsMap.get(job.driverId) || { completed: 0, earnings: 0 };
          const fare = job.actualFare || job.finalAmount || job.fareEstimate || 0;
          statsMap.set(job.driverId, {
            completed: existing.completed + 1,
            earnings: existing.earnings + (typeof fare === 'number' ? fare : 0),
            lastJobTime: jobTime > (existing.lastJobTime || '') ? jobTime : existing.lastJobTime,
          });
        }
      }
    }
    
    return statsMap;
  }, [jobs]);

  const activeDrivers = React.useMemo(
    () => drivers.filter((driver) => driver.status !== "OFFLINE"),
    [drivers]
  );

  const filteredDrivers = React.useMemo(() => {
    if (!zoneFilter) return activeDrivers;
    if (zoneFilter === "NO_ZONE") {
      return activeDrivers.filter((driver) => !driver.zoneName && !driver.zoneId);
    }
    return activeDrivers.filter((driver) => driver.zoneId === zoneFilter || driver.zoneName === zoneFilter);
  }, [activeDrivers, zoneFilter]);

  const uniqueZones = React.useMemo(() => {
    const zones = new Map<string, string>();
    for (const driver of drivers) {
      if (driver.zoneId && driver.zoneName) {
        zones.set(driver.zoneId, driver.zoneName);
      }
    }
    return Array.from(zones.entries()).map(([id, name]) => ({ id, name }));
  }, [drivers]);

  const stats = React.useMemo(() => ({
    available: drivers.filter(d => d.status === "AVAILABLE").length,
    busy: drivers.filter(d => d.status === "BUSY" || d.status === "ON_THE_WAY" || d.status === "ARRIVED").length,
    away: drivers.filter(d => d.status === "AWAY").length,
    roger: drivers.filter(d => d.status === "ROGER" || d.status === "ASSIGNED").length,
    total: activeDrivers.length,
  }), [drivers, activeDrivers]);

  // Helper to render driver row content
  const renderDriverRow = (driver: typeof drivers[0], index: number) => {
    // Get current job details - only if not completed
    const rawJob = driver.currentJobId ? jobsMap.get(driver.currentJobId) : null;
    // Fallback: look up job by driverId if currentJobId lookup fails
    const currentJob = (rawJob && !COMPLETED_JOB_STATUSES.has(rawJob.status) ? rawJob : null)
      || driverJobMap.get(driver.id)
      || null;

    // Derive display status from job status when driver has an active job
    const getDisplayStatus = () => {
      if (currentJob) {
        const jobStatus = currentJob.status;
        if (jobStatus === "ASSIGNED") return "ROGER";
        if (jobStatus === "ON_THE_WAY") return "ON_THE_WAY";
        if (jobStatus === "ARRIVED") return "ARRIVED";
        if (jobStatus === "ACTIVE" || jobStatus === "STARTED") return "ACTIVE";
      }
      if (driver.status === "ASSIGNED") return "ROGER";
      if (driver.status === "ROGER") return "ROGER";
      return driver.status;
    };
    const displayStatus = getDisplayStatus();
    const status = statusConfig[displayStatus] || statusConfig.OFFLINE;
    const vehicleInfo = typeof driver.vehicle === 'string' 
      ? driver.vehicle 
      : driver.vehicle?.plateNumber || '—';
    
    const jobFare = currentJob?.fareEstimate || currentJob?.actualFare || currentJob?.finalAmount;
    
    // Get today's stats for this driver
    const todayStats = driverTodayStats.get(driver.id);
    
    // Calculate time since last update
    const lastUpdateTime = driver.locationUpdatedAt || driver.lastUpdateAt || driver.lastUpdate;
    const timeSinceUpdate = formatRelativeTime(lastUpdateTime);
    
    // Calculate seconds since last sync for connection status color
    const lastUpdateMs = lastUpdateTime ? Date.now() - new Date(lastUpdateTime).getTime() : Infinity;
    const secondsSinceSync = Math.floor(lastUpdateMs / 1000);
    
    // Connection status based on sync freshness (green -> amber -> red)
    const getSyncColor = () => {
      if (secondsSinceSync <= 10) return "text-emerald-500"; // Fresh - green
      if (secondsSinceSync <= 30) return "text-lime-500";    // Good - lime  
      if (secondsSinceSync <= 60) return "text-amber-500";   // Stale - amber
      if (secondsSinceSync <= 120) return "text-orange-500"; // Warning - orange
      return "text-red-500";                                  // Lost - red
    };
    const syncColor = getSyncColor();
    
    // Speed display
    const speed = driver.speedKmh ?? 0;

    // Shift / break tracking (Wave 2D)
    const shiftStatus = deriveShiftStatus(driver.status);
    const breakElapsedSec = shiftStatus === "ON_BREAK" ? getBreakElapsedSec(driver.id) : null;
    const breakWarn =
      breakElapsedSec != null && breakElapsedSec >= breakWarnMin * 60;

    // Time color helper
    const getTimeColor = () => {
      if (timeSinceUpdate === '—') return isDark ? "text-slate-500" : "text-slate-300";
      if (timeSinceUpdate.includes('s') || timeSinceUpdate === 'now') return "text-emerald-500";
      if (timeSinceUpdate.includes('m') && Number.parseInt(timeSinceUpdate) < 5) return "text-amber-500";
      return "text-red-500";
    };
    
    return (
      <div
        key={driver.id}
        role="button"
        tabIndex={0}
        className={classNames(
          "grid grid-cols-[minmax(100px,1.3fr)_45px_minmax(70px,1fr)_minmax(100px,1.4fr)_minmax(55px,0.8fr)_35px] lg:grid-cols-[minmax(140px,1.4fr)_55px_minmax(85px,1fr)_minmax(150px,1.6fr)_minmax(75px,0.9fr)_45px] gap-0.5 lg:gap-1 px-1.5 lg:px-2 py-1.5 lg:py-2.5 items-center border-b cursor-pointer transition-all",
          isDark 
            ? `border-slate-700 ${status.rowBgDark} hover:bg-slate-700`
            : `border-slate-100 ${status.rowBgLight} hover:bg-indigo-50/60`
        )}
        onMouseEnter={() => {
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          setHoveredDriverId(driver.id);
        }}
        onMouseLeave={() => {
          hoverTimeoutRef.current = setTimeout(() => setHoveredDriverId(null), 4000);
        }}
        onClick={() => driver.position && focusDriver(driver.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            driver.position && focusDriver(driver.id);
          }
        }}
      >
        {/* Driver Info - Avatar, Name, Vehicle, App State, Speed */}
        <div className="flex items-center gap-1.5 lg:gap-2 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-7 h-7 lg:w-9 lg:h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-[10px] lg:text-sm">
              {driver.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className={classNames(
              "absolute -bottom-0.5 -right-0.5 w-2.5 lg:w-3 h-2.5 lg:h-3 rounded-full border-2",
              isDark ? "border-slate-800" : "border-white",
              status.bg
            )} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className={classNames(
                "text-[10px] lg:text-[11px] font-semibold truncate leading-tight",
                isDark ? "text-slate-100" : "text-slate-800"
              )}>
                {driver.name?.split(' ')[0]?.slice(0, 8) || 'Unknown'}
              </span>
              {/* Connection Status - Color based on sync freshness */}
              <Wifi className={classNames("w-2.5 lg:w-3 h-2.5 lg:h-3 flex-shrink-0", syncColor)} />
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={classNames(
                "text-[8px] lg:text-[9px] truncate",
                isDark ? "text-slate-400" : "text-slate-400"
              )}>{vehicleInfo}</span>
              {/* Speed indicator - Hidden on small screens */}
              {speed > 0 && (
                <span className="hidden lg:flex items-center gap-0.5 text-[9px] text-blue-500 font-medium">
                  <Gauge className="w-2.5 h-2.5" />
                  {speed.toFixed(0)}
                </span>
              )}
            </div>
            {/* Last update time + shift/break indicator */}
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <Clock className={classNames(
                "w-2 lg:w-2.5 h-2 lg:h-2.5",
                isDark ? "text-slate-500" : "text-slate-300"
              )} />
              <span className={classNames("text-[7px] lg:text-[8px] font-medium", getTimeColor())}>
                {timeSinceUpdate}
              </span>
              {/* Shift status chip — always shown */}
              <span
                className={classNames(
                  "ml-1 inline-flex items-center gap-0.5 px-1 py-0 rounded text-[7px] lg:text-[8px] font-bold uppercase leading-tight",
                  shiftStatus === "ON_SHIFT" &&
                    (isDark
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-emerald-50 text-emerald-700"),
                  shiftStatus === "ON_BREAK" &&
                    (breakWarn
                      ? "bg-red-500 text-white animate-pulse"
                      : isDark
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-amber-50 text-amber-700"),
                  shiftStatus === "OFF_SHIFT" &&
                    (isDark ? "bg-slate-700 text-slate-400" : "bg-slate-100 text-slate-500")
                )}
                title={
                  shiftStatus === "ON_BREAK" && breakElapsedSec != null
                    ? `On break ${formatBreakTimer(breakElapsedSec)}${breakWarn ? " — over threshold" : ""}`
                    : shiftStatus
                }
              >
                {shiftStatus === "ON_BREAK" ? (
                  <>
                    <Coffee className="w-2 h-2" />
                    {breakElapsedSec != null ? formatBreakTimer(breakElapsedSec) : "Break"}
                    {breakWarn && <AlertTriangle className="w-2 h-2" />}
                  </>
                ) : shiftStatus === "ON_SHIFT" ? (
                  "On shift"
                ) : (
                  "Off shift"
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex justify-center">
          <span className={classNames(
            "px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-md text-[9px] lg:text-[10px] font-bold leading-none",
            displayStatus === "AVAILABLE" && (isDark ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-green-100 text-green-700 border border-green-300"),
            displayStatus === "BUSY" && (isDark ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-red-100 text-red-700 border border-red-300"),
            displayStatus === "AWAY" && (isDark ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-orange-100 text-orange-700 border border-orange-300"),
            displayStatus === "ROGER" && (isDark ? "bg-blue-400/20 text-blue-400 border border-blue-400/30" : "bg-blue-100 text-blue-700 border border-blue-300"),
            displayStatus === "ON_THE_WAY" && (isDark ? "bg-indigo-500/25 text-indigo-300 border border-indigo-500/40" : "bg-indigo-100 text-indigo-700 border border-indigo-300"),
            displayStatus === "ARRIVED" && (isDark ? "bg-orange-500/25 text-orange-300 border border-orange-500/40" : "bg-orange-100 text-orange-700 border border-orange-300"),
            (displayStatus === "STARTED" || displayStatus === "ACTIVE") && (isDark ? "bg-red-600/25 text-red-300 border border-red-600/40" : "bg-red-200 text-red-800 border border-red-400"),
            displayStatus === "OFFLINE" && (isDark ? "bg-slate-600/20 text-slate-400 border border-slate-600/30" : "bg-slate-100 text-slate-500 border border-slate-300"),
            !["AVAILABLE", "BUSY", "AWAY", "OFFLINE", "ROGER", "ON_THE_WAY", "ARRIVED", "STARTED", "ACTIVE"].includes(displayStatus) && (isDark ? "bg-slate-500/20 text-slate-400 border border-slate-500/30" : "bg-slate-100 text-slate-600 border border-slate-300")
          )}>
            {status.short}
          </span>
        </div>

        {/* Zone & Queue Position */}
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <MapPin className={classNames(
              "w-2.5 lg:w-3 h-2.5 lg:h-3 flex-shrink-0",
              isDark ? "text-slate-500" : "text-slate-400"
            )} />
            <span className={classNames(
              "text-[9px] lg:text-[10px] truncate leading-tight",
              isDark ? "text-slate-300" : "text-slate-600"
            )}>
              {(driver.zoneName || driver.zoneId || '—').slice(0, 8)}
            </span>
          </div>
          {driver.queuePosition ? (
            <div className="flex items-center gap-1 mt-0.5">
              <Hash className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-indigo-500" />
              <span className="text-[10px] lg:text-[11px] text-indigo-400 font-bold">{driver.queuePosition}</span>
            </div>
          ) : (
            <div className={classNames(
              "text-[8px] lg:text-[9px] mt-0.5",
              isDark ? "text-slate-600" : "text-slate-300"
            )}>No queue</div>
          )}
        </div>

        {/* Current Job Details - Fare, Pickup, Status */}
        <div className="min-w-0">
          {currentJob ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 lg:gap-1.5">
                <Briefcase className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-red-500 flex-shrink-0" />
                <span className={classNames(
                  "text-[8px] lg:text-[9px] font-mono truncate",
                  isDark ? "text-red-400" : "text-red-600"
                )}>
                  #{currentJob.reference || currentJob.id.slice(0, 6)}
                </span>
                {typeof jobFare === 'number' && (
                  <span className="hidden lg:flex text-[10px] font-semibold text-emerald-500 items-center">
                    <DollarSign className="w-3 h-3" />{jobFare.toFixed(0)}
                  </span>
                )}
              </div>
              <div className={classNames(
                "text-[8px] lg:text-[9px] truncate leading-tight hidden lg:block",
                isDark ? "text-slate-400" : "text-slate-500"
              )}>
                {currentJob.pickupAddress?.slice(0, 20) || '—'}
              </div>
              <div className="flex items-center gap-1 lg:gap-1.5">
                <span className={classNames(
                  "text-[7px] lg:text-[8px] px-1 lg:px-1.5 py-0.5 rounded font-medium",
                  (currentJob.status === 'ACTIVE' || currentJob.status === 'STARTED') && "bg-red-500/20 text-red-400",
                  currentJob.status === 'ASSIGNED' && "bg-blue-400/20 text-blue-400",
                  currentJob.status === 'ON_THE_WAY' && "bg-indigo-500/20 text-indigo-400",
                  currentJob.status === 'ARRIVED' && "bg-orange-500/20 text-orange-400",
                  currentJob.status === 'OFFERED' && "bg-amber-500/20 text-amber-400",
                  !['ACTIVE', 'STARTED', 'ASSIGNED', 'ON_THE_WAY', 'ARRIVED', 'OFFERED'].includes(currentJob.status) && (isDark ? "bg-slate-600/20 text-slate-400" : "bg-slate-100 text-slate-600")
                )}>
                  {currentJob.status === 'ASSIGNED' ? 'ROGER' : currentJob.status === 'ON_THE_WAY' ? 'On the Way' : currentJob.status === 'ARRIVED' ? 'Arrived' : currentJob.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Activity className={classNames(
                "w-2.5 lg:w-3 h-2.5 lg:h-3",
                isDark ? "text-slate-600" : "text-slate-300"
              )} />
              <span className={classNames(
                "text-[9px] lg:text-[10px] italic",
                isDark ? "text-slate-500" : "text-slate-400"
              )}>No active job</span>
            </div>
          )}
        </div>

        {/* Today's Stats - Completed Jobs & Earnings */}
        <div className="text-center min-w-0">
          {todayStats && todayStats.completed > 0 ? (
            <div className="space-y-0.5">
              <div className="flex items-center justify-center gap-0.5 lg:gap-1">
                <CheckCircle className="w-2.5 lg:w-3 h-2.5 lg:h-3 text-emerald-500" />
                <span className="text-[10px] lg:text-xs font-bold text-emerald-500">{todayStats.completed}</span>
              </div>
              <div className={classNames(
                "text-[9px] lg:text-[10px] font-medium",
                isDark ? "text-slate-400" : "text-slate-500"
              )}>
                ${typeof todayStats.earnings === 'number' ? todayStats.earnings.toFixed(0) : '0'}
              </div>
            </div>
          ) : (
            <div className={classNames(
              "text-[8px] lg:text-[9px]",
              isDark ? "text-slate-600" : "text-slate-300"
            )}>0 jobs</div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center justify-center gap-0.5">
          {driver.phone && (
            <button 
              className={classNames(
                "p-0.5 lg:p-1 rounded-md transition-colors",
                isDark 
                  ? "text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/20" 
                  : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-100"
              )}
              title={`Call ${driver.phone}`}
              onClick={(e) => {
                e.stopPropagation();
                window.open(`tel:${driver.phone}`);
              }}
            >
              <Phone className="w-3 lg:w-3.5 h-3 lg:h-3.5" />
            </button>
          )}
          {driver.position && (
            <button 
              className={classNames(
                "p-0.5 lg:p-1 rounded-md transition-colors",
                isDark 
                  ? "text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/20" 
                  : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-100"
              )}
              title="Focus on map"
              onClick={(e) => {
                e.stopPropagation();
                focusDriver(driver.id);
              }}
            >
              <Navigation className="w-3 lg:w-3.5 h-3 lg:h-3.5" />
            </button>
          )}
          
          {/* Kick Driver Button */}
          {kickConfirmId === driver.id ? (
            <div className="flex items-center gap-0.5">
              <button 
                className={classNames(
                  "px-1 py-0.5 text-[9px] lg:text-[10px] rounded transition-colors font-medium",
                  "bg-red-500 text-white hover:bg-red-600"
                )}
                disabled={kickingDriverId === driver.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleKickDriver(driver.id, driver.name || 'Driver');
                }}
              >
                {kickingDriverId === driver.id ? '...' : 'Yes'}
              </button>
              <button 
                className={classNames(
                  "px-1 py-0.5 text-[9px] lg:text-[10px] rounded transition-colors font-medium",
                  isDark 
                    ? "bg-slate-600 text-slate-200 hover:bg-slate-500" 
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setKickConfirmId(null);
                }}
              >
                No
              </button>
            </div>
          ) : pendingKicks.has(driver.id) ? (
            <button 
              className={classNames(
                "p-0.5 lg:p-1 rounded-md transition-colors",
                "text-amber-500 hover:text-amber-400 hover:bg-amber-500/20"
              )}
              title="Pending kick - click to cancel"
              onClick={(e) => {
                e.stopPropagation();
                handleCancelPendingKick(driver.id);
              }}
            >
              <LogOut className="w-3 lg:w-3.5 h-3 lg:h-3.5" />
            </button>
          ) : (
            <button 
              className={classNames(
                "p-0.5 lg:p-1 rounded-md transition-colors",
                isDark 
                  ? "text-slate-400 hover:text-red-400 hover:bg-red-500/20" 
                  : "text-slate-400 hover:text-red-600 hover:bg-red-100"
              )}
              title="Kick driver"
              onClick={(e) => {
                e.stopPropagation();
                setKickConfirmId(driver.id);
              }}
            >
              <LogOut className="w-3 lg:w-3.5 h-3 lg:h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={classNames(
      "h-full flex flex-col overflow-hidden",
      isDark ? "bg-slate-800" : "bg-white"
    )}>
      {/* Header - Compact */}
      <div className={classNames(
        "border-b px-2.5 py-1.5",
        isDark ? "bg-slate-800/80 border-slate-600" : "bg-white border-slate-200"
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={classNames(
              "text-[11px] font-semibold",
              isDark ? "text-slate-200" : "text-slate-700"
            )}>Fleet</span>
            <span className={classNames(
              "inline-flex items-center justify-center min-w-[20px] h-[18px] rounded-md text-[10px] font-bold tabular-nums",
              isDark ? "bg-slate-600 text-slate-200" : "bg-slate-200 text-slate-700"
            )}>{stats.total}</span>
            <button
              onClick={() => setShowShiftsView(true)}
              className={classNames(
                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium",
                isDark
                  ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
              title="View today's shifts"
            >
              <Calendar className="w-2.5 h-2.5" />
              Shifts
            </button>
          </div>
          
          {/* Stats Pills - Better visual hierarchy */}
          <div className="flex items-center gap-1.5">
            <span className={classNames(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold tabular-nums",
              isDark 
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" 
                : "bg-emerald-50 text-emerald-600 border border-emerald-200"
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{stats.available}
            </span>
            {stats.roger > 0 && (
              <span className={classNames(
                "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold tabular-nums",
                isDark 
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/20" 
                  : "bg-blue-50 text-blue-600 border border-blue-200"
              )}>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{stats.roger}
              </span>
            )}
            <span className={classNames(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold tabular-nums",
              isDark 
                ? "bg-red-500/15 text-red-400 border border-red-500/20" 
                : "bg-red-50 text-red-600 border border-red-200"
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{stats.busy}
            </span>
            <span className={classNames(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold tabular-nums",
              isDark 
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" 
                : "bg-amber-50 text-amber-600 border border-amber-200"
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{stats.away}
            </span>
          </div>
        </div>

        {/* Zone Filter Pills - Compact */}
        {uniqueZones.length > 0 && (
          <div className="flex items-center gap-1 mt-1 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setZoneFilter(null)}
              className={classNames(
                "px-1.5 py-0.5 rounded text-[8px] font-medium whitespace-nowrap transition-colors",
                !zoneFilter 
                  ? "bg-indigo-600 text-white" 
                  : isDark 
                    ? "bg-slate-600 text-slate-300 hover:bg-slate-500" 
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              All
            </button>
            {uniqueZones.map((zone) => (
              <button
                key={zone.id}
                onClick={() => setZoneFilter(zone.id)}
                className={classNames(
                  "px-1.5 py-0.5 rounded text-[8px] font-medium whitespace-nowrap transition-colors",
                  zoneFilter === zone.id 
                    ? "bg-indigo-600 text-white" 
                    : isDark 
                      ? "bg-slate-600 text-slate-300 hover:bg-slate-500" 
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {zone.name.slice(0, 10)}{zone.name.length > 10 ? '…' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table Header */}
      <div className={classNames(
        "border-b px-1.5 py-1 grid grid-cols-[minmax(100px,1.3fr)_45px_minmax(70px,1fr)_minmax(100px,1.4fr)_minmax(55px,0.8fr)_35px] lg:grid-cols-[minmax(140px,1.4fr)_55px_minmax(85px,1fr)_minmax(150px,1.6fr)_minmax(75px,0.9fr)_45px] gap-0.5 text-[8px] font-semibold uppercase tracking-wider",
        isDark ? "bg-slate-700/30 border-slate-600 text-slate-500" : "bg-slate-50 border-slate-200 text-slate-400"
      )}>
        <div className="flex items-center gap-1">
          <User className="w-2.5 lg:w-3 h-2.5 lg:h-3" />Driver
        </div>
        <div className="text-center">Status</div>
        <div>Zone/Q#</div>
        <div>In-Hand Job</div>
        <div className="text-center">Today</div>
        <div className="text-center">
          <Zap className="w-2.5 lg:w-3 h-2.5 lg:h-3 inline" />
        </div>
      </div>

      {/* Driver Rows */}
      <div className="flex-1 overflow-y-auto">
        {filteredDrivers.map((driver, index) => renderDriverRow(driver, index))}

        {/* Empty State */}
        {filteredDrivers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10">
            <User className={classNames(
              "w-10 h-10 mb-2",
              isDark ? "text-slate-600" : "text-slate-300"
            )} />
            <p className={classNames(
              "text-sm",
              isDark ? "text-slate-400" : "text-slate-500"
            )}>
              {activeDrivers.length === 0 ? "No drivers online" : "No drivers in zone"}
            </p>
          </div>
        )}
      </div>

      {/* Shifts today modal */}
      <ShiftsTodayView open={showShiftsView} onClose={() => setShowShiftsView(false)} />
    </div>
  );
};

export default DriverStatusPanel;
