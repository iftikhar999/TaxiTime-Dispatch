import { useCallback, useEffect, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import { createId } from "@paralleldrive/cuid2";

// Module-level dedupe table for driver-rejection toasts. Lives outside any
// React closure so it survives effect re-runs, hot-reloads, and the
// possibility of multiple socket listeners briefly co-existing during
// HMR. Backend emits the SAME job:rejected payload to up to 3 rooms
// (dispatch_, company_, super_admin); the dispatcher's socket may be
// joined to more than one and a retry cascade can replay the event.
// Keyed on jobId alone (not jobId + rejectedAt + reason) to guarantee
// collapse even if payload fields drift between fan-out copies. A real
// second rejection of the same job inside 2s is implausible — the
// driver/timer can't physically generate it that fast.
const REJECTION_DEDUPE_MS = 2000;
const rejectionDedupe = new Map<string, number>();
import {
    AdminUser,
    RideManagement,
    TariffManagement,
    VehicleTypeManagement,
    ZoneManagement,
} from "../config/endpoints";
import { useDispatchSocket } from "../providers/SocketProvider";
import api from "../services/api";
import { registerDispatchRefetch } from "../services/dispatchSyncBus";
import { checkV2Availability, isV2PathUnsupported, markV2PathUnsupported } from "../services/v2/apiClient";
import { getJobs as getV2Jobs } from "../services/v2/jobService";
import { useAuthStore } from "../store/useAuthStore";
import {
    DispatchDriver,
    DispatchJob,
    DispatchZone,
    JobCounters,
    JobStatus,
    useDispatchStore,
} from "../store/useDispatchStore";
import { nowIso } from "../utils/objectUtils";

// Module-scoped bootstrap guard — set when the first `useDispatchController`
// consumer (usually App) completes initialise() for a given user+token. Any
// subsequent consumer (JobBoard / JobDetailsModal / JobComposer) short-
// circuits its own initialise() so we don't multiply every initial-load
// endpoint (health / drivers / zones / counters / jobs / tariffs / vehicle-
// types) by the number of consumers mounted.
const dispatchInitGuard = {
  key: null as string | null,
  inFlight: null as Promise<void> | null,
};

const DRIVER_STATUS_MAP: Record<string, DispatchDriver["status"]> = {
  available: "AVAILABLE",
  online: "AVAILABLE",
  busy: "BUSY",
  onride: "BUSY",
  on_the_way: "ON_THE_WAY",
  roger: "ROGER",
  arrived: "ARRIVED",
  away: "AWAY",
  offline: "OFFLINE",
  suspended: "OFFLINE",
};

const JOB_STATUS_MAP: Record<string, JobStatus | undefined> = {
  pending: "UNASSIGNED",
  unassigned: "UNASSIGNED",
  sending: "OFFERED",
  displayed: "OFFERED",
  offered: "OFFERED",
  accepted: "ASSIGNED",
  assigned: "ASSIGNED",
  on_the_way: "ON_THE_WAY",
  ontheway: "ON_THE_WAY",
  arrived: "ARRIVED",
  arrived_ready: "ARRIVED",
  started: "ACTIVE",
  active: "ACTIVE",
  in_progress: "ACTIVE",
  reached: "ACTIVE",
  completed: "FINISHED",
  finished: "FINISHED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  rejected: "REJECTED",
  noshow: "NOSHOW",
  no_show: "NOSHOW",
  recalled: "RECALLED",
  recall: "RECALLED",
};

const VALID_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  "UNASSIGNED",
  "OFFERED",
  "ASSIGNED",
  "ON_THE_WAY",
  "ARRIVED",
  "REJECTED",
  "NOSHOW",
  "RECALLED",
  "ACTIVE",
  "FINISHED",
  "CANCELLED",
]);

// Status list to request from backend when loading jobs
const DISPATCH_STATUS_QUERY = [
  "UNASSIGNED",
  "PENDING",
  "OFFERED",
  "ASSIGNED",
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
  "STARTED",
  "ACTIVE",
  "IN_PROGRESS",
  "REACHED",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
  "NOSHOW",
  "RECALLED",
].join(",");

const normaliseJobStatus = (
  input: unknown,
  fallback: JobStatus = "UNASSIGNED"
): JobStatus => {
  if (input === null || input === undefined) {
    return fallback;
  }

  const raw = String(input).trim();
  if (!raw.length) {
    return fallback;
  }

  const mapped = JOB_STATUS_MAP[raw.toLowerCase()];
  if (mapped) {
    return mapped;
  }

  const upper = raw.toUpperCase();
  return VALID_JOB_STATUSES.has(upper as JobStatus)
    ? (upper as JobStatus)
    : fallback;
};

const formatDurationMs = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 1) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
};

type TimelineEntry = {
  status: string;
  timestamp: string;
  duration?: string | null;
  isLast?: boolean;
};

