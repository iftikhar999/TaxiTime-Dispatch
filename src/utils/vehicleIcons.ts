/**
 * Centralized Vehicle Icon Mapping Utility
 * Maps vehicle types to their corresponding SVG icons for map markers and driver cards
 * Supports status-based icons: Free (green), Busy (red), Away (yellow), Clearing (blue)
 * 
 * UPDATED: Now uses ORIGINAL SVG templates from old DispatchConsole
 */

// Import from the SVG templates module for local use
import { getVehicleSvgDataUrl as originalGetVehicleSvgDataUrl } from './vehicleSvgTemplates';

// Re-export from the new SVG templates module
export { getCarSvg, getVehicleSvgDataUrl as getOriginalVehicleSvgDataUrl, getStatusColor, getVanSvg, STATUS_COLORS } from './vehicleSvgTemplates';

export type VehicleType = "sedan" | "suv" | "van" | "motorcycle";
export type DriverStatus = "AVAILABLE" | "BUSY" | "AWAY" | "CLEARING" | "OFFLINE";

// Status to icon file mapping (matches old DispatchConsole naming)
const STATUS_ICON_MAP: Record<DriverStatus, string> = {
  AVAILABLE: 'FreeVehicle.png',   // Green - Free/Available
  BUSY: 'BusyVehicle.png',        // Red - On a job
  AWAY: 'AwayVehicle.png',        // Yellow - Away/Break
  CLEARING: 'ClearingVehicle.png', // Blue - Clearing/Finishing
  OFFLINE: 'AwayVehicle.png',     // Default to Away for offline
};

// Status dot icons for smaller displays
const STATUS_DOT_MAP: Record<DriverStatus, string> = {
  AVAILABLE: 'FreeDot.png',
  BUSY: 'BusyDot.png',
  AWAY: 'AwayDot.png',
  CLEARING: 'ClearingDot.png',
  OFFLINE: 'AwayDot.png',
};

// Vehicle type mapping - maps various input formats to standardized vehicle types
const VEHICLE_TYPE_MAPPING: Record<string, VehicleType> = {
  // Standard types
  sedan: "sedan",
  suv: "suv",
  van: "van",
  motorcycle: "motorcycle",

  // Common variations
  car: "sedan",
  taxi: "sedan",
  saloon: "sedan",
  hatchback: "sedan",
  coupe: "sedan",

  truck: "van",
  pickup: "van",
  minivan: "van",
  bus: "van",

  bike: "motorcycle",
  motorbike: "motorcycle",
  scooter: "motorcycle",

  // Uppercase variations
  SEDAN: "sedan",
  SUV: "suv",
  VAN: "van",
  MOTORCYCLE: "motorcycle",
  CAR: "sedan",
  TRUCK: "van",
  BIKE: "motorcycle",
};

/**
 * Get the standardized vehicle type from various input formats
 */
export const getVehicleType = (vehicleType?: string | null): VehicleType => {
  if (!vehicleType) return "sedan"; // Default fallback

  const normalized = vehicleType.toLowerCase().trim();
  return VEHICLE_TYPE_MAPPING[normalized] || "sedan";
};

/**
 * Normalize driver status to our standard status types
 */
export const normalizeDriverStatus = (status?: string | null): DriverStatus => {
  if (!status) return "OFFLINE";
  
  const normalized = status.toUpperCase().trim();
  
  // Map various status strings to our standard types
  if (normalized.includes('AVAIL') || normalized.includes('FREE') || normalized === 'ONLINE') {
    return 'AVAILABLE';
  }
  if (normalized.includes('BUSY') || normalized.includes('ACTIVE') || normalized.includes('JOB')) {
    return 'BUSY';
  }
  if (normalized.includes('AWAY') || normalized.includes('BREAK') || normalized.includes('PAUSE')) {
    return 'AWAY';
  }
  if (normalized.includes('CLEAR') || normalized.includes('FINISH')) {
    return 'CLEARING';
  }
  
  return 'OFFLINE';
};

/**
 * Get status-based vehicle icon URL (from DispatchConsole icons)
 * These are the classic vehicle icons with status colors
 */
export const getStatusVehicleIconUrl = (status?: string | null): string => {
  const normalizedStatus = normalizeDriverStatus(status);
  const iconFile = STATUS_ICON_MAP[normalizedStatus];
  return `/vehicle-icons/${iconFile}`;
};

/**
 * Get status dot icon URL (smaller version for lists/cards)
 */
export const getStatusDotIconUrl = (status?: string | null): string => {
  const normalizedStatus = normalizeDriverStatus(status);
  const iconFile = STATUS_DOT_MAP[normalizedStatus];
  return `/vehicle-icons/${iconFile}`;
};

