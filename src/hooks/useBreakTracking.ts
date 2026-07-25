/**
 * useBreakTracking — tracks when each driver entered a BREAK / AWAY state,
 * persisted in module-level state so the timer survives component remounts.
 *
 * The backend may emit a dedicated `driver:break:start` event (Wave 2A), but
 * as a defensive fallback we also watch the driver list for AWAY transitions
 * and snapshot the moment we first see them.
 */
import { useEffect, useState } from "react";
import { useDispatchStore } from "../store/useDispatchStore";

// Module-level map so remounting a panel doesn't reset break start times.
const breakStartMap = new Map<string, number>();

const BREAK_WARNING_KEY = "dispatch_break_warning_minutes_v1";
const DEFAULT_BREAK_WARNING_MINUTES = 30;

export function loadBreakWarningMinutes(): number {
  if (typeof localStorage === "undefined") return DEFAULT_BREAK_WARNING_MINUTES;
  try {
    const raw = localStorage.getItem(BREAK_WARNING_KEY);
    const n = raw ? Number(raw) : DEFAULT_BREAK_WARNING_MINUTES;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_BREAK_WARNING_MINUTES;
  } catch {
    return DEFAULT_BREAK_WARNING_MINUTES;
  }
}

export function saveBreakWarningMinutes(mins: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BREAK_WARNING_KEY, String(mins));
  } catch {
    /* noop */
  }
}

const isOnBreakStatus = (status?: string | null): boolean => {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === "BREAK" || s === "ON_BREAK" || s === "AWAY" || s === "PAUSED";
};

export type ShiftStatus = "ON_SHIFT" | "ON_BREAK" | "OFF_SHIFT";

export function deriveShiftStatus(driverStatus?: string | null): ShiftStatus {
  if (!driverStatus) return "OFF_SHIFT";
  const s = driverStatus.toUpperCase();
  if (s === "OFFLINE") return "OFF_SHIFT";
  if (isOnBreakStatus(s)) return "ON_BREAK";
  return "ON_SHIFT";
}

/**
 * Hook returning a `tick` that increments every second plus helper fn
 * that returns the elapsed break seconds for a given driver.
 */
export function useBreakTracking() {
  const drivers = useDispatchStore((s) => s.drivers);
  const [, setTick] = useState(0);

  // Watch driver status transitions and snapshot the moment each driver
  // entered/left break state.
  useEffect(() => {
    const now = Date.now();
    for (const d of drivers) {
      const onBreak = isOnBreakStatus(d.status);
      const had = breakStartMap.has(d.id);
      if (onBreak && !had) {
        // Use lastUpdateAt as the start time if available — otherwise "now".
        const startMs = d.lastUpdateAt ? new Date(d.lastUpdateAt).getTime() : now;
        breakStartMap.set(d.id, Number.isFinite(startMs) ? startMs : now);
      } else if (!onBreak && had) {
        breakStartMap.delete(d.id);
      }
    }
    // Prune stale entries for drivers that have dropped off the list entirely
    const liveIds = new Set(drivers.map((d) => d.id));
    for (const id of breakStartMap.keys()) {
      if (!liveIds.has(id)) breakStartMap.delete(id);
    }
  }, [drivers]);

  // Real-time ticker for UI updates
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => (t + 1) % 100000), 1000);
    return () => clearInterval(interval);
  }, []);

  const getBreakElapsedSec = (driverId: string): number | null => {
    const start = breakStartMap.get(driverId);
    if (!start) return null;
    return Math.max(0, Math.floor((Date.now() - start) / 1000));
  };

  return { getBreakElapsedSec };
}

export function formatBreakTimer(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
