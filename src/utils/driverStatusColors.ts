/**
 * Driver Status Color Utility for Dispatch System
 */

export const DRIVER_STATUS_COLORS = {
  AVAILABLE: "#22C55E", // ✅ Green - Ready for jobs
  AWAY: "#F97316", // 🟠 Orange - Temporarily unavailable
  BUSY: "#EF4444", // 🔴 Red - On trip/busy with passenger
  ROGER: "#3B82F6", // 🔵 Blue - Job accepted, en route to pickup
  ON_THE_WAY: "#3B82F6", // 🔵 Blue - Heading to pickup (same as ROGER)
  ARRIVED: "#FCA5A5", // 🔴 Light Red - Arrived at pickup/dropoff
  OFFLINE: "#9E9E9E", // ⚪ Grey - Not on shift
  ONLINE: "#22C55E", // ✅ Green - Legacy support (same as AVAILABLE)
  UNKNOWN: "#BDBDBD", // ⚪ Light grey - Unknown status
};

export const getDriverStatusColor = (
  status: string | null | undefined
): string => {
  if (!status) return DRIVER_STATUS_COLORS.UNKNOWN;

  const upperStatus = status.toString().toUpperCase();

  // Handle legacy ONLINE status
  if (upperStatus === "ONLINE") {
    return DRIVER_STATUS_COLORS.AVAILABLE;
  }

  return (
    (DRIVER_STATUS_COLORS as any)[upperStatus] || DRIVER_STATUS_COLORS.UNKNOWN
  );
};

export const getDriverStatusText = (
  status: string | null | undefined
): string => {
  if (!status) return "Unknown";

  const upperStatus = status.toString().toUpperCase();

  switch (upperStatus) {
    case "AVAILABLE":
    case "ONLINE":
      return "Available";
    case "ROGER":
    case "ON_THE_WAY":
      return "En Route";
    case "ARRIVED":
      return "Arrived";
    case "BUSY":
      return "Busy";
    case "AWAY":
      return "Away";
    case "OFFLINE":
      return "Offline";
    default:
      return "Unknown";
  }
};

export const getDriverStatusWithIcon = (
  status: string | null | undefined
): string => {
  if (!status) return "❓ Unknown";

  const upperStatus = status.toString().toUpperCase();

  switch (upperStatus) {
    case "AVAILABLE":
    case "ONLINE":
      return "🟢 Available";
    case "ROGER":
    case "ON_THE_WAY":
      return "🔵 En Route";
    case "ARRIVED":
      return "🔴 Arrived";
    case "BUSY":
      return "🔴 Busy";
    case "AWAY":
      return "🟠 Away";
    case "OFFLINE":
      return "⚫ Offline";
    default:
      return "❓ Unknown";
  }
};