/**
 * Get status color for driver based on status
 * Uses the EXACT same colors as the old DispatchConsole
 */
export const getDriverStatusColor = (status?: string | null): string => {
  const normalizedStatus = normalizeDriverStatus(status);
  
  // Colors matching old DispatchConsole exactly:
  // Available = #00e600 (green), Picking = #3333ff (blue), Away = #ffaf1a (yellow), Busy = #ff3333 (red)
  const colors: Record<DriverStatus, string> = {
    AVAILABLE: '#00e600', // Green - matches old "Available"
    BUSY: '#ff3333',      // Red - matches old "Busy"
    AWAY: '#ffaf1a',      // Yellow/Orange - matches old "Away"
    CLEARING: '#3333ff',  // Blue - matches old "Picking"
    OFFLINE: '#808080',   // Gray for offline
  };
  
  return colors[normalizedStatus];
};

/**
 * Generate inline SVG data URL for vehicle marker
 * This creates the SAME taxi icon style as the old DispatchConsole
 * with dynamic color based on driver status
 * 
 * NOW SUPPORTS VEHICLE TYPE: 'car' (sedan) or 'van' (wheelchair van)
 */
export const getVehicleSvgDataUrl = (status?: string | null, vehicleNumber?: string, vehicleType?: string | null): string => {
  // Use the ORIGINAL SVG template function (imported at top as originalGetVehicleSvgDataUrl)
  return originalGetVehicleSvgDataUrl(vehicleType || 'car', status, vehicleNumber);
};

/**
 * Get the SVG/PNG icon URL for a vehicle type
 * Supports both custom uploaded icons and fallback SVG icons
 */
export const getVehicleIconUrl = (
  vehicleType?: string | null,
  customIconPath?: string | null
): string => {
  // If a custom icon path is provided from the database, use it
  if (customIconPath) {
    // Ensure the path starts with /
    const iconPath = customIconPath.startsWith('/') ? customIconPath : `/${customIconPath}`;
    // Return full URL to backend
    const baseUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000');
    return `${baseUrl}${iconPath}`;
  }
  
  // Fallback to standard SVG icons
  const type = getVehicleType(vehicleType);
  return `/shared/assets/vehicle-icons/${type}.svg`;
};

/**
 * Vehicle icon dimensions for different use cases
 */
export const VEHICLE_ICON_SIZES = {
  // Map marker sizes
  map: {
    width: 48,
    height: 32,
    iconAnchor: [24, 16] as [number, number],
    popupAnchor: [0, -16] as [number, number],
  },
  // Retina/high-DPI map markers
  mapRetina: {
    width: 96,
    height: 64,
    iconAnchor: [48, 32] as [number, number],
    popupAnchor: [0, -32] as [number, number],
  },
  // Driver cards and UI elements
  card: {
    width: 32,
    height: 24,
  },
  // Small icons for lists
  small: {
    width: 24,
    height: 18,
  },
};

/**
 * Create a vehicle icon configuration for map markers
 * Now supports custom icons from the database
 */
export const createVehicleIconConfig = (
  vehicleType?: string | null,
  size: "map" | "mapRetina" = "map",
  customIconPath?: string | null
) => {
  const iconUrl = getVehicleIconUrl(vehicleType, customIconPath);
  const dimensions = VEHICLE_ICON_SIZES[size];

  return {
    iconUrl,
    iconSize: [dimensions.width, dimensions.height] as [number, number],
    iconAnchor: dimensions.iconAnchor,
    popupAnchor: dimensions.popupAnchor,
    // For retina displays
    iconRetinaUrl: size === "map" ? getVehicleIconUrl(vehicleType, customIconPath) : undefined,
  };
};

/**
 * Get display name for vehicle type
 */
export const getVehicleDisplayName = (vehicleType?: string | null): string => {
  const type = getVehicleType(vehicleType);

  const displayNames: Record<VehicleType, string> = {
    sedan: "Sedan",
    suv: "SUV",
    van: "Van",
    motorcycle: "Motorcycle",
  };

  return displayNames[type];
};

/**
 * Get vehicle type color (for when icons aren't available)
 */
export const getVehicleTypeColor = (vehicleType?: string | null): string => {
  const type = getVehicleType(vehicleType);

  const colors: Record<VehicleType, string> = {
    sedan: "#3D76F0", // Blue
    suv: "#2FBC7A", // Green
    van: "#FF9F3C", // Orange
    motorcycle: "#F15B6C", // Red/Pink
  };

  return colors[type];
};
