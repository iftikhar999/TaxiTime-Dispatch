import api from "./api";

export interface Zone {
  id: string;
  name: string;
  description: string;
  color: string;
  isActive: boolean;
  type: "CIRCLE" | "POLYGON" | "RECTANGLE";
  boundaries: any; // Changed from 'geometry' to match database schema
  tariffCount?: number;
  defaultTariffId?: string;
}

export interface ZoneTariff {
  id: string;
  zoneId: string;
  tariffId: string;
  isDefault: boolean;
  priority: number;
  tariff: {
    id: string;
    name: string;
    baseFare: number;
    perKm: number;
    perMinute: number;
    minimumFare: number;
    bookingFee: number;
    isActive: boolean;
  };
}

export interface ZoneDetectionResult {
  zone: Zone | null;
  tariffs: ZoneTariff[];
  defaultTariff: ZoneTariff | null;
}

const BOUNDARY_TOLERANCE_KM = 0.05; // Allow 50m tolerance for boundary checks

/**
 * Check if a point is inside a circle zone
 */
export const isPointInCircle = (
  point: { lat: number; lng: number },
  center: { lat: number; lng: number },
  radiusKm: number
): boolean => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(point.lat - center.lat);
  const dLng = toRad(point.lng - center.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(center.lat)) *
      Math.cos(toRad(point.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance <= radiusKm + BOUNDARY_TOLERANCE_KM;
};

/**
 * Check if a point is inside a polygon zone using ray casting algorithm
 */
export const isPointInPolygon = (
  point: { lat: number; lng: number },
  polygon: Array<{ lat: number; lng: number }>
): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;

    const intersect =
      yi > point.lng !== yj > point.lng &&
      point.lat < ((xj - xi) * (point.lng - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
};

/**
 * Check if a point is inside a rectangle zone
 */
export const isPointInRectangle = (
  point: { lat: number; lng: number },
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  }
): boolean => {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
};

/**
 * Convert degrees to radians
 */
const toRad = (degrees: number): number => {
  return (degrees * Math.PI) / 180;
};

/**
 * Detect which zone a coordinate point belongs to
 */
export const detectZone = async (
  lat: number,
  lng: number
): Promise<ZoneDetectionResult> => {
  try {
    // Call backend API to detect zone
    const response = await api.get("/api/dispatch/zones/detect", {
      params: { lat, lng },
    });

    return response.data;
  } catch (error: any) {
    console.error("Zone detection failed:", error);

    // Fallback: Try client-side detection if backend fails
    try {
      const zonesResponse = await api.get("/api/dispatch/zones");
      const zones: Zone[] = zonesResponse.data.zones || [];

      const point = { lat, lng };

      // Find the first matching zone
      for (const zone of zones) {
        if (!zone.isActive) continue;

        let isInside = false;

        switch (zone.type) {
          case "CIRCLE":
            if (zone.boundaries?.center && zone.boundaries?.radius) {
              isInside = isPointInCircle(
                point,
                zone.boundaries.center,
                zone.boundaries.radius
              );
            }
            break;

          case "POLYGON":
            if (
              zone.boundaries?.coordinates &&
              Array.isArray(zone.boundaries.coordinates)
            ) {
              isInside = isPointInPolygon(point, zone.boundaries.coordinates);
            }
            break;

          case "RECTANGLE":
            if (zone.boundaries?.bounds) {
              isInside = isPointInRectangle(point, zone.boundaries.bounds);
            }
            break;
        }

        if (isInside) {
          // Fetch tariffs for this zone
          const tariffsResponse = await api.get(
            `/api/dispatch/zones/${zone.id}/tariffs`
          );
          const tariffs: ZoneTariff[] = tariffsResponse.data.tariffs || [];
          const defaultTariff =
            tariffs.find((t) => t.isDefault) || tariffs[0] || null;

          return {
            zone,
            tariffs,
            defaultTariff,
          };
        }
      }

      // No zone found
      return {
        zone: null,
        tariffs: [],
        defaultTariff: null,
      };
    } catch (fallbackError) {
      console.error("Client-side zone detection failed:", fallbackError);
      throw error; // Throw original error
    }
  }
};

/**
 * Get all active zones
 */
export const getActiveZones = async (): Promise<Zone[]> => {
  try {
    const response = await api.get("/api/dispatch/zones", {
      params: { active: true },
    });
    return response.data.zones || [];
  } catch (error) {
    console.error("Failed to fetch active zones:", error);
    throw error;
  }
};

/**
 * Get tariffs for a specific zone
 */
export const getZoneTariffs = async (zoneId: string): Promise<ZoneTariff[]> => {
  try {
    const response = await api.get(`/api/dispatch/zones/${zoneId}/tariffs`);
    return response.data.tariffs || [];
  } catch (error) {
    console.error(`Failed to fetch tariffs for zone ${zoneId}:`, error);
    throw error;
  }
};

/**
 * Calculate fare with zone-specific multipliers
 */
export const calculateZoneFare = (
  baseFare: number,
  distanceFare: number,
  waitingFare: number,
  tariff: ZoneTariff
): {
  baseFare: number;
  distanceFare: number;
  waitingFare: number;
  bookingFee: number;
  subtotal: number;
  total: number;
} => {
  const bookingFee = tariff.tariff.bookingFee || 0;
  const subtotal = baseFare + distanceFare + waitingFare;
  const total = subtotal + bookingFee;
  const minimumFare = tariff.tariff.minimumFare || 0;

  return {
    baseFare,
    distanceFare,
    waitingFare,
    bookingFee,
    subtotal,
    total: Math.max(total, minimumFare),
  };
};

/**
 * Validate if a vehicle is approved for a zone
 */
export const validateVehicleZone = async (
  vehicleId: string,
  zoneId: string
): Promise<{
  isApproved: boolean;
  canOperate: boolean;
  message?: string;
}> => {
  try {
    const response = await api.get(
      `/api/dispatch/vehicles/${vehicleId}/zones/${zoneId}/validate`
    );
    return response.data;
  } catch (error) {
    console.error("Vehicle-zone validation failed:", error);
    throw error;
  }
};

/**
 * Get map provider settings
 */
export const getMapSettings = async (): Promise<{
  mapProvider: "GOOGLE_MAPS" | "OPENSTREETMAP";
  placeApiProvider: "GOOGLE_MAPS" | "OPENSTREETMAP";
  defaultLanguage: string;
  defaultCurrency: string;
  defaultTimezone: string;
}> => {
  try {
    const response = await api.get("/api/dispatch/map-settings");
    const payload = (response as any)?.data ?? response;
    return {
      mapProvider: payload?.mapProvider ?? "GOOGLE_MAPS",
      placeApiProvider: payload?.placeApiProvider ?? "GOOGLE_MAPS",
      defaultLanguage: payload?.defaultLanguage ?? "en",
      defaultCurrency: payload?.defaultCurrency ?? "USD",
      defaultTimezone: payload?.defaultTimezone ?? "UTC",
    };
  } catch (error) {
    console.error("Failed to fetch map settings:", error);
    // Return defaults
    return {
      mapProvider: "GOOGLE_MAPS",
      placeApiProvider: "GOOGLE_MAPS",
      defaultLanguage: "en",
      defaultCurrency: "USD",
      defaultTimezone: "UTC",
    };
  }
};