const normalizeStatusTimeline = (
  timeline: unknown
): TimelineEntry[] | undefined => {
  if (!timeline) {
    return undefined;
  }

  const toEntryArray = (input: any[]): TimelineEntry[] => {
    const entries: TimelineEntry[] = input
      .map((item) => {
        if (!item) return null;
        if (typeof item.status === "string" && item.timestamp) {
          return {
            status: item.status,
            timestamp: new Date(item.timestamp).toISOString(),
            duration: item.duration ?? null,
            isLast: item.isLast,
          };
        }
        return null;
      })
      .filter(Boolean) as TimelineEntry[];

    entries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      const next = entries[i + 1];
      current.isLast = !next;
      if (next) {
        const durationMs =
          new Date(next.timestamp).getTime() -
          new Date(current.timestamp).getTime();
        current.duration = formatDurationMs(durationMs);
      }
    }
    return entries;
  };

  if (Array.isArray(timeline)) {
    return toEntryArray(timeline);
  }

  if (typeof timeline === "object") {
    const objectEntries = Object.entries(timeline).map(
      ([status, timestamp]) => ({
        status,
        timestamp,
      })
    );
    return toEntryArray(objectEntries);
  }

  if (typeof timeline === "string") {
    try {
      const parsed = JSON.parse(timeline);
      if (Array.isArray(parsed)) {
        return toEntryArray(parsed);
      }
      if (parsed && typeof parsed === "object") {
        return toEntryArray(
          Object.entries(parsed).map(([status, timestamp]) => ({
            status,
            timestamp,
          }))
        );
      }
    } catch (error) {
      console.warn("[mapJob] Failed to parse statusTimeline:", error);
    }
  }

  return undefined;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const toIsoString = (value: unknown): string | undefined => {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const mapDriver = (raw: any): DispatchDriver => {
  const info = raw?.driverInfo ?? raw ?? {};

  const statusKey = String(info.driverStatus ?? raw.status ?? info.status ?? "")
    .toLowerCase()
    .trim();

  let position: DispatchDriver["position"];

  // Try multiple location sources (backend API sends location.latitude, socket sends currentLatitude, position.latitude)
  const lat = toFiniteNumber(
    raw.position?.latitude ??  // ✅ NEW: Socket payload from driver:online
    raw.location?.latitude ?? 
    info.currentLatitude ?? 
    info.latitude
  );
  const lng = toFiniteNumber(
    raw.position?.longitude ??  // ✅ NEW: Socket payload from driver:online
    raw.location?.longitude ?? 
    info.currentLongitude ?? 
    info.longitude
  );
  const heading = toFiniteNumber(
    raw.position?.heading ??  // ✅ NEW: Socket payload from driver:online
    raw.location?.heading ?? 
    info.heading ?? 
    info.currentHeading
  );
  
  const fallbackCoordinates =
    info.currentLocation?.coordinates &&
    Array.isArray(info.currentLocation.coordinates)
      ? info.currentLocation.coordinates
      : undefined;

  if (lat !== undefined && lng !== undefined) {
    position = {
      latitude: lat,
      longitude: lng,
      heading: heading,
    };
    console.log(`📍 Driver ${raw.id} position mapped:`, position);
  } else if (fallbackCoordinates) {
    const fallbackLat = toFiniteNumber(fallbackCoordinates[1]);
    const fallbackLng = toFiniteNumber(fallbackCoordinates[0]);
    if (fallbackLat !== undefined && fallbackLng !== undefined) {
      position = {
        latitude: fallbackLat,
        longitude: fallbackLng,
        heading: toFiniteNumber(info.currentLocation?.heading),
      };
      console.log(`📍 Driver ${raw.id} position mapped (fallback):`, position);
    }
  } else {
    console.warn(`⚠️ Driver ${raw.id} has no valid position data:`, {
      raw_location: raw.location,
      info_currentLatitude: info.currentLatitude,
      info_currentLongitude: info.currentLongitude
    });
  }

  const rides = Array.isArray(info.rides) ? info.rides : [];
  const activeRide = rides.find((ride: any) =>
    [
      "pending",
      "sending",
      "accepted",
      "on_the_way",
      "arrived_ready",
      "started",
    ].includes(String(ride.status).toLowerCase())
  );

  const vehicleNumber =
    raw.vehicle?.plateNumber ??  // ✅ NEW: Socket payload from driver:online
    info.currentVehicleOnboard?.vehicleInfo?.vehicleNumber ??
    info.currentVehicleOnboard?.vehicleInfo?.callSign ??
    raw.vehicleNumber ??
    "N/A";

  const vehicleType =
    raw.vehicle?.type ??  // ✅ NEW: Socket payload from driver:online
    raw.vehicle?.typeName ??  // ✅ NEW: Socket payload from driver:online
    info.currentVehicleOnboard?.vehicleInfo?.vehicleType ??
    info.currentVehicleOnboard?.vehicleInfo?.type ??
    raw.vehicleType ??
    raw.vehicle_type ??
    undefined;

  // ✅ IMPROVED: Build name with better fallback logic
  let name = raw.name?.trim() || '';
  
  // Try firstName + lastName if name is empty
  if (!name) {
    // ✅ FIX: When info === raw (no driverInfo wrapper), avoid duplicating names
    const first = raw.firstName || info.firstName || '';
    const last = raw.lastName || info.lastName || '';
    const firstLast = `${first} ${last}`.trim();
    if (firstLast) {
      name = firstLast;
    }
  }
  
  // Try fullName
  if (!name) {
    name = info.fullName?.trim() || '';
  }
  
  // Try email (extract name part)
  if (!name && (raw.email || info.email)) {
    const email = raw.email || info.email;
    const emailName = email.split('@')[0].replace(/[._-]/g, ' ');
    name = emailName.split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  // Final fallback
  if (!name) {
    const driverId = info.id ?? raw.id ?? raw.driverId ?? 'Unknown';
    name = `Driver ${String(driverId).substring(0, 8)}`;
  }

  const zonePayload = info.currentZone ?? {};
  const queueSource =
    zonePayload.queuePosition ??
    raw.queuePosition ??
    raw.queue_position ??
    null;
  const queuePositionValue =
    queueSource === null || queueSource === undefined
      ? null
      : toFiniteNumber(queueSource) ?? null;

  const ratingSource = info.rating ?? raw.rating;
  let ratingValue: number | undefined;
  if (ratingSource !== undefined && ratingSource !== null) {
    if (typeof ratingSource === "object") {
      const candidate =
        ratingSource.average ??
        ratingSource.score ??
        ratingSource.value ??
        ratingSource.total ??
        ratingSource.overall;
      if (candidate !== undefined && candidate !== null) {
        const numericCandidate = Number(candidate);
        ratingValue = Number.isFinite(numericCandidate)
          ? numericCandidate
          : undefined;
      }
    } else {
      const numericCandidate = Number(ratingSource);
      ratingValue = Number.isFinite(numericCandidate)
        ? numericCandidate
        : undefined;
    }
  }

  const updatedAt =
    toIsoString(info.updatedAt) ??
    toIsoString(raw.updatedAt) ??
    toIsoString(raw.lastUpdate) ??
    toIsoString(raw.location?.timestamp);

  const speedMps =
    toFiniteNumber(info.speed) ??
    toFiniteNumber(info.currentLocation?.speed) ??
    toFiniteNumber(raw.speed);
  const speedKmh =
    speedMps !== undefined ? Math.max(speedMps * 3.6, 0) : undefined;

  const distanceKm =
    raw.distance !== undefined && raw.distance !== null
      ? Number(Number(raw.distance).toFixed(2))
      : undefined;

  const lastUpdateAt = updatedAt ?? nowIso();
  const lastUpdateSource = raw.__source ?? "api";

  return {
    id: info.id ?? raw.id ?? raw.driverId ?? `driver-${createId()}`,
    name: name.length ? name : "Unknown driver",
    vehicle: vehicleNumber,
    vehicleType: vehicleType,
    phone: info.phoneNumber ?? raw.phone ?? raw.phoneNumber ?? undefined,
    email: info.email ?? raw.email ?? undefined,
    status: DRIVER_STATUS_MAP[statusKey] ?? "OFFLINE",
    zoneId:
      zonePayload.id ??
      zonePayload.zoneId ??
      info.currentZone?.zoneName ??
      raw.currentZoneId ??
      undefined,
    zoneName:
      zonePayload.name ??
      info.currentZone?.zoneName ??
      raw.currentZoneName ??
      undefined,
    queuePosition: queuePositionValue,
    lastUpdate: updatedAt,
    currentJobId:
      activeRide?.id ?? info.currentRideId ?? raw.currentJobId ?? undefined,
    position,
    speedKmh: speedKmh ?? null,
    distanceKm: distanceKm ?? null,
    rating: ratingValue,
    lastUpdateAt,
    lastUpdateSource,
  };
};

const mapDriverInfo = (source: any, fallbackId?: string | number | null) => {
  if (!source) {
    return null;
  }

  const rawName = typeof source.name === "string" ? source.name.trim() : "";
  const nameParts = rawName ? rawName.split(/\s+/) : [];
  const firstName = source.firstName ?? (nameParts[0] ?? null);
  const lastName =
    source.lastName ?? (nameParts.length > 1 ? nameParts.slice(1).join(" ") : null);
  const resolvedId =
    source.id ?? source.driverId ?? source.userId ?? fallbackId ?? null;
  const safeId = resolvedId ?? source.email ?? source.phone ?? null;

  if (!safeId && !firstName && !lastName) {
    return null;
  }

  return {
    id: safeId ? String(safeId) : "unknown-driver",
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    phone: source.phone ?? source.mobile ?? undefined,
    email: source.email ?? undefined,
  };
};

// Normalize V2 job payload into legacy shape expected by mapJob
const mapV2JobToLegacy = (raw: any) => {
  if (!raw) return raw;
  return {
    id: raw.id,
    jobId: raw.id,
    reference: raw.id,
    status: raw.status ?? raw.currentStatus ?? raw.jobStatus,
    pickupAddress: raw.pickupLocation?.address ?? raw.pickupAddress,
    pickupLatitude: raw.pickupLocation?.latitude,
    pickupLongitude: raw.pickupLocation?.longitude,
    dropoffAddress: raw.dropoffLocation?.address ?? raw.dropoffAddress,
    dropoffLatitude: raw.dropoffLocation?.latitude,
    dropoffLongitude: raw.dropoffLocation?.longitude,
    customerId: raw.customerId,
    riderName: raw.customer?.name ?? raw.customer?.fullName,
    riderPhone: raw.customer?.phone,
    createdAt: raw.createdAt,
    requestedAt: raw.createdAt,
    actualFare: raw.actualFare ?? raw.finalAmount,
    finalAmount: raw.finalAmount,
    requirements: {
      passengers: raw.requirements?.passengers,
      bags: raw.requirements?.bags,
      wheelchairs: raw.requirements?.wheelchairs,
      vehiclesNeeded: raw.requirements?.vehiclesNeeded,
      currency: raw.requirements?.currency ?? raw.currency,
      fareBreakdown: raw.requirements?.fareBreakdown,
      passengerName: raw.requirements?.passengerName ?? raw.customer?.name,
      passengerPhone: raw.requirements?.passengerPhone ?? raw.customer?.phone,
      passengerEmail: raw.requirements?.passengerEmail ?? raw.customer?.email,
      stops: raw.stops?.map((s: any, idx: number) => ({
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        order: s.sequence ?? idx + 1,
      })),
    },
    stops: raw.stops?.map((s: any, idx: number) => ({
      address: s.address,
      latitude: s.latitude,
      longitude: s.longitude,
      order: s.sequence ?? idx + 1,
    })),
    assignedDriver: raw.driver ?? raw.assignedDriver,
    driverId: raw.driverId ?? raw.assignedDriverId,
    serviceType: raw.serviceType,
    fullRawData: raw,
  };
};

const mapJob = (raw: any): DispatchJob => {
  const rawStatusInput = String(raw.status ?? "").trim();
  const lowercaseStatus = rawStatusInput.toLowerCase();
  const normalizedStatus = rawStatusInput.toUpperCase();
  const mappedStatus = JOB_STATUS_MAP[lowercaseStatus];
  const status: JobStatus =
    mappedStatus ||
    (VALID_JOB_STATUSES.has(normalizedStatus as JobStatus)
      ? (normalizedStatus as JobStatus)
      : "UNASSIGNED");

  // Debug logging for CityCabs company
  // Debug logging removed to reduce console noise

  const normalizeLocation = (
    value: any,
    fallbackAddress?: string
  ):
    | {
        latitude: number;
        longitude: number;
        address?: string;
      }
    | undefined => {
    if (!value) {
      return undefined;
    }

    const source =
      value.coordinates ?? value.location ?? value.position ?? value;

    // Extract raw values BEFORE Number() conversion — null/undefined means "no coordinate"
    const rawLat = source.latitude ?? source.lat ?? source[1] ?? source.y;
    const rawLng = source.longitude ?? source.lng ?? source.lon ?? source[0] ?? source.x;

    // Reject if raw values are null/undefined (no coordinate provided)
    if (rawLat == null || rawLng == null) {
      return undefined;
    }

    const latitude = Number(rawLat);
    const longitude = Number(rawLng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return undefined;
    }

    const address =
      value.address ??
      value.formattedAddress ??
      value.formatted_address ??
      value.name ??
      fallbackAddress;

    return {
      latitude,
      longitude,
      address: address || fallbackAddress,
    };
  };

  const pickupRaw =
    raw.pickupLocation ??
    raw.pickup ??
    (raw.pickupLatitude
      ? {
          latitude: raw.pickupLatitude,
          longitude: raw.pickupLongitude,
          address: raw.pickupAddress,
        }
      : undefined);
  const dropoffRaw =
    raw.dropoffLocation ??
    raw.destination ??
    (raw.dropoffLatitude
      ? {
          latitude: raw.dropoffLatitude,
          longitude: raw.dropoffLongitude,
          address: raw.dropoffAddress,
        }
      : undefined);

  const pickupLocation = normalizeLocation(pickupRaw, raw.pickupAddress);
  const dropoffLocation = normalizeLocation(dropoffRaw, raw.dropoffAddress);

  const pickupAddress =
    pickupLocation?.address ??
    raw.pickupAddress ??
    raw.pickup?.address ??
    raw.pickupLocation?.name ??
    raw.pickupLocation ??
    "Unknown pickup";

  const dropoffAddress =
    dropoffLocation?.address ??
    raw.dropoffAddress ??
    raw.destination?.address ??
    (typeof raw.dropoffLocation === 'string' ? raw.dropoffLocation : null) ??
    null;

  const safeRoutePath = Array.isArray(raw.routePath)
    ? raw.routePath
        .map((coord: any) => {
          const lat = Number(
            coord.lat ?? coord.latitude ?? coord[1] ?? coord.y
          );
          const lng = Number(
            coord.lng ?? coord.longitude ?? coord.lon ?? coord[0] ?? coord.x
          );
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
          }
          return { lat, lng };
        })
        .filter(Boolean)
    : undefined;

  const safeDriverTrail = Array.isArray(raw.driverTrail)
    ? raw.driverTrail
        .map((point: any) => {
          const latitude = Number(
            point.latitude ?? point.lat ?? point[1] ?? point.y
          );
          const longitude = Number(
            point.longitude ?? point.lng ?? point.lon ?? point[0] ?? point.x
          );
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
          }
          return {
            latitude,
            longitude,
            heading:
              point.heading !== undefined && point.heading !== null
                ? Number(point.heading)
                : undefined,
            timestamp:
              point.timestamp ?? point.createdAt ?? point.updatedAt ?? null,
          };
        })
        .filter(Boolean)
    : undefined;

  const rawRequirements =
    raw.fullRawData?.requirements ?? raw.requirements ?? undefined;

  let parsedRequirements: Record<string, any> | undefined;
  if (rawRequirements) {
    if (typeof rawRequirements === "string") {
      try {
        parsedRequirements = JSON.parse(rawRequirements);
      } catch (error) {
        console.warn("[mapJob] Failed to parse requirements JSON:", error);
      }
    } else if (typeof rawRequirements === "object") {
      parsedRequirements = rawRequirements as Record<string, any>;
    }
  }

  const requirementSource = parsedRequirements ?? {};

  const walkInFlag =
    raw.isWalkIn === true ||
    raw.fullRawData?.isWalkIn === true ||
    requirementSource.isWalkIn === true;
  const createdBy =
    raw.createdBy ??
    raw.fullRawData?.createdBy ??
    requirementSource.createdBy ??
    null;
  const createdByDriverRaw =
    raw.createdByDriver ??
    raw.fullRawData?.createdByDriver ??
    requirementSource.createdByDriver ??
    null;

  const driverIdValue =
    raw.driverId ??
    raw.assignedDriverId ??
    raw.assignedDriver?.id ??
    raw.driver?.id ??
    (walkInFlag && createdByDriverRaw?.id ? createdByDriverRaw.id : undefined);

  const assignedDriverRaw =
    raw.assignedDriver ??
    raw.fullRawData?.assignedDriver ??
    (walkInFlag && !raw.assignedDriver ? createdByDriverRaw : null);

  const normalizedAssignedDriver = mapDriverInfo(
    assignedDriverRaw,
    driverIdValue ?? createdByDriverRaw?.id ?? null
  );

  const derivedRideMetrics =
    raw.rideMetrics ??
    raw.fullRawData?.rideMetrics ??
    {
      estimatedDistance:
        raw.fullRawData?.estimatedDistance ??
        raw.estimatedDistance ??
        requirementSource.estimatedDistance ??
        null,
      estimatedDuration:
        raw.fullRawData?.estimatedDuration ??
        raw.estimatedDuration ??
        requirementSource.estimatedDuration ??
        null,
      actualDistance:
        raw.fullRawData?.actualDistance ??
        raw.actualDistance ??
        raw.actualDistanceKm ??
        requirementSource.actualDistance ??
        null,
      actualDuration:
        raw.fullRawData?.actualDuration ??
        raw.actualDuration ??
        raw.actualDurationSeconds ??
        requirementSource.actualDuration ??
        null,
      estimatedPrice:
        raw.fullRawData?.estimatedPrice ??
        raw.estimatedPrice ??
        requirementSource.estimatedPrice ??
        null,
      actualFare:
        raw.fullRawData?.actualFare ??
        raw.actualFare ??
        requirementSource.actualFare ??
        null,
      finalAmount:
        raw.fullRawData?.finalAmount ??
        raw.finalAmount ??
        requirementSource.finalAmount ??
        null,
    };

  const statusTimeline = normalizeStatusTimeline(
    raw.statusTimeline ??
      raw.fullRawData?.statusTimeline ??
      requirementSource.statusTimeline
  );

  return {
    id: String(raw.id ?? raw.rideId ?? raw.reference ?? createId()),
    reference:
      raw.jobId ?? 
      raw.reference ??
      raw.rideId ??
      raw.externalReference ??
      String(raw.id ?? "JOB"),
    pickupAddress,
    dropoffAddress,
    status,
    rawStatus: normalizedStatus,
    requestedAt:
      raw.requestedPickupAt ??
      raw.pickupTime ??
      raw.createdAt ??
      new Date().toISOString(),
    // Enhanced customer name extraction - check fullRawData first!
    riderName:
      raw.fullRawData?.requirements?.passengerName ??
      raw.fullRawData?.riderName ??
      raw.requirements?.passengerName ??
      raw.passenger?.name ??
      raw.rider?.name ??
      raw.clientName ??
      raw.passengerName ??
      (raw.fullRawData?.customer?.firstName && raw.fullRawData?.customer?.lastName ? 
        `${raw.fullRawData.customer.firstName} ${raw.fullRawData.customer.lastName}` : 
        raw.fullRawData?.customer?.firstName ?? raw.fullRawData?.customer?.lastName) ??
      (raw.customer?.firstName && raw.customer?.lastName ? 
        `${raw.customer.firstName} ${raw.customer.lastName}` : 
        raw.customer?.firstName ?? raw.customer?.lastName) ??
      undefined,
    // Enhanced phone extraction - check fullRawData first!
    riderPhone:
      raw.fullRawData?.requirements?.passengerPhone ??
      raw.fullRawData?.riderPhone ??
      raw.requirements?.passengerPhone ??
      raw.passenger?.phone ??
      raw.rider?.phone ??
      raw.phone ??
      raw.fullRawData?.customer?.phone ??
      raw.customer?.phone ??
      undefined,
    // Enhanced email extraction - check fullRawData first!
    riderEmail:
      raw.fullRawData?.requirements?.passengerEmail ??
      raw.fullRawData?.riderEmail ??
      raw.requirements?.passengerEmail ??
      raw.passenger?.email ??
      raw.rider?.email ??
      raw.email ??
      raw.fullRawData?.customer?.email ??
      raw.customer?.email ??
      undefined,
    paymentMethod:
      raw.paymentMethod ??
      raw.fullRawData?.paymentMethod ??
      raw.payment?.method ??
      raw.billing?.paymentMethod ??
      (parsedRequirements?.stripePaymentIntentId ? 'CARD' : undefined) ??
      undefined,
    driverId: driverIdValue ? String(driverIdValue) : undefined,
    // Enhanced tariff extraction - check fullRawData first, then fallback to store lookup
    tariffName: (() => {
      const directName = raw.fullRawData?.tariffName ?? raw.fullRawData?.tariff?.name ?? raw.fullRawData?.tariffs?.name ?? raw.tariff?.name ?? raw.tariffs?.name ?? raw.tariffName ?? parsedRequirements?.tariffName;
      if (directName) return directName;
      // Fallback: look up tariff name from store using tariffId
      const tId = raw.fullRawData?.requirements?.tariffId ?? raw.fullRawData?.tariffId ?? raw.requirements?.tariffId ?? raw.tariffId;
      if (tId) {
        const storeTariffs = useDispatchStore.getState().tariffs;
        const found = storeTariffs.find((t: any) => String(t.id) === String(tId));
        if (found?.name) return found.name;
      }
      return undefined;
    })(),
    tariffId: 
      raw.fullRawData?.requirements?.tariffId ??
      raw.fullRawData?.tariffId ??
      raw.requirements?.tariffId ??
      raw.fullRawData?.tariff?.id ??
      raw.tariff?.id ?? 
      raw.tariffId ?? 
      raw.tariff?.identifier ?? 
      undefined,
    // Enhanced fare extraction - check fullRawData first!
    fareEstimate:
      raw.fullRawData?.estimatedPrice ??
      raw.estimatedPrice ??
      raw.fullRawData?.estimatedFare ??
      raw.estimatedFare ??
      raw.estimatedAmount ??
      raw.earningsSoFar ??
      undefined,
    notes: 
      raw.fullRawData?.requirements?.notes ??
      raw.fullRawData?.notes ??
      raw.requirements?.notes ??
      raw.notes ?? 
      raw.specialInstructions ?? 
      "",
    // Enhanced requirements extraction - check fullRawData first!
    passengers: raw.fullRawData?.requirements?.passengers ?? raw.fullRawData?.passengers ?? raw.requirements?.passengers ?? raw.passengers ?? 1,
    bags: raw.fullRawData?.requirements?.bags ?? raw.fullRawData?.bags ?? raw.requirements?.bags ?? raw.bags ?? 0,
    wheelchairs: raw.fullRawData?.requirements?.wheelchairs ?? raw.fullRawData?.wheelchairs ?? raw.requirements?.wheelchairs ?? raw.wheelchairs ?? 0,
    vehiclesNeeded: raw.fullRawData?.requirements?.vehiclesNeeded ?? raw.fullRawData?.vehiclesNeeded ?? raw.requirements?.vehiclesNeeded ?? raw.vehiclesNeeded ?? 1,
    isWalkIn: walkInFlag,
    createdBy: createdBy ?? null,
    createdByDriver: mapDriverInfo(createdByDriverRaw, driverIdValue) ?? null,
    assignedDriver: normalizedAssignedDriver,
    // Vehicle type for the job
    vehicleType: raw.fullRawData?.vehicleType ?? raw.vehicleType ?? parsedRequirements?.vehicleType ?? undefined,
    vehicleTypeName: (() => {
      const vt = raw.fullRawData?.vehicleType ?? raw.vehicleType ?? parsedRequirements?.vehicleType;
      if (!vt) return undefined;
      // Look up display name from store
      const storeVehicleTypes = useDispatchStore.getState().vehicleTypes;
      const found = storeVehicleTypes.find((t: any) => t.code === vt || t.id === vt || t.name === vt);
      return found?.name ?? vt;
    })(),
    // Enhanced location coordinates - check fullRawData first!
    pickupLat: raw.fullRawData?.pickupLatitude ?? raw.pickupLatitude ?? raw.fullRawData?.pickupLat ?? raw.pickupLat,
    pickupLng: raw.fullRawData?.pickupLongitude ?? raw.pickupLongitude ?? raw.fullRawData?.pickupLng ?? raw.pickupLng,
    dropoffLat: raw.fullRawData?.dropoffLatitude ?? raw.dropoffLatitude ?? raw.fullRawData?.dropoffLat ?? raw.dropoffLat,
    dropoffLng: raw.fullRawData?.dropoffLongitude ?? raw.dropoffLongitude ?? raw.fullRawData?.dropoffLng ?? raw.dropoffLng,
    // Enhanced currency and fare breakdown - check fullRawData first!
    currency: raw.fullRawData?.requirements?.currency ?? raw.fullRawData?.currency ?? raw.requirements?.currency ?? raw.currency ?? "USD",
    baseFare: raw.fullRawData?.requirements?.fareBreakdown?.base ?? raw.fullRawData?.fareBreakdown?.base ?? raw.requirements?.fareBreakdown?.base ?? raw.fareBreakdown?.base,
    distanceFare: raw.fullRawData?.requirements?.fareBreakdown?.distance ?? raw.fullRawData?.fareBreakdown?.distance ?? raw.requirements?.fareBreakdown?.distance ?? raw.fareBreakdown?.distance,
    waitingFare: raw.fullRawData?.requirements?.fareBreakdown?.waiting ?? raw.fullRawData?.fareBreakdown?.waiting ?? raw.requirements?.fareBreakdown?.waiting ?? raw.fareBreakdown?.waiting,
    estimatedDistance: raw.fullRawData?.estimatedDistance ?? raw.estimatedDistance,
    // Customer ID - check fullRawData first!
    customerId: raw.fullRawData?.customerId ?? raw.customerId,
    // Scheduling - check fullRawData first!
    scheduledAt: raw.fullRawData?.scheduledAt ?? raw.scheduledAt ?? raw.scheduledFor ?? raw.scheduledPickupTime ?? undefined,
    scheduledFor: raw.fullRawData?.scheduledAt ?? raw.scheduledAt ?? raw.scheduledFor ?? raw.scheduledPickupTime ?? undefined,
    isScheduled: !!(raw.fullRawData?.scheduledAt ?? raw.scheduledAt ?? raw.fullRawData?.scheduledFor ?? raw.scheduledFor ?? raw.scheduledPickupTime),
    pickupLocation,
    dropoffLocation,
    routePath: safeRoutePath,
    driverTrail: safeDriverTrail,
    // Include full requirements object and customer object from fullRawData!
    requirements: parsedRequirements,
    customer: raw.fullRawData?.customer ?? raw.customer ?? undefined,
    statusTimeline,
    rideMetrics: derivedRideMetrics,
    actualFare:
      raw.actualFare ??
      raw.fullRawData?.actualFare ??
      derivedRideMetrics?.actualFare ??
      undefined,
    finalAmount:
      raw.finalAmount ??
      raw.fullRawData?.finalAmount ??
      derivedRideMetrics?.finalAmount ??
      undefined,
    lastUpdateAt: raw.lastUpdateAt ?? nowIso(),
    lastUpdateSource: raw.__source ?? "api",
    // Payment tracking
    paymentStatus: raw.paymentStatus ?? raw.fullRawData?.paymentStatus ?? parsedRequirements?.paymentStatus ?? (parsedRequirements?.stripePaymentIntentId ? 'PAID' : undefined),
    paymentIntentId: raw.paymentIntentId ?? raw.fullRawData?.paymentIntentId ?? parsedRequirements?.stripePaymentIntentId ?? undefined,
    stripePaymentMethodId: raw.stripePaymentMethodId ?? raw.fullRawData?.stripePaymentMethodId ?? parsedRequirements?.stripePaymentMethodId ?? undefined,
    chargedAmount: raw.chargedAmount ?? raw.fullRawData?.chargedAmount ?? parsedRequirements?.chargedAmount ?? undefined,
    totalCharged: parsedRequirements?.totalCharged ?? raw.fullRawData?.totalCharged ?? undefined,
    paidAt: parsedRequirements?.paidAt ?? raw.fullRawData?.paidAt ?? undefined,
    transactions: (() => {
      const txs = raw.transactions ?? raw.fullRawData?.transactions ?? raw.fullRawData?.payments ?? [];
      return Array.isArray(txs) ? txs : [];
    })(),
    extraCharges: parsedRequirements?.extraCharges ?? raw.fullRawData?.extraCharges ?? [],
    // Offer metadata — kept on the DispatchJob so the JobBoard can render the
    // "Offered → <driver> · <N>s" badge and tick it down in real time. The
    // backend sometimes emits this as `expiresAt` on job:progress:updated and
    // sometimes as `offerExpiresAt` on job:data:updated, so we accept both.
    offerExpiresAt:
      raw.offerExpiresAt ??
      raw.expiresAt ??
      raw.fullRawData?.offerExpiresAt ??
      raw.fullRawData?.expiresAt ??
      parsedRequirements?.offerExpiresAt ??
      undefined,
    offeredDriverId:
      raw.offeredDriverId ??
      raw.fullRawData?.offeredDriverId ??
      parsedRequirements?.offeredDriverId ??
      (status === 'OFFERED' ? driverIdValue ?? raw.assignedDriverId : undefined),
  } as DispatchJob;
};

