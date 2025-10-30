/**
 * Job Status Color Utility for Dispatch System
 * Updated color scheme for better visual distinction
 */

export const JOB_STATUS_COLORS = {
  // Unassigned & Pending
  UNASSIGNED: "#86EFAC", // 🟢 Light Green - Needs assignment
  
  // Offer Stage
  OFFERED: "#FED7AA", // 🟠 Light Orange - Offered to driver
  
  // Assigned & En Route (Light Red)
  ASSIGNED: "#FCA5A5", // 🔴 Light Red - Driver assigned
  ACCEPTED: "#FCA5A5", // 🔴 Light Red - Driver accepted
  ON_THE_WAY: "#FCA5A5", // 🔴 Light Red - Driver heading to pickup
  ARRIVED: "#FCA5A5", // 🔴 Light Red - Driver arrived
  
  // Active (Red)
  STARTED: "#EF4444", // 🔴 Red - Ride started
  ACTIVE: "#EF4444", // 🔴 Red - Ride in progress
  REACHED: "#EF4444", // 🔴 Red - Reached dropoff
  
  // Completed (Golden)
  COMPLETED: "#FCD34D", // ✨ Golden - Successfully completed
  FINISHED: "#FCD34D", // ✨ Golden - Finished
  
  // Failed States (Red)
  REJECTED: "#EF4444", // 🔴 Red - Driver rejected
  NO_SHOW: "#EF4444", // 🔴 Red - Customer no-show
  NOSHOW: "#EF4444", // 🔴 Red - Customer no-show (alt)
  RECALLED: "#EF4444", // 🔴 Red - Job recalled
  
  // Cancelled (Light Grey)
  CANCELLED: "#D1D5DB", // ⚪ Light Grey - Cancelled
  
  // Scheduled/Later (Blue)
  SCHEDULED: "#93C5FD", // 🔵 Light Blue - Scheduled for later
  LATER: "#93C5FD", // 🔵 Light Blue - Scheduled for later
  
  // Unknown
  UNKNOWN: "#E5E7EB", // ⚪ Light Grey - Unknown status
};

/**
 * Get job status color
 */
export const getJobStatusColor = (
  status: string | null | undefined
): string => {
  if (!status) return JOB_STATUS_COLORS.UNKNOWN;

  const upperStatus = status.toString().toUpperCase();

  return (
    (JOB_STATUS_COLORS as any)[upperStatus] || JOB_STATUS_COLORS.UNKNOWN
  );
};

/**
 * Get Tailwind CSS classes for job status badges
 */
export const getJobStatusBadgeClass = (
  status: string | null | undefined
): string => {
  if (!status) return "bg-slate-100 text-slate-600 border-slate-300";

  const upperStatus = status.toString().toUpperCase();

  const classMap: Record<string, string> = {
    // Light Green - Unassigned
    UNASSIGNED: "bg-green-50 text-green-700 border-green-200",
    
    // Light Orange - Offered
    OFFERED: "bg-orange-50 text-orange-700 border-orange-200",
    
    // Light Red - Assigned/Accepted/On the way/Arrived
    ASSIGNED: "bg-red-100 text-red-600 border-red-200",
    ACCEPTED: "bg-red-100 text-red-600 border-red-200",
    ON_THE_WAY: "bg-red-100 text-red-600 border-red-200",
    ARRIVED: "bg-red-100 text-red-600 border-red-200",
    
    // Red - Active
    STARTED: "bg-red-50 text-red-700 border-red-300",
    ACTIVE: "bg-red-50 text-red-700 border-red-300",
    REACHED: "bg-red-50 text-red-700 border-red-300",
    
    // Golden - Completed
    COMPLETED: "bg-yellow-50 text-yellow-700 border-yellow-300",
    FINISHED: "bg-yellow-50 text-yellow-700 border-yellow-300",
    
    // Red - Failed
    REJECTED: "bg-red-50 text-red-700 border-red-300",
    NO_SHOW: "bg-red-50 text-red-700 border-red-300",
    NOSHOW: "bg-red-50 text-red-700 border-red-300",
    RECALLED: "bg-red-50 text-red-700 border-red-300",
    
    // Light Grey - Cancelled
    CANCELLED: "bg-slate-100 text-slate-600 border-slate-300",
    
    // Blue - Scheduled/Later
    SCHEDULED: "bg-blue-50 text-blue-700 border-blue-200",
    LATER: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return classMap[upperStatus] || "bg-slate-100 text-slate-600 border-slate-300";
};

/**
 * Get job status text with icon
 */
export const getJobStatusWithIcon = (
  status: string | null | undefined
): string => {
  if (!status) return "❓ Unknown";

  const upperStatus = status.toString().toUpperCase();

  const iconMap: Record<string, string> = {
    UNASSIGNED: "🟢 Unassigned",
    OFFERED: "🟠 Offered",
    ASSIGNED: "🔴 Assigned",
    ACCEPTED: "🔴 Accepted",
    ON_THE_WAY: "🔴 On the Way",
    ARRIVED: "🔴 Arrived",
    STARTED: "🔴 Started",
    ACTIVE: "🔴 Active",
    REACHED: "🔴 Reached",
    COMPLETED: "✨ Completed",
    FINISHED: "✨ Finished",
    REJECTED: "🔴 Rejected",
    NO_SHOW: "🔴 No Show",
    NOSHOW: "🔴 No Show",
    RECALLED: "🔴 Recalled",
    CANCELLED: "⚪ Cancelled",
    SCHEDULED: "🔵 Scheduled",
    LATER: "🔵 Later",
  };

  return iconMap[upperStatus] || "❓ Unknown";
};

