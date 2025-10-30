/**
 * Centralized Vehicle Icon Mapping Utility
 * Maps vehicle types to their corresponding SVG icons for map markers and driver cards
 */

export type VehicleType = "sedan" | "suv" | "van" | "motorcycle";

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
    return `${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000'}${iconPath}`;
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
