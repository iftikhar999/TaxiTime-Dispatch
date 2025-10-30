/**
 * Job Service
 * Handles job/ride creation and management for dispatch
 */

import { api } from "./api";

export interface CreateJobPayload {
  // Customer
  customerId?: string;
  passengerName: string;
  phone: string;
  email?: string;

  // Locations
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;

  // Pricing
  tariffId: string;
  estimatedDistance: number;
  estimatedFare: number;
  baseFare?: number;
  distanceFare?: number;
  waitingFare?: number;

  // Schedule
  scheduledFor?: Date | string;

  // Job details
  notes?: string;
  validationCode?: string;
  passengers?: number;
  bags?: number;
  wheelchairs?: number;
  vehiclesNeeded?: number;

  // Payment
  paymentMethod: "cash" | "card";
  paymentIntentId?: string;
  currency?: string;

  // Driver assignment
  driverAssignment?: "manual" | "auto" | "unassigned";
  driverId?: string;
}

export interface JobResponse {
  success: boolean;
  message: string;
  data: {
    id: string;
    rideId: string;
    status: string;
    pickupLocation: string;
    dropoffLocation: string;
    fare: number;
    driverId?: string;
  };
  dispatch?: {
    success: boolean;
    driverId?: string;
    message: string;
  };
}

export interface AssignDriverPayload {
  jobId: string;
  driverId: string;
  status?: string;
}

/**
 * Create a new job/ride
 */
export async function createJob(
  payload: CreateJobPayload
): Promise<JobResponse> {
  try {
    const response = await api.post<JobResponse>("/api/dispatch/jobs", {
      // Customer info
      customerId: payload.customerId,
      passengerName: payload.passengerName,
      phone: payload.phone,
      email: payload.email,

      // Locations
      pickup: {
        address: payload.pickupAddress,
        lat: payload.pickupLat,
        lng: payload.pickupLng,
      },
      destination: {
        address: payload.dropoffAddress,
        lat: payload.dropoffLat,
        lng: payload.dropoffLng,
      },

      // Pricing
      tariffId: payload.tariffId,
      estimatedDistance: payload.estimatedDistance,
      estimatedFare: payload.estimatedFare,
      fareBreakdown: {
        base: payload.baseFare,
        distance: payload.distanceFare,
        waiting: payload.waitingFare,
      },

      // Schedule
      scheduledFor: payload.scheduledFor,
      scheduledTime: payload.scheduledFor, // Backend CREATE endpoint expects 'scheduledTime'

      // Job details
      notes: payload.notes,
      validationCode: payload.validationCode,
      requirements: {
        passengers: payload.passengers || 1,
        bags: payload.bags || 0,
        wheelchairs: payload.wheelchairs || 0,
        vehiclesNeeded: payload.vehiclesNeeded || 1,
        currency: payload.currency,
      },

      // Payment
      paymentMethod: payload.paymentMethod,
      paymentIntentId: payload.paymentIntentId,

      // Driver assignment
      driverAssignment: payload.driverAssignment || "auto",
      driverId: payload.driverId,
    });

    return response;
  } catch (error) {
    console.error("Create job error:", error);
    throw error;
  }
}

/**
 * Assign driver to a job
 */
export async function assignDriverToJob(
  jobId: string,
  driverId: string,
  status?: string
): Promise<JobResponse> {
  try {
    const response = await api.post<JobResponse>(
      `/api/dispatch/jobs/${jobId}/assign`,
      {
        driverId,
        status: status || "OFFERED",
      }
    );

    return response;
  } catch (error) {
    console.error("Assign driver error:", error);
    throw error;
  }
}

/**
 * Cancel a job
 */
export async function cancelJob(
  jobId: string,
  reason?: string
): Promise<JobResponse> {
  try {
    const response = await api.post<JobResponse>(
      `/api/dispatch/jobs/${jobId}/cancel`,
      {
        reason,
      }
    );

    return response;
  } catch (error) {
    console.error("Cancel job error:", error);
    throw error;
  }
}

export async function unassignJob(
  jobId: string,
  reason?: string
): Promise<JobResponse> {
  const response = await api.post<JobResponse>(
    `/api/dispatch/jobs/${jobId}/unassign`,
    {
      reason,
    }
  );
  return response;
}

export interface UpdateJobPayload {
  pickup?: {
    address: string;
    latitude: number;
    longitude: number;
  };
  dropoff?: {
    address: string;
    latitude: number;
    longitude: number;
  };
  vehicleType?: string;
  notes?: string;
  instructions?: string;
  tariffId?: string;
  recalculateFare?: boolean;
  // Extended fields for comprehensive job editing
  customerId?: string;
  passengerName?: string;
  phone?: string;
  email?: string;
  passengers?: number;
  bags?: number;
  wheelchairs?: number;
  vehiclesNeeded?: number;
  paymentMethod?: "cash" | "card";
  scheduledFor?: Date | string;
  validationCode?: string;
  currency?: string;
  // Driver assignment
  driverAssignment?: "manual" | "auto" | "unassigned";
  driverId?: string;
}

export async function updateJob(
  jobId: string,
  payload: UpdateJobPayload
): Promise<JobResponse> {
  const response = await api.patch<JobResponse>(
    `/api/dispatch/jobs/${jobId}`,
    payload
  );
  return response;
}

/**
 * Get jobs for company (dispatcher view)
 */
export async function getCompanyJobs(params?: {
  status?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}): Promise<any> {
  try {
    const response = await api.get("/api/dispatch/jobs", { params });
    return response;
  } catch (error) {
    console.error("Get company jobs error:", error);
    throw error;
  }
}
