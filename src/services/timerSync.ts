/**
 * Timer Synchronization - Client Side (Dispatcher)
 * 
 * Synchronizes timers with server-issued timestamps
 * to prevent drift between dispatcher and driver
 */

interface TimerData {
  expiresAt: string;      // ISO timestamp when timer expires
  serverTime: string;     // ISO timestamp of server's current time
  durationMs: number;     // Total duration in ms
  createdAt?: string;     // ISO timestamp when created
}

let cachedClockSkew = 0;

/**
 * Calculate and cache clock skew
 */
export function updateClockSkew(serverTime: string): void {
  const server = new Date(serverTime).getTime();
  const local = Date.now();
  cachedClockSkew = server - local;
  
  if (Math.abs(cachedClockSkew) > 1000) {
    console.warn(`⏱️ Significant clock skew detected: ${cachedClockSkew}ms`);
  }
}

/**
 * Get adjusted current time
 */
export function getAdjustedTime(): number {
  return Date.now() + cachedClockSkew;
}

/**
 * Calculate remaining time for a timer
 */
export function getRemainingTime(timerData: TimerData): number {
  updateClockSkew(timerData.serverTime);
  
  const expiresAt = new Date(timerData.expiresAt).getTime();
  const now = getAdjustedTime();
  const remaining = expiresAt - now;
  
  return Math.max(0, remaining);
}

/**
 * Check if timer has expired
 */
export function isTimerExpired(timerData: TimerData): boolean {
  return getRemainingTime(timerData) === 0;
}

/**
 * Format time duration for display
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  
  return `${seconds}s`;
}

/**
 * Create a React hook for countdown timer
 */
export function useCountdownTimer(
  timerData: TimerData | null,
  onExpire?: () => void
): { remainingMs: number; remainingFormatted: string; isExpired: boolean } {
  const [remainingMs, setRemainingMs] = React.useState(0);
  
  React.useEffect(() => {
    if (!timerData) {
      setRemainingMs(0);
      return;
    }
    
    // Update immediately
    setRemainingMs(getRemainingTime(timerData));
    
    // Update every 100ms
    const interval = setInterval(() => {
      const remaining = getRemainingTime(timerData);
      setRemainingMs(remaining);
      
      if (remaining === 0 && onExpire) {
        onExpire();
        clearInterval(interval);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [timerData, onExpire]);
  
  return {
    remainingMs,
    remainingFormatted: formatDuration(remainingMs),
    isExpired: remainingMs === 0,
  };
}

// Mock React for TypeScript compilation
// (will be provided by actual React in runtime)
const React = {
  useState: (initial: any) => [initial, () => {}],
  useEffect: (fn: () => any, deps?: any[]) => {},
};

export default {
  updateClockSkew,
  getAdjustedTime,
  getRemainingTime,
  isTimerExpired,
  formatDuration,
  useCountdownTimer,
};

