import v2Client, { v1Client, checkV2Availability } from "./apiClient";

export const SERVICE_TYPES = {
  TAXI: "TAXI",
  DELIVERY: "DELIVERY",
  COURIER: "COURIER",
} as const;

type ServiceType = keyof typeof SERVICE_TYPES;

export const getQuote = async (quoteParams: any) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    try {
      const res = await v2Client.post("/jobs/quote", quoteParams);
      return { data: res.data, version: "v2" as const };
    } catch (error: any) {
      if (error?.response?.status >= 400 && error?.response?.status < 500) {
        throw error;
      }
      console.warn("[JobService] V2 quote failed, fallback to V1?", error?.message);
    }
  }

  if (quoteParams.serviceType && quoteParams.serviceType !== "TAXI") {
    throw new Error("V2 API required for DELIVERY/COURIER quotes");
  }

  const res = await v1Client.post("/dispatch/quote", {
    pickup: quoteParams.pickupLocation,
    dropoff: quoteParams.dropoffLocation,
    vehicleType: quoteParams.vehicleType,
  });
  return { data: res.data, version: "v1" as const };
};

export const createJob = async (jobData: any) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    try {
      const res = await v2Client.post("/jobs", jobData);
      return { data: res.data, version: "v2" as const };
    } catch (error: any) {
      if (error?.response?.status >= 400 && error?.response?.status < 500) {
        throw error;
      }
      console.warn("[JobService] V2 create failed, trying V1", error?.message);
    }
  }

  if (jobData.serviceType && jobData.serviceType !== "TAXI") {
    throw new Error("V2 API required for DELIVERY/COURIER jobs");
  }

  // CRITICAL: preserve driverAssignment / driverId on V1 fallback. Without
  // them V1 defaults broadcastMode to 'auto' and fans the job out to every
  // nearby driver — even when the dispatcher chose 'unassigned'. Pass through
  // every field V1 understands so behaviour is identical to the direct V1
  // path (services/jobService.ts:createJob).
  const v1Payload = {
    pickupAddress: jobData.pickupLocation?.address,
    pickupLat: jobData.pickupLocation?.latitude,
    pickupLng: jobData.pickupLocation?.longitude,
    dropoffAddress: jobData.dropoffLocation?.address,
    dropoffLat: jobData.dropoffLocation?.latitude,
    dropoffLng: jobData.dropoffLocation?.longitude,
    customerId: jobData.customerId,
    passengerName: jobData.passengerName ?? jobData.pickupLocation?.contactName,
    phone: jobData.phone ?? jobData.pickupLocation?.contactPhone,
    email: jobData.email,
    notes: jobData.notes,
    // Driver assignment — must round-trip so V1 honours the dispatcher's choice
    driverAssignment: jobData.driverAssignment,
    driverId: jobData.driverId,
    // Pricing / vehicle / scheduling — preserve so the V1 fallback creates a
    // job with the same shape as the V2 path would have.
    tariffId: jobData.tariffId,
    vehicleType: jobData.vehicleType,
    estimatedFare: jobData.estimatedFare,
    estimatedDistance: jobData.estimatedDistance,
    paymentMethod: jobData.paymentMethod,
    paymentIntentId: jobData.paymentIntentId,
    stripePaymentMethodId: jobData.stripePaymentMethodId,
    currency: jobData.currency,
    scheduledTime: jobData.scheduledAt,
    passengers: jobData.passengers,
    bags: jobData.bags,
    wheelchairs: jobData.wheelchairs,
    vehiclesNeeded: jobData.vehiclesNeeded,
    stops: jobData.stops,
    source: jobData.channel || 'DISPATCH',
  };

  const res = await v1Client.post("/dispatch/jobs", v1Payload);
  return { data: res.data, version: "v1" as const };
};

export const getJobs = async (filters: Record<string, any> = {}) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    try {
      const res = await v2Client.get("/jobs", { params: filters });
      return { data: res.data, version: "v2" as const };
    } catch (error: any) {
      console.warn("[JobService] V2 getJobs failed:", error?.message);
    }
  }

  const res = await v1Client.get("/dispatch/jobs", { params: filters });
  const jobs = Array.isArray(res.data) ? res.data : res.data.jobs || [];
  return {
    data: { jobs: jobs.map(normalizeV1Job), total: jobs.length },
    version: "v1" as const,
  };
};

export const getJobById = async (jobId: string) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    try {
      const res = await v2Client.get(`/jobs/${jobId}`);
      return { data: res.data, version: "v2" as const };
    } catch (error: any) {
      if (error?.response?.status === 404) throw error;
      console.warn("[JobService] V2 getJob failed:", error?.message);
    }
  }

  const res = await v1Client.get(`/dispatch/jobs/${jobId}`);
  return { data: normalizeV1Job(res.data), version: "v1" as const };
};

export const updateJobStatus = async (jobId: string, status: string, metadata: Record<string, any> = {}) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    const res = await v2Client.patch(`/jobs/${jobId}/status`, { status, ...metadata });
    return { data: res.data, version: "v2" as const };
  }
  const res = await v1Client.patch(`/dispatch/jobs/${jobId}`, { status });
  return { data: normalizeV1Job(res.data), version: "v1" as const };
};

export const assignDriver = async (jobId: string, driverId: string) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    const res = await v2Client.post(`/jobs/${jobId}/assign`, { driverId });
    return { data: res.data, version: "v2" as const };
  }
  const res = await v1Client.post(`/dispatch/jobs/${jobId}/assign`, { driverId });
  return { data: res.data, version: "v1" as const };
};

export const cancelJob = async (jobId: string, reason?: string) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    const res = await v2Client.post(`/jobs/${jobId}/cancel`, { reason });
    return { data: res.data, version: "v2" as const };
  }
  const res = await v1Client.post(`/dispatch/jobs/${jobId}/cancel`, { reason });
  return { data: res.data, version: "v1" as const };
};

export const getJobsByServiceType = async (serviceType: ServiceType, filters: Record<string, any> = {}) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error("V2 API required for service type filtering");
  const res = await v2Client.get("/jobs", { params: { ...filters, serviceType } });
  return { data: res.data, version: "v2" as const };
};

const normalizeV1Job = (job: any) => {
  if (!job) return null;
  return {
    id: job.id,
    companyId: job.companyId,
    serviceType: job.type || "TAXI",
    status: job.status,
    customerId: job.customerId,
    driverId: job.driverId,
    pickupLocation: {
      address: job.pickupAddress,
      latitude: job.pickupLatitude,
      longitude: job.pickupLongitude,
      contactName: job.passengerName,
      contactPhone: job.passengerPhone,
    },
    dropoffLocation: {
      address: job.dropoffAddress,
      latitude: job.dropoffLatitude,
      longitude: job.dropoffLongitude,
    },
    stops: [],
    fare: job.fare,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    _v1Original: job,
  };
};

export default {
  SERVICE_TYPES,
  getQuote,
  createJob,
  getJobs,
  getJobById,
  updateJobStatus,
  assignDriver,
  cancelJob,
  getJobsByServiceType,
};