const mapZone = (raw: any): DispatchZone => {
  const coordinates = Array.isArray(raw.coordinates)
    ? raw.coordinates.map((coord: any) => ({
        lat: Number(coord.lat ?? coord.latitude ?? coord[1]),
        lng: Number(coord.lng ?? coord.longitude ?? coord[0]),
      }))
    : [];

  return {
    id: String(raw.id ?? raw.zoneId ?? createId()),
    name: raw.zoneName ?? raw.name ?? "Zone",
    description: raw.description ?? null,
    polygon: coordinates,
    queue: Array.isArray(raw.queue) ? raw.queue : undefined,
  };
};

const defaultCounters: JobCounters = {
  unassigned: 0,
  offered: 0,
  assigned: 0,
  active: 0,
  finished: 0,
  cancelled: 0,
  noShow: 0,
  rejected: 0,
  recalled: 0,
};

export const useDispatchController = () => {
  // Select auth slices individually to avoid object selector re-creation
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);

  const socket = useDispatchSocket().socket;

  // Select each action individually to keep stable references
  const setJobs = useDispatchStore((state) => state.setJobs);
  const setDrivers = useDispatchStore((state) => state.setDrivers);
  const setZones = useDispatchStore((state) => state.setZones);
  const setTariffs = useDispatchStore((state) => state.setTariffs);
  const setVehicleTypes = useDispatchStore((state) => state.setVehicleTypes);
  const setJobCounters = useDispatchStore((state) => state.setJobCounters);
  const setDispatcher = useDispatchStore((state) => state.setDispatcher);
  const upsertDriver = useDispatchStore((state) => state.upsertDriver);
  const removeDriver = useDispatchStore((state) => state.removeDriver);
  const updateDriverLocation = useDispatchStore(
    (state) => state.updateDriverLocation
  );
  const updateJob = useDispatchStore((state) => state.updateJob);
  const setLoading = useDispatchStore((state) => state.setLoading);
  const setError = useDispatchStore((state) => state.setError);
  const upsertVideoSession = useDispatchStore(
    (state) => state.upsertVideoSession
  );
  const removeVideoSession = useDispatchStore(
    (state) => state.removeVideoSession
  );
  const updateVideoViewerCount = useDispatchStore(
    (state) => state.updateVideoViewerCount
  );
  const assignDriverFromStore = useDispatchStore(
    (state) => state.assignDriver
  );
  const selectedServiceType = useDispatchStore(
    (state) => state.selectedServiceType
  );

  const isInitialised = useRef(false);
  // The controller hook is consumed by App AND JobBoard + JobDetailsModal +
  // JobComposer (they destructure the memoised fetchers). Without a cross-
  // instance guard every call would run its own initialise() on mount,
  // multiplying every dashboard endpoint by ~4. `moduleInitKey` lets a single
  // hook instance per (user,token) pair own the bootstrap; the others reuse
  // the already-fetched store state.
  const moduleInitKey = `${user?.id ?? ''}:${token ? token.slice(-8) : ''}`;
  const jobHydrationRequests = useRef<Map<string, Promise<void>>>(new Map());
  const driverRefreshTimer = useRef<NodeJS.Timeout | null>(null);
  const jobCounterRefreshTimer = useRef<NodeJS.Timeout | null>(null);
  
  // ✅ FIX: Use ref to capture latest selectedServiceType without causing useCallback recreations
  const selectedServiceTypeRef = useRef(selectedServiceType);
  useEffect(() => {
    selectedServiceTypeRef.current = selectedServiceType;
  }, [selectedServiceType]);

  const fetchDrivers = useCallback(async () => {
    try {
      console.log("[Dispatch] Fetching drivers from API...");

      // Check for special modes
      const isForceRefresh =
        localStorage.getItem("dispatch_force_refresh") === "true";
      const isResetMode =
        localStorage.getItem("dispatch_force_clear") === "true";

      if (isForceRefresh) {
        console.log(
          "[Dispatch] 🔄 Force refresh mode - bypassing cache with strong cache busting"
        );
        localStorage.removeItem("dispatch_force_refresh");
      }

      // Add cache busting parameter with enhanced cache control for force refresh
      const cacheBustParam = isForceRefresh
        ? `force_${Date.now()}_${createId()}`
        : Date.now();

      const response = await api.get<any>(AdminUser.GET_ONLINE_DRIVER_LIST, {
        params: {
          _t: cacheBustParam, // Enhanced cache buster for force refresh
          include_offline: false, // Only online drivers
          ...(isForceRefresh && { force_refresh: true }),
        },
        headers: {
          ...(isForceRefresh && {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          }),
        },
      });

      const driverPayloadRoot = (response as any)?.data ?? response;
      const driversPayload = Array.isArray(driverPayloadRoot?.data)
        ? driverPayloadRoot.data
        : Array.isArray(driverPayloadRoot?.drivers)
        ? driverPayloadRoot.drivers
        : Array.isArray(driverPayloadRoot)
        ? driverPayloadRoot
        : [];

      console.log(
        `[Dispatch] API returned ${driversPayload.length} drivers:`,
        driversPayload.map((d: any) => ({
          id: d?.driverInfo?.id ?? d?.id,
          status: d?.driverInfo?.driverStatus ?? d?.status,
          name: d?.name ?? d?.driverInfo?.firstName,
        }))
      );

      // If we're in a reset mode, ignore API data and clear everything
      if (isResetMode) {
        console.log("[Dispatch] Force clear mode - ignoring API data");
        setDrivers([]);
        localStorage.removeItem("dispatch_force_clear");
      } else {
        const mappedDrivers = driversPayload.map(mapDriver);

        if (isForceRefresh) {
          console.log(
            `[Dispatch] 🔄 Force refresh complete - loaded ${mappedDrivers.length} drivers fresh from database`
          );
        }

        setDrivers(mappedDrivers);
      }
    } catch (error) {
      console.error("[Dispatch] Failed to fetch drivers", error);
      setError("Unable to load driver list.");
    }
  }, [setDrivers, setError]);

  const fetchZones = useCallback(async () => {
    try {
      const response = await api.get<any>(ZoneManagement.GET_ALL_ZONES);
      const zonesPayload = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
        ? response
        : [];
      setZones(zonesPayload.map(mapZone));
    } catch (error) {
      console.error("[Dispatch] Failed to fetch zones", error);
      setError("Unable to load zones.");
    }
  }, [setZones, setError]);

  const fetchTariffs = useCallback(async () => {
    try {
      const response = await api.get<any>(TariffManagement.GET_ALL_TARIFFS);
      const data = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
        ? response
        : [];
      setTariffs(data);
    } catch (error) {
      console.error("[Dispatch] Failed to fetch tariffs", error);
      setError("Unable to load tariffs.");
    }
  }, [setTariffs, setError]);

  const fetchVehicleTypes = useCallback(async () => {
    try {
      const response = await api.get<any>(
        VehicleTypeManagement.GET_ALL_VEHICLE_TYPES
      );
      const data = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
        ? response
        : [];
      setVehicleTypes(data);
    } catch (error) {
      console.error("[Dispatch] Failed to fetch vehicle types", error);
      setError("Unable to load vehicle types.");
    }
  }, [setVehicleTypes, setError]);

  const fetchJobCounters = useCallback(async () => {
    try {
      const response = await api.get<{
        success?: boolean;
        data?: Partial<JobCounters>;
      }>("/api/dispatch/jobs/counters");
      const counters =
        (response as any)?.data && typeof (response as any).data === "object"
          ? (response as any).data
          : response;

      console.log("🔍 [fetchJobCounters] Job counters from backend:", counters);

      setJobCounters({ ...defaultCounters, ...(counters || {}) });
    } catch (error) {
      console.error("[Dispatch] Failed to fetch job counters", error);
      setError("Unable to load job statistics.");
    }
  }, [setJobCounters, setError]);

  const scheduleDriversRefresh = useCallback(() => {
    if (driverRefreshTimer.current) {
      return;
    }
    driverRefreshTimer.current = setTimeout(() => {
      fetchDrivers();
      driverRefreshTimer.current = null;
    }, 1500);
  }, [fetchDrivers]);

  const scheduleJobCountersRefresh = useCallback(() => {
    if (jobCounterRefreshTimer.current) {
      return;
    }
    jobCounterRefreshTimer.current = setTimeout(() => {
      fetchJobCounters();
      jobCounterRefreshTimer.current = null;
    }, 600);
  }, [fetchJobCounters]);

  const fetchJobs = useCallback(async () => {
    try {
      let ridesSource: any[] | null = null;

      // Try V2 first if available — but skip if we've already learned this
      // path 404s on the live backend (see apiClient's v2Client interceptor).
      if (!isV2PathUnsupported('/api/v2/jobs')) {
        try {
          const v2Available = await checkV2Availability();
          if (v2Available) {
            console.log("🔍 [fetchJobs] V2 available, fetching via /api/v2/jobs", {
              serviceType: selectedServiceTypeRef.current,
            });
            const { data } = await getV2Jobs(
              selectedServiceTypeRef.current ? { serviceType: selectedServiceTypeRef.current } : {}
            );
            const v2List = Array.isArray(data?.jobs)
              ? data.jobs
              : Array.isArray(data)
              ? data
              : [];
            ridesSource = v2List.map(mapV2JobToLegacy);
          }
        } catch (err: any) {
          if (err?.response?.status === 404) {
            // Belt & braces — the interceptor should have already marked it.
            markV2PathUnsupported('/api/v2/jobs');
          }
          console.warn("[fetchJobs] V2 fetch failed, falling back to V1", err?.message);
        }
      }

      if (!ridesSource) {
        console.log("🔍 [fetchJobs] Fetching jobs from /api/dispatch/jobs");
        const response = await api.get<any>("/api/dispatch/jobs", {
          params: {
            status: DISPATCH_STATUS_QUERY,
          },
        });
        const payload = (response as any)?.data ?? response;
        ridesSource = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : [];
      }

      console.log("🔍 [fetchJobs] Raw jobs from backend:", {
        totalJobs: ridesSource.length,
        jobs: ridesSource.map((j: any) => ({
          id: j.id,
          reference: j.jobId || j.reference,
          rawStatus: j.status,
          pickupAddress: j.pickupAddress,
        })),
      });

      const mappedJobs = ridesSource.map(mapJob);

      console.log("🔍 [fetchJobs] Mapped jobs:", {
        totalJobs: mappedJobs.length,
        byStatus: mappedJobs.reduce((acc: any, job: any) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        }, {}),
        jobs: mappedJobs.map((j: any) => ({
          id: j.id,
          reference: j.reference,
          status: j.status,
          rawStatus: j.rawStatus,
        })),
      });

      setJobs(mappedJobs);
    } catch (error) {
      console.error("[Dispatch] Failed to fetch jobs", error);
      setError("Unable to load jobs.");
    }
  }, [setJobs, setError]); // ✅ FIX: Removed selectedServiceType - now uses ref

  const hydrateJobById = useCallback(
    async (jobId: string, reason: string) => {
      if (!jobId) {
        return;
      }
      const normalizedId = String(jobId);
      if (jobHydrationRequests.current.has(normalizedId)) {
        return jobHydrationRequests.current.get(normalizedId);
      }

      const request = (async () => {
        try {
          console.log(
            `[Dispatch] 🔄 Hydrating job ${normalizedId} (${reason})`
          );
          const response = await api.get<any>(
            `/api/dispatch/jobs/${normalizedId}`
          );
          const payload =
            response?.data?.data ??
            response?.data?.job ??
            response?.data ??
            response;
          if (!payload) {
            console.warn(
              `[Dispatch] Hydration for job ${normalizedId} returned empty payload`
            );
            return;
          }
          const mapped = mapJob({
            ...payload,
            __source: `hydration:${reason}`,
            lastUpdateAt: nowIso(),
          });
          updateJob(mapped);
        } catch (error) {
          console.error(
            `[Dispatch] Failed to hydrate job ${normalizedId} (${reason})`,
            error
          );
        } finally {
          jobHydrationRequests.current.delete(normalizedId);
        }
      })();

      jobHydrationRequests.current.set(normalizedId, request);
      return request;
    },
    [updateJob]
  );

  const createJob = useCallback(
    async (payload: any) => {
      try {
        setLoading(true);
        setError(null);
        await api.post(RideManagement.CREATE_RIDE_BY_DISPATCHER, {
          ...payload,
        });
        await Promise.all([fetchJobs(), fetchJobCounters()]);
      } catch (error) {
        console.error("[Dispatch] Failed to create job", error);
        setError("Unable to create job.");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [fetchJobs, fetchJobCounters, setError, setLoading]
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      try {
        await api.post(RideManagement.CANCEL_RIDE(jobId));
        await Promise.all([fetchJobs(), fetchJobCounters()]);
      } catch (error) {
        console.error("[Dispatch] Failed to cancel job", error);
        setError("Unable to cancel job.");
        throw error;
      }
    },
    [fetchJobs, fetchJobCounters, setError]
  );

  const unassignJob = useCallback(
    async (jobId: string, reason?: string) => {
      try {
        await api.post(`/api/dispatch/jobs/${jobId}/unassign`, {
          reason,
        });
        await Promise.all([fetchJobs(), fetchJobCounters()]);
      } catch (error) {
        console.error("[Dispatch] Failed to unassign job", error);
        setError("Unable to return job to unassigned queue.");
        throw error;
      }
    },
    [fetchJobs, fetchJobCounters, setError]
  );

  const editJob = useCallback(
    async (jobId: string, payload: any) => {
      try {
        await api.patch(`/api/dispatch/jobs/${jobId}`, payload);
        await Promise.all([fetchJobs(), fetchJobCounters()]);
      } catch (error) {
        console.error("[Dispatch] Failed to update job", error);
        setError("Unable to update job details.");
        throw error;
      }
    },
    [fetchJobs, fetchJobCounters, setError]
  );

  const initialise = useCallback(async () => {
    if (!user || !token) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setDispatcher({
        id: user.id,
        name:
          `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email,
        email: user.email,
        companyId: user.companyId ?? null,
      });

      await Promise.all([
        fetchJobCounters(),
        fetchDrivers(),
        fetchZones(),
        fetchTariffs(),
        fetchVehicleTypes(),
        fetchJobs(),
      ]);
    } catch (error) {
      console.error("[Dispatch] Initialisation failed", error);
      setError("Failed to initialise dispatch data.");
    } finally {
      setLoading(false);
    }
  }, [
    user,
    token,
    setDispatcher,
    setLoading,
    setError,
    fetchJobCounters,
    fetchDrivers,
    fetchZones,
    fetchTariffs,
    fetchVehicleTypes,
    fetchJobs,
  ]);

  useEffect(() => {
    if (!user || !token || isInitialised.current) {
      return;
    }
    // Cross-instance guard: the first consumer for this user+token pair
    // owns the bootstrap fetch; everyone else waits on its promise and
    // short-circuits. Eliminates the x4 drivers/zones/counters/jobs fan-out
    // we were seeing on first load.
    if (dispatchInitGuard.key !== moduleInitKey) {
      dispatchInitGuard.key = moduleInitKey;
      dispatchInitGuard.inFlight = initialise().finally(() => {
        isInitialised.current = true;
      });
    } else if (dispatchInitGuard.inFlight) {
      dispatchInitGuard.inFlight.finally(() => {
        isInitialised.current = true;
      });
    } else {
      // Init already completed for this user+token — no-op, store is warm.
      isInitialised.current = true;
    }
  }, [user, token, initialise, moduleInitKey]);

  // Expose a "silent re-sync" to the reconciliation hook so it can heal
  // transient driver/job drift without bothering the dispatcher with a popup.
  useEffect(() => {
    const refetchAll = async () => {
      await Promise.all([fetchDrivers(), fetchJobs(), fetchJobCounters()]);
    };
    return registerDispatchRefetch(refetchAll);
  }, [fetchDrivers, fetchJobs, fetchJobCounters]);

  useEffect(() => {
    useDispatchStore.setState({
      createJob,
      assignDriver: assignDriverFromStore,
      cancelJob,
      unassignJob,
      editJob,
    });
    return () => {
      useDispatchStore.setState({
        createJob: async () => {},
        assignDriver: async () => {},
        cancelJob: async () => {},
        unassignJob: async () => {},
        editJob: async () => {},
      });
    };
  }, [
    createJob,
    assignDriverFromStore,
    cancelJob,
    unassignJob,
    editJob,
  ]);

  const handleVideoOffer = useCallback(
    (payload: any = {}) => {
      if (!payload?.jobId || !payload?.driverId) {
        return;
      }
      upsertVideoSession({
        jobId: String(payload.jobId),
        driverId: String(payload.driverId),
        companyId: payload.companyId ?? null,
        startedAt: payload.startedAt ?? null,
        offer: payload.offer ?? null,
        viewerCount:
          typeof payload.viewerCount === "number" ? payload.viewerCount : 0,
      });
    },
    [upsertVideoSession]
  );

  const handleVideoStopped = useCallback(
    (payload: any = {}) => {
      if (!payload?.jobId) {
        return;
      }
      removeVideoSession(String(payload.jobId));
    },
    [removeVideoSession]
  );

  const handleVideoViewerCount = useCallback(
    (payload: any = {}) => {
      if (!payload?.jobId || typeof payload.viewerCount !== "number") {
        return;
      }
      updateVideoViewerCount(String(payload.jobId), payload.viewerCount);
    },
    [updateVideoViewerCount]
  );

  // Socket listeners
  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleDriverOnline = (payload: any = {}) => {
      console.log("[Dispatch] 🟢 Driver came online - Raw payload:", {
        id: payload?.id,
        name: payload?.name,
        firstName: payload?.firstName,
        lastName: payload?.lastName,
        email: payload?.email,
        status: payload?.status,
        vehicle: payload?.vehicle?.plateNumber,
        position: payload?.position,
        fullPayload: payload,
      });
      
      // ✅ SEAMLESS UPDATE: Add/update driver without refreshing entire list
      if (payload && payload.id) {
        try {
          const mapped = mapDriver({
            ...payload,
            __source: "socket:driver:online",
            lastUpdateAt: payload.updatedAt ?? payload.timestamp ?? nowIso(),
          });
          console.log("[Dispatch] ✅ Mapped driver successfully:", {
            id: mapped.id,
            name: mapped.name,
            status: mapped.status,
            vehicle: mapped.vehicle,
            position: mapped.position,
          });
          upsertDriver(mapped);
          console.log("[Dispatch] ✅ Driver upserted to store:", mapped.id);
        } catch (error) {
          console.error("[Dispatch] ❌ Error mapping driver:", error);
          console.error("[Dispatch] ❌ Problematic payload:", payload);
        }
      } else {
        console.warn("[Dispatch] ⚠️ Driver online payload missing ID:", payload);
        scheduleDriversRefresh();
      }
    };

    const handleDriverOffline = (payload: { driverId: string; reason?: string }) => {
      console.log("[Dispatch] Driver went offline:", payload.driverId, "reason:", payload.reason);
      if (payload?.driverId) {
        // ✅ SEAMLESS UPDATE: Remove driver without refreshing entire list
        console.log("[Dispatch] 🔴 Removing offline driver (seamless):", payload.driverId);
        removeDriver(String(payload.driverId));
        
        // Show toast notification if driver was kicked
        if (payload.reason === 'kicked') {
          toast.info(`Driver has been kicked and logged out`, {
            duration: 3000,
          });
        }
      }
    };

    const handleDriverLocationUpdate = (payload: any) => {
      // Location updates fire every 5s per driver — suppress unless invalid.
      if (!payload?.driverId || !payload?.location) {
        console.warn("[Dispatch] Invalid location update payload", payload);
        return;
      }
      const { latitude, longitude, heading, timestamp } = payload.location;
      const numericLatitude = Number(latitude);
      const numericLongitude = Number(longitude);
      const numericHeading =
        heading !== undefined && heading !== null ? Number(heading) : undefined;

      if (
        !Number.isFinite(numericLatitude) ||
        !Number.isFinite(numericLongitude)
      ) {
        return;
      }

      // ✅ Pass the updatedAt timestamp from payload for real-time tracking
      updateDriverLocation(
        String(payload.driverId), 
        {
          latitude: numericLatitude,
          longitude: numericLongitude,
          heading: Number.isFinite(numericHeading) ? numericHeading : undefined,
        },
        payload.updatedAt || new Date().toISOString()
      );

      // ✨ NEW: Also update app state if included in location payload
      if (payload.appState) {
        const drivers = useDispatchStore.getState().drivers;
        const existingDriver = drivers.find(d => d.id === String(payload.driverId));
        
        if (existingDriver && existingDriver.appState !== payload.appState) {
          console.log(
            `[Dispatch] 📱 App state from location update: ${payload.appState} (isMinimized: ${payload.isMinimized})`
          );
          
          const updatedDriver: DispatchDriver = {
            ...existingDriver,
            appState: payload.appState,
            isMinimized: payload.isMinimized,
            isForeground: payload.isForeground,
            appStateUpdatedAt: timestamp || new Date().toISOString(),
          };
          
          upsertDriver(updatedDriver);
        }
      }

      const driverId = String(payload.driverId);
      const state = useDispatchStore.getState();
      const relatedJob =
        state.jobs.find((job) => job.driverId === driverId) ?? null;

      if (relatedJob) {
        const nextTrail = [
          ...(relatedJob.driverTrail ?? []),
          {
            latitude: numericLatitude,
            longitude: numericLongitude,
            heading: Number.isFinite(numericHeading)
              ? numericHeading
              : undefined,
            timestamp: timestamp ?? new Date().toISOString(),
          },
        ].slice(-60);

        updateJob({
          ...relatedJob,
          driverTrail: nextTrail,
        });
      }
    };

    const handleDriverStatusUpdate = (payload: any = {}) => {
      console.log(
        `%c[Dispatch] Received driver:status:update`,
        "color: green",
        payload
      );

      if (!payload?.driverId) {
        console.warn("[Dispatch] Invalid status update payload", payload);
        return;
      }

      const driverId = String(payload.driverId);
      const statusKey = String(payload.status ?? payload.driverStatus ?? "").toLowerCase().trim();
      const mappedStatus = DRIVER_STATUS_MAP[statusKey] ?? null;
      
      console.log(`[Dispatch] Status update for driver ${driverId}: ${statusKey} -> ${mappedStatus}`);

      // ⚠️ BUG FIX: Don't remove driver if status is null/unknown - only if explicitly OFFLINE
      // If mappedStatus is null but driver has "ONLINE" shift, they should stay visible
      if (mappedStatus === "OFFLINE") {
        console.log(`[Dispatch] 🔴 Removing offline driver (seamless): ${driverId}`);
        removeDriver(driverId);
        return;
      }
      
      // If status is unknown/null, don't remove driver - keep them visible
      if (!mappedStatus) {
        console.warn(`[Dispatch] ⚠️ Unknown status "${statusKey}" for driver ${driverId} - keeping driver visible`);
        return; // Keep driver in list with current status
      }

      // Find existing driver in store
      const drivers = useDispatchStore.getState().drivers;
      const existingDriver = drivers.find(d => d.id === driverId);
      
      if (existingDriver) {
        // ✅ SMART UPDATE: Only update status and currentJobId, preserve everything else
        const updatedDriver: DispatchDriver = {
          ...existingDriver,
          status: mappedStatus || existingDriver.status,
          currentJobId: payload.currentJobId !== undefined ? (payload.currentJobId || undefined) : existingDriver.currentJobId,
          lastUpdateAt: payload.timestamp ?? nowIso(),
          lastUpdateSource: "socket:driver:status",
        };
        
        console.log(
          `[Dispatch] 🔄 Smart status update: ${existingDriver.name} ${existingDriver.status} → ${updatedDriver.status}, jobId: ${existingDriver.currentJobId} → ${updatedDriver.currentJobId}`
        );
        upsertDriver(updatedDriver);
      } else {
        // Driver not in store, do full mapping
        console.log(`[Dispatch] ⚠️ Driver ${driverId} not in store, doing full mapping`);
        const mapped = mapDriver({
          ...payload,
          __source: "socket:driver:status",
          lastUpdateAt: payload.updatedAt ?? payload.timestamp ?? nowIso(),
        });
        console.log("[Dispatch] Mapped driver for store:", mapped);
        upsertDriver(mapped);
      }
    };

    const handleJobDataUpdated = (payload: any) => {
      console.log(
        `%c[Dispatch] Received job:data:updated`,
        "color: orange",
        payload
      );
      if (!payload?.job) {
        console.warn("[Dispatch] Invalid job data payload", payload);
        return;
      }
      const mapped = mapJob({
        ...payload.job,
        __source: "socket:job:data",
        lastUpdateAt: payload.job?.updatedAt ?? payload.job?.timestamp ?? nowIso(),
      });
      console.log("[Dispatch] Mapped job for store:", mapped);
      updateJob(mapped);
      scheduleJobCountersRefresh();

      const state = useDispatchStore.getState();
      const existingJob = state.jobs.find((job) => job.id === mapped.id);
      const missingEssentialInfo =
        !payload.job.pickupAddress &&
        !payload.job.pickupLocation &&
        !payload.job.dropoffAddress &&
        !payload.job.destination;

      if (!existingJob || missingEssentialInfo) {
        hydrateJobById(mapped.id, missingEssentialInfo ? "job:data:partial" : "job:data:new");
      }
    };

  const handleJobProgressUpdated = async (payload: any) => {
      console.log(
        `%c[Dispatch] Received job:progress:updated`,
        "color: #3b82f6",
        payload
      );

      const jobIdCandidates = [
        payload.internalJobId,
        payload.jobId,
        payload.job?.internalJobId,
        payload.job?.id,
        payload.job?.jobId,
        payload.job?.jobCode,
      ]
        .filter((value) => value !== undefined && value !== null)
        .map((value) => String(value));

      if (!jobIdCandidates.length) {
        console.warn(
          "[Dispatch] Unable to resolve job id from progress payload",
          payload
        );
        scheduleJobCountersRefresh();
        return;
      }

      const state = useDispatchStore.getState();
      const existingJob = state.jobs.find((job) =>
        jobIdCandidates.includes(job.id) || jobIdCandidates.includes(job.reference)
      );

      if (!existingJob) {
        console.log(
          `[Dispatch] Job ${jobIdCandidates[0]} not found locally, hydrating record`
        );
        hydrateJobById(jobIdCandidates[0], "job:progress:missing");
        scheduleJobCountersRefresh();
        return;
      }

      const rawStatus = String(
        payload.status ??
          payload.progressStatus ??
          payload.job?.status ??
          existingJob.rawStatus ??
          existingJob.status
      ).toUpperCase();
      const status = normaliseJobStatus(rawStatus, existingJob.status);

      const resetDriverStatuses: ReadonlySet<JobStatus> = new Set([
        "UNASSIGNED",
        "REJECTED",
        "NOSHOW",
        "RECALLED",
        "CANCELLED",
        "FINISHED",
        "COMPLETED" as JobStatus, // ✅ FIX: COMPLETED should also reset driver
      ]);

      const nextDriverId = resetDriverStatuses.has(status)
        ? undefined
        : (payload.driverId ?? payload.assignedDriverId ?? payload.job?.assignedDriverId ?? existingJob.driverId);

      // Capture offer metadata so the JobBoard can render the live countdown
      // as soon as the OFFERED transition arrives. If the job moves out of
      // OFFERED we clear the metadata so the stale countdown doesn't linger.
      const offerExpiresAt =
        status === 'OFFERED'
          ? (payload.expiresAt ?? payload.offerExpiresAt ?? payload.job?.expiresAt ?? payload.job?.offerExpiresAt ?? existingJob.offerExpiresAt)
          : undefined;
      const offeredDriverId =
        status === 'OFFERED'
          ? (payload.driverId ?? payload.assignedDriverId ?? payload.job?.assignedDriverId ?? nextDriverId ?? existingJob.offeredDriverId)
          : undefined;

      const updatedJob = {
        ...existingJob,
        status,
        rawStatus,
        driverId: nextDriverId,
        offerExpiresAt,
        offeredDriverId,
      } as DispatchJob;

      updateJob({
        ...updatedJob,
        lastUpdateAt: payload.timestamp ?? nowIso(),
        lastUpdateSource: "socket:job:progress",
      });
      scheduleJobCountersRefresh();

      console.log(
        `[Dispatch] Job ${updatedJob.id} progress: ${status} (driver: ${nextDriverId ?? "n/a"})`
      );

      // ✅ FIX: Clear driver's currentJobId when job is finished/cancelled/etc
      if (resetDriverStatuses.has(status) && existingJob.driverId) {
        const drivers = useDispatchStore.getState().drivers;
        const driverToUpdate = drivers.find(d => d.id === existingJob.driverId);
        if (driverToUpdate && driverToUpdate.currentJobId === existingJob.id) {
          console.log(
            `[Dispatch] 🔄 Clearing currentJobId for driver ${driverToUpdate.name} (job ${status})`
          );
          // ✅ FIX: Set driver to AVAILABLE for all job-ending statuses, not just FINISHED
          upsertDriver({
            ...driverToUpdate,
            currentJobId: undefined,
            status: "AVAILABLE",
            lastUpdateAt: payload.timestamp ?? nowIso(),
            lastUpdateSource: "socket:job:progress:driver-clear",
          });
        }
      }

      if (status === "RECALLED" || status === "NOSHOW") {
        const label =
          existingJob.reference ||
          existingJob.id ||
          jobIdCandidates[0] ||
          "job";
        const message =
          status === "RECALLED"
            ? `Job ${label} was recalled and returned to Unassigned.`
            : `Job ${label} marked as no-show.`;
        toast(message, {
          icon: status === "RECALLED" ? "↩️" : "🚫",
        });
        
        // ✅ Add notification for NO-SHOW and RECALLED jobs
        const { addNotification } = useDispatchStore.getState();
        addNotification({
          type: status === "RECALLED" ? "RECALLED" : "NOSHOW",
          message,
          jobId: existingJob.id,
          jobReference: existingJob.reference,
        });
        
        fetchZones();
      }
    };

    const handleStopStatusUpdated = (payload: any) => {
      console.log("%c[Dispatch] Received stop:status", "color: teal", payload);
      const jobId =
        payload?.jobId ||
        payload?.job?.id ||
        payload?.job?.jobId ||
        payload?.job?.internalJobId;
      if (jobId) {
        hydrateJobById(String(jobId), "stop:status");
        scheduleJobCountersRefresh();
      }
    };

    const handlePodCaptured = (payload: any) => {
      console.log("%c[Dispatch] Received pod:captured", "color: teal", payload);
      const jobId =
        payload?.jobId ||
        payload?.job?.id ||
        payload?.job?.jobId ||
        payload?.job?.internalJobId;
      if (jobId) {
        hydrateJobById(String(jobId), "pod:captured");
      }
    };

    const handleMeterTelemetryUpdate = (payload: any) => {
      console.log(
        `%c[Dispatch] Received meter:telemetry:update`,
        "color: #10b981",
        payload
      );

      if (!payload?.jobId || !payload?.telemetry) {
        console.warn("[Dispatch] Invalid meter telemetry payload", payload);
        return;
      }

      const telemetry = payload.telemetry;
      const state = useDispatchStore.getState();
      const existingJob = state.jobs.find((job) => job.id === String(payload.jobId));

      if (existingJob) {
        const rideMetrics = {
          ...(existingJob.rideMetrics ?? {}),
          actualDistance:
            telemetry.distanceMeters !== undefined
              ? Number((telemetry.distanceMeters / 1000).toFixed(3))
              : existingJob.rideMetrics?.actualDistance,
          actualDuration:
            telemetry.elapsedSeconds !== undefined
              ? telemetry.elapsedSeconds
              : existingJob.rideMetrics?.actualDuration,
          actualFare:
            telemetry.currentFare !== undefined
              ? telemetry.currentFare
              : existingJob.rideMetrics?.actualFare,
          finalAmount:
            telemetry.currentFare !== undefined
              ? telemetry.currentFare
              : existingJob.rideMetrics?.finalAmount,
        };

        updateJob({
          id: existingJob.id,
          rideMetrics,
          lastUpdateAt: telemetry.timestamp ?? nowIso(),
          lastUpdateSource: "socket:meter",
        });
      }
    };

    // Auto-Dispatch: New ride created
    const handleRideCreated = (payload: any) => {
      if (!payload?.ride) return;
      updateJob(
        mapJob({
          ...payload.ride,
          __source: "socket:ride:created",
        })
      );
      scheduleJobCountersRefresh();
      console.log("[Dispatch] New ride created:", payload.ride.id);
    };

    // Auto-Dispatch: Ride status updated (assigned, rejected, etc.)
    const handleRideUpdated = (payload: any) => {
      if (!payload?.ride) return;
      updateJob(
        mapJob({
          ...payload.ride,
          __source: "socket:ride:updated",
        })
      );
      scheduleJobCountersRefresh();
      if (payload.changes) {
        console.log("[Dispatch] Ride updated:", payload.changes.join(", "));
      }
    };

    // Queue Management: Zone queue updated
    const handleZoneQueueUpdated = (payload: any) => {
      if (!payload?.zoneId) return;
      // Refresh zones to get updated queue data
      fetchZones();
      console.log(
        `[Dispatch] Zone ${payload.zoneId} queue updated:`,
        payload.totalDrivers,
        "drivers"
      );
    };

    // Queue Management: Driver changed zones
    const handleDriverZoneChanged = (payload: any) => {
      if (!payload?.driverId) {
        console.warn("[Dispatch] Invalid zone change payload", payload);
        return;
      }
      // Drop no-op events. The server tightened this on its side, but
      // older backends or stability-pending pings can still emit
      // changed:false → would spam the dispatch console with identical
      // "from X to X" rows. Silently ignore them.
      if (payload.changed === false || payload.pending === true) return;

      // Find existing driver and update their zone
      const drivers = useDispatchStore.getState().drivers;
      const existingDriver = drivers.find(d => d.id === String(payload.driverId));
      // Skip when the zone actually matches what we already have.
      if (
        existingDriver &&
        (existingDriver.zoneId || null) === (payload.zoneId || null)
      ) {
        return;
      }
      if (existingDriver) {
        // Update existing driver with new zone info
        const updatedDriver: DispatchDriver = {
          ...existingDriver,
          zoneId: payload.zoneId || undefined,
          zoneName: payload.zoneName || undefined,
          queuePosition: payload.queuePosition || undefined,
        };
        
        console.log(
          `[Dispatch] 🔄 Driver ${existingDriver.name} zone updated:`,
          {
            from: existingDriver.zoneName || existingDriver.zoneId || "No Zone",
            to: updatedDriver.zoneName || updatedDriver.zoneId || "No Zone",
            queuePosition: updatedDriver.queuePosition
          }
        );
        
        upsertDriver(updatedDriver);
      } else {
        console.warn(`[Dispatch] Driver ${payload.driverId} not found in store for zone update`);
      }
    };

    // ✨ NEW: Handle driver app state changes (foreground/background)
    const handleDriverAppStateUpdate = (payload: any) => {
      console.log(
        `%c[Dispatch] 📱 Received driver:app:state:update`,
        "color: #f97316; font-weight: bold",
        payload
      );
      
      if (!payload?.driverId) {
        console.warn("[Dispatch] Invalid app state payload", payload);
        return;
      }
      
      // Find existing driver and update their app state
      const drivers = useDispatchStore.getState().drivers;
      const existingDriver = drivers.find(d => d.id === String(payload.driverId));
      
      if (existingDriver) {
        const updatedDriver: DispatchDriver = {
          ...existingDriver,
          appState: payload.appState,
          isMinimized: payload.isMinimized,
          isForeground: payload.isForeground,
          appStateUpdatedAt: payload.timestamp,
        };
        
        console.log(
          `[Dispatch] 📱 Driver ${existingDriver.name} app state:`,
          {
            appState: payload.appState,
            isMinimized: payload.isMinimized,
            isForeground: payload.isForeground,
          }
        );
        
        upsertDriver(updatedDriver);
      } else {
        console.warn(`[Dispatch] Driver ${payload.driverId} not found for app state update`);
      }
    };

    // ⚠️ Driver unreachable: socket room is empty when job was assigned
    const handleDriverUnreachable = (payload: any) => {
      console.warn(`[Dispatch] ⚠️ Driver unreachable via socket:`, payload);
      toast(`⚠️ Driver may not receive this job in real-time. Their app will pick it up via polling.`, {
        duration: 8000,
        icon: '⚠️',
      });
    };

    // After a socket reconnect the server-side state may have drifted (jobs
    // assigned / completed, drivers went online/offline) while we were gone.
    // Re-pull the authoritative lists so the UI matches server reality rather
    // than the stale pre-disconnect cache. The underlying `fetchJobs` already
    // prefers V2 and falls back to V1.
    const handleReconnect = () => {
      console.log("[Dispatch] 🔌 Socket reconnected — re-syncing full state");
      Promise.all([
        fetchDrivers(),
        fetchZones(),
        fetchJobs(),
        fetchJobCounters(),
      ]).catch((err) => {
        console.error("[Dispatch] Reconnect re-sync failed", err);
      });
    };

    // ✅ FIXED: Backend now only sends 'driver:online' (kebab-case) - removed duplicate listeners
      socket.on("driver:online", handleDriverOnline);
      socket.on("driver:offline", handleDriverOffline);
      socket.on("driver:kicked", handleDriverOffline); // Also handle kicked event
      socket.on("driver:location:update", handleDriverLocationUpdate);
      socket.on("driver:status:update", handleDriverStatusUpdate); // ✅ FIXED: Match backend event name (no 'd')
      socket.on("driver:status:updated", handleDriverStatusUpdate); // ✅ FIX: Some backend paths use 'updated' suffix
      socket.on("job:data:updated", handleJobDataUpdated);
      socket.on("job:progress:updated", handleJobProgressUpdated);
      socket.on("job:completed", handleJobProgressUpdated); // ✅ FIX: Handle job completion event
      socket.on("job:recalled", handleJobProgressUpdated); // ✅ NEW: Handle recalled jobs
      socket.on("job:noshow", handleJobProgressUpdated); // ✅ NEW: Handle no-show jobs
      // Driver rejected (or auto-reject on offer-timeout). Surface a toast
      // to the dispatcher with the driver name + job reference + reason so
      // they know to act, then fall through to the regular progress handler
      // so the job row refreshes (status will already be REJECTED).
      // The module-level `rejectionDedupe` Map (defined at top of file)
      // collapses the 3 fan-out copies (dispatch_/company_/super_admin
      // rooms) and any retry replay into a single visible toast.
      const handleDriverRejection = (payload: any) => {
        try {
          const rejectedDriverId = payload?.rejectedDriverId || payload?.driverId;
          const jobIdCandidate = String(payload?.internalJobId || payload?.jobId || '');
          // Dedupe on jobId only (not on rejectedAt/reason) — guarantees
          // we collapse the 3-room fan-out into 1 toast even if payload
          // fields drift between copies.
          const dedupeKey = jobIdCandidate || `${rejectedDriverId || ''}|${payload?.rejectedAt || ''}`;
          const now = Date.now();
          // GC stale entries
          for (const [key, ts] of rejectionDedupe) {
            if (now - ts > REJECTION_DEDUPE_MS) rejectionDedupe.delete(key);
          }
          if (rejectionDedupe.has(dedupeKey)) {
            return handleJobProgressUpdated(payload);
          }
          rejectionDedupe.set(dedupeKey, now);

          const drivers = useDispatchStore.getState().drivers;
          const jobs = useDispatchStore.getState().jobs;
          const driver = drivers.find(
            (d: any) => d.id === rejectedDriverId || d.userId === rejectedDriverId
          );
          const driverLabel = driver
            ? (driver.name || `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || `Driver ${String(rejectedDriverId || '').slice(-4)}`)
            : `Driver ${String(rejectedDriverId || '').slice(-4)}`;
          const job = jobs.find(
            (j: any) => j.id === jobIdCandidate || j.reference === jobIdCandidate
          );
          const ref = (job?.reference || job?.id || jobIdCandidate || '').toString().slice(-6).toUpperCase();
          const isTimeout = String(payload?.reason || '').toUpperCase().includes('TIMEOUT');
          const willRetry = String(payload?.broadcastMode || '').toLowerCase() === 'auto';
          const tail = willRetry
            ? ' — auto-dispatching to next driver'
            : ' — please reassign manually';
          const message = isTimeout
            ? `⏱️ ${driverLabel} timed out on job ${ref}${tail}`
            : `🚫 ${driverLabel} rejected job ${ref}${tail}`;
          toast(message, { duration: 6000, icon: isTimeout ? '⏱️' : '🚫' });

          const { addNotification } = useDispatchStore.getState();
          addNotification({
            type: 'job_rejected',
            title: isTimeout ? 'Driver offer timed out' : 'Driver rejected job',
            message,
            jobId: jobIdCandidate || undefined,
            severity: 'warning',
          } as any);
        } catch (toastErr) {
          console.warn('[Dispatch] Failed to render reject toast', toastErr);
        }
        return handleJobProgressUpdated(payload);
      };
      socket.on("job:rejected", handleDriverRejection); // ✅ NEW: Handle driver rejected job
      socket.on("job:accepted", handleJobProgressUpdated); // ✅ NEW: Handle driver accepted job
      socket.on("job:updated", handleJobDataUpdated); // ✅ NEW: Generic job updates
      socket.on("meter:telemetry:update", handleMeterTelemetryUpdate);
      socket.on("ride:created", handleRideCreated);
      socket.on("ride:updated", handleRideUpdated);
      socket.on("zone:queue:updated", handleZoneQueueUpdated);
      socket.on("driver:zone:changed", handleDriverZoneChanged);
      socket.on("driver:app:state:update", handleDriverAppStateUpdate); // ✨ NEW: App state tracking
      socket.on("job:video:offer", handleVideoOffer);
      socket.on("job:video:stopped", handleVideoStopped);
      socket.on("job:video:viewer-count", handleVideoViewerCount);
      socket.on("stop:status", handleStopStatusUpdated);
      socket.on("pod:captured", handlePodCaptured);
      socket.on("driver:unreachable", handleDriverUnreachable);
      // Socket.IO fires `reconnect` on the manager; on the socket itself newer
      // versions also expose it. Register on both so we work across versions.
      socket.on("reconnect", handleReconnect);
      socket.io?.on?.("reconnect", handleReconnect);

    return () => {
      // ✅ FIXED: Backend now only sends 'driver:online' (kebab-case) - removed duplicate listeners
      socket.off("driver:online", handleDriverOnline);
      socket.off("driver:offline", handleDriverOffline);
      socket.off("driver:location:update", handleDriverLocationUpdate);
      socket.off("driver:status:update", handleDriverStatusUpdate); // ✅ FIXED: Match backend event name
      socket.off("driver:status:updated", handleDriverStatusUpdate); // ✅ FIX: Cleanup
      socket.off("job:data:updated", handleJobDataUpdated);
      socket.off("job:progress:updated", handleJobProgressUpdated);
      socket.off("job:completed", handleJobProgressUpdated); // ✅ FIX: Cleanup
      socket.off("job:recalled", handleJobProgressUpdated); // ✅ NEW: Cleanup
      socket.off("job:noshow", handleJobProgressUpdated); // ✅ NEW: Cleanup
      socket.off("job:rejected", handleDriverRejection); // ✅ NEW: Cleanup
      socket.off("job:accepted", handleJobProgressUpdated); // ✅ NEW: Cleanup
      socket.off("job:updated", handleJobDataUpdated); // ✅ NEW: Cleanup
      socket.off("meter:telemetry:update", handleMeterTelemetryUpdate);
      socket.off("ride:created", handleRideCreated);
      socket.off("ride:updated", handleRideUpdated);
      socket.off("zone:queue:updated", handleZoneQueueUpdated);
      socket.off("driver:zone:changed", handleDriverZoneChanged);
      socket.off("driver:app:state:update", handleDriverAppStateUpdate);
      socket.off("job:video:offer", handleVideoOffer);
      socket.off("job:video:stopped", handleVideoStopped);
      socket.off("job:video:viewer-count", handleVideoViewerCount);
      socket.off("stop:status", handleStopStatusUpdated);
      socket.off("pod:captured", handlePodCaptured);
      socket.off("driver:unreachable", handleDriverUnreachable);
      socket.off("reconnect", handleReconnect);
      socket.io?.off?.("reconnect", handleReconnect);
    };
  }, [
    socket,
    fetchDrivers,
    fetchZones,
    fetchJobs,
    fetchJobCounters,
    removeDriver,
    updateDriverLocation,
    updateJob,
    upsertDriver,
  ]);

  return useMemo(
    () => ({
      initialise,
      fetchDrivers,
      fetchZones,
      fetchTariffs,
      fetchVehicleTypes,
      fetchJobs,
      fetchJobCounters,
    }),
    [
      initialise,
      fetchDrivers,
      fetchZones,
      fetchTariffs,
      fetchVehicleTypes,
      fetchJobs,
      fetchJobCounters,
    ]
  );
};
