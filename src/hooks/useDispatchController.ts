import { useCallback, useEffect, useMemo, useRef } from "react";
import {
    AdminUser,
    RideManagement,
    TariffManagement,
    VehicleTypeManagement,
    ZoneManagement,
} from "../config/endpoints";
import { useDispatchSocket } from "../providers/SocketProvider";
import api from "../services/api";
import { useAuthStore } from "../store/useAuthStore";
import {
    DispatchDriver,
    DispatchJob,
    DispatchZone,
    JobCounters,
    JobStatus,
    useDispatchStore,
} from "../store/useDispatchStore";

const DRIVER_STATUS_MAP: Record<string, DispatchDriver["status"]> = {
  available: "AVAILABLE",
  online: "AVAILABLE",
  busy: "BUSY",
  onride: "BUSY",
  on_the_way: "BUSY",
  roger: "ROGER", // On the way to pickup
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
  on_the_way: "ASSIGNED",
  ontheway: "ASSIGNED",
  arrived: "ASSIGNED",
  arrived_ready: "ASSIGNED",
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
  "REJECTED",
  "NOSHOW",
  "RECALLED",
  "ACTIVE",
  "FINISHED",
  "CANCELLED",
]);

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

  // Try multiple location sources (backend API sends location.latitude, socket sends currentLatitude)
  const lat = toFiniteNumber(
    raw.location?.latitude ?? 
    info.currentLatitude ?? 
    info.latitude
  );
  const lng = toFiniteNumber(
    raw.location?.longitude ?? 
    info.currentLongitude ?? 
    info.longitude
  );
  const heading = toFiniteNumber(
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
    info.currentVehicleOnboard?.vehicleInfo?.vehicleNumber ??
    info.currentVehicleOnboard?.vehicleInfo?.callSign ??
    raw.vehicleNumber ??
    "N/A";

  const vehicleType =
    info.currentVehicleOnboard?.vehicleInfo?.vehicleType ??
    info.currentVehicleOnboard?.vehicleInfo?.type ??
    raw.vehicleType ??
    raw.vehicle_type ??
    undefined;

  // ✅ IMPROVED: Build name with better fallback logic
  let name = raw.name?.trim() || '';
  
  // Try firstName + lastName if name is empty
  if (!name) {
    const firstLast = [raw.firstName, raw.lastName, info.firstName, info.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
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

  return {
    id: info.id ?? raw.id ?? raw.driverId ?? `driver-${Math.random()}`,
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
  console.log("🔍 [mapJob] Processing job:", {
    jobId: raw.id,
    reference: raw.jobId || raw.reference,
    rawStatus: normalizedStatus,
    mappedStatus: status,
    fullRawData: raw,
  });

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

    const latitude = Number(
      source.latitude ?? source.lat ?? source[1] ?? source.y
    );
    const longitude = Number(
      source.longitude ?? source.lng ?? source.lon ?? source[0] ?? source.x
    );

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
    raw.dropoffLocation?.name ??
    raw.dropoffLocation ??
    "Unknown dropoff";

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

  return {
    id: String(raw.id ?? raw.rideId ?? raw.reference ?? Math.random()),
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
      raw.payment?.method ??
      raw.billing?.paymentMethod ??
      undefined,
    driverId:
      raw.driverId ??
      raw.assignedDriverId ??
      raw.assignedDriver?.id ??
      raw.driver?.id ??
      undefined,
    // Enhanced tariff extraction - check fullRawData first!
    tariffName: raw.fullRawData?.tariff?.name ?? raw.tariff?.name ?? raw.tariffName ?? undefined,
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
    requirements: raw.fullRawData?.requirements ?? raw.requirements ?? undefined,
    customer: raw.fullRawData?.customer ?? raw.customer ?? undefined,
  };
};

const mapZone = (raw: any): DispatchZone => {
  const coordinates = Array.isArray(raw.coordinates)
    ? raw.coordinates.map((coord: any) => ({
        lat: Number(coord.lat ?? coord.latitude ?? coord[1]),
        lng: Number(coord.lng ?? coord.longitude ?? coord[0]),
      }))
    : [];

  return {
    id: String(raw.id ?? raw.zoneId ?? Math.random()),
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
  const assignDriverFromStore = useDispatchStore(
    (state) => state.assignDriver
  );

  const isInitialised = useRef(false);

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
        ? `force_${Date.now()}_${Math.random()}`
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

  const fetchJobs = useCallback(async () => {
    try {
      console.log("🔍 [fetchJobs] Fetching jobs from /api/dispatch/jobs");
      const response = await api.get<any>("/api/dispatch/jobs");
      const payload = (response as any)?.data ?? response;
      const ridesSource = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];

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
  }, [setJobs, setError]);

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
    initialise().finally(() => {
      isInitialised.current = true;
    });
  }, [user, token, initialise]);

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

  // Socket listeners
  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleDriverOnline = (payload: any) => {
      console.log("[Dispatch] 🟢 Driver came online - Raw payload:", {
        id: payload?.id,
        name: payload?.name,
        firstName: payload?.firstName,
        lastName: payload?.lastName,
        email: payload?.email,
        status: payload?.status,
        vehicle: payload?.vehicle?.plateNumber,
        fullPayload: payload,
      });
      
      // ✅ SEAMLESS UPDATE: Add/update driver without refreshing entire list
      if (payload && payload.id) {
        const mapped = mapDriver(payload);
        console.log("[Dispatch] ✅ Mapped driver:", {
          id: mapped.id,
          name: mapped.name,
          status: mapped.status,
          vehicle: mapped.vehicle,
          position: mapped.position,
        });
        upsertDriver(mapped);
      } else {
        console.warn("[Dispatch] ⚠️ Driver online payload missing ID:", payload);
      }
    };

    const handleDriverOffline = (payload: { driverId: string }) => {
      console.log("[Dispatch] Driver went offline:", payload.driverId);
      if (payload?.driverId) {
        // ✅ SEAMLESS UPDATE: Remove driver without refreshing entire list
        console.log("[Dispatch] 🔴 Removing offline driver (seamless):", payload.driverId);
        removeDriver(String(payload.driverId));
      }
    };

    const handleDriverLocationUpdate = (payload: any) => {
      console.log(
        `%c[Dispatch] Received driver:location:update`,
        "color: blue",
        payload
      );
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

    const handleDriverStatusUpdate = (payload: any) => {
      console.log(
        `%c[Dispatch] Received driver:status:updated`,
        "color: green",
        payload
      );

      if (!payload?.driverId) {
        console.warn("[Dispatch] Invalid status update payload", payload);
        return;
      }

      const mapped = mapDriver(payload);
      console.log("[Dispatch] Mapped driver for store:", mapped);

      // If driver goes offline, remove them from the list
      if (mapped.status === "OFFLINE") {
        console.log(`[Dispatch] 🔴 Removing offline driver (seamless): ${mapped.id}`);
        removeDriver(mapped.id);
        // ✅ REMOVED: fetchDrivers() - causes entire list to refresh and shows "Unknown driver"
      } else {
        // ✅ SEAMLESS UPDATE: Update driver status without refreshing entire list
        console.log(`[Dispatch] 🔄 Updating driver status (seamless): ${mapped.name} → ${mapped.status}`);
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
      const mapped = mapJob(payload.job);
      console.log("[Dispatch] Mapped job for store:", mapped);
      updateJob(mapped);
      fetchJobCounters();
    };

    const handleJobProgressUpdated = (payload: any) => {
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
        console.warn("[Dispatch] Unable to resolve job id from progress payload", payload);
        fetchJobs();
        fetchJobCounters();
        return;
      }

      const state = useDispatchStore.getState();
      const existingJob = state.jobs.find((job) =>
        jobIdCandidates.includes(job.id) || jobIdCandidates.includes(job.reference)
      );

      if (!existingJob) {
        console.log(
          `[Dispatch] Job ${jobIdCandidates[0]} not found locally, refreshing list`
        );
        fetchJobs();
        fetchJobCounters();
        return;
      }

      const rawStatus = String(
        payload.status ?? payload.progressStatus ?? existingJob.rawStatus ?? existingJob.status
      ).toUpperCase();
      const status = normaliseJobStatus(rawStatus, existingJob.status);

      const resetDriverStatuses: ReadonlySet<JobStatus> = new Set([
        "UNASSIGNED",
        "REJECTED",
        "NOSHOW",
        "RECALLED",
        "CANCELLED",
        "FINISHED",
      ]);

      const nextDriverId = resetDriverStatuses.has(status)
        ? undefined
        : (payload.driverId ?? payload.assignedDriverId ?? payload.job?.assignedDriverId ?? existingJob.driverId);

      const updatedJob = {
        ...existingJob,
        status,
        rawStatus,
        driverId: nextDriverId,
      } as DispatchJob;

      updateJob(updatedJob);
      fetchJobCounters();

      console.log(
        `[Dispatch] Job ${updatedJob.id} progress: ${status} (driver: ${nextDriverId ?? "n/a"})`
      );
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

      // Store telemetry in Zustand or display in UI
      // For now, just log - can extend to update job details modal
      console.log(
        `[Dispatch] Meter update - Job ${payload.jobId}: ${
          payload.telemetry.elapsedSeconds
        }s, ${(payload.telemetry.distanceMeters / 1000).toFixed(2)}km, $${
          payload.telemetry.currentFare?.toFixed(2) || "0.00"
        }`
      );
    };

    // Auto-Dispatch: New ride created
    const handleRideCreated = (payload: any) => {
      if (!payload?.ride) return;
      updateJob(mapJob(payload.ride));
      fetchJobCounters();
      console.log("[Dispatch] New ride created:", payload.ride.id);
    };

    // Auto-Dispatch: Ride status updated (assigned, rejected, etc.)
    const handleRideUpdated = (payload: any) => {
      if (!payload?.ride) return;
      updateJob(mapJob(payload.ride));
      fetchJobCounters();
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
      console.log(
        `%c[Dispatch] 📍 Received driver:zone:changed event`,
        "color: purple; font-weight: bold",
        payload
      );
      if (!payload?.driverId) {
        console.warn("[Dispatch] Invalid zone change payload", payload);
        return;
      }
      
      // Find existing driver and update their zone
      const drivers = useDispatchStore.getState().drivers;
      const existingDriver = drivers.find(d => d.id === String(payload.driverId));
      
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
      // ✅ FIXED: Backend now only sends 'driver:online' (kebab-case) - removed duplicate listeners
      socket.on("driver:online", handleDriverOnline);
      socket.on("driver:offline", handleDriverOffline);
    socket.on("driver:location:update", handleDriverLocationUpdate);
    socket.on("driver:status:updated", handleDriverStatusUpdate);
    socket.on("job:data:updated", handleJobDataUpdated);
    socket.on("job:progress:updated", handleJobProgressUpdated);
    socket.on("job:recalled", handleJobProgressUpdated); // ✅ NEW: Handle recalled jobs
    socket.on("job:noshow", handleJobProgressUpdated); // ✅ NEW: Handle no-show jobs
    socket.on("job:updated", handleJobDataUpdated); // ✅ NEW: Generic job updates
    socket.on("meter:telemetry:update", handleMeterTelemetryUpdate);
    socket.on("ride:created", handleRideCreated);
    socket.on("ride:updated", handleRideUpdated);
    socket.on("zone:queue:updated", handleZoneQueueUpdated);
    socket.on("driver:zone:changed", handleDriverZoneChanged);
    socket.on("driver:app:state:update", handleDriverAppStateUpdate); // ✨ NEW: App state tracking

    return () => {
      // ✅ FIXED: Backend now only sends 'driver:online' (kebab-case) - removed duplicate listeners
      socket.off("driver:online", handleDriverOnline);
      socket.off("driver:offline", handleDriverOffline);
      socket.off("driver:location:update", handleDriverLocationUpdate);
      socket.off("driver:status:updated", handleDriverStatusUpdate);
      socket.off("job:data:updated", handleJobDataUpdated);
      socket.off("job:progress:updated", handleJobProgressUpdated);
      socket.off("job:recalled", handleJobProgressUpdated); // ✅ NEW: Cleanup
      socket.off("job:noshow", handleJobProgressUpdated); // ✅ NEW: Cleanup
      socket.off("job:updated", handleJobDataUpdated); // ✅ NEW: Cleanup
      socket.off("meter:telemetry:update", handleMeterTelemetryUpdate);
      socket.off("ride:created", handleRideCreated);
      socket.off("ride:updated", handleRideUpdated);
      socket.off("zone:queue:updated", handleZoneQueueUpdated);
      socket.off("driver:zone:changed", handleDriverZoneChanged);
      socket.off("driver:app:state:update", handleDriverAppStateUpdate);
    };
  }, [
    socket,
    fetchDrivers,
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
