/**
 * Emergency / SOS service — wraps the Wave 2A endpoints:
 *   GET    /api/dispatch/emergencies?status=ACTIVE
 *   PATCH  /api/dispatch/emergencies/:id
 *
 * Plus a shared type used by the header badge + panel.
 */
import api from "./api";

export type EmergencyStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_ALARM";
export type EmergencyRole = "DRIVER" | "PASSENGER" | "CUSTOMER";

export interface Emergency {
  id: string;
  status: EmergencyStatus | string;
  role?: EmergencyRole | string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  jobId?: string | null;
  jobReference?: string | null;
  message?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  createdAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  notes?: string | null;
}

export async function listEmergencies(status?: EmergencyStatus | "ALL"): Promise<Emergency[]> {
  const params: Record<string, string> = {};
  if (status && status !== "ALL") params.status = status;
  try {
    const res = await api.get<any>("/api/dispatch/emergencies", { params });
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.emergencies)) return res.emergencies;
    if (res && Array.isArray(res.data)) return res.data;
    return [];
  } catch (err) {
    // Wave 2A may not be deployed yet — swallow gracefully so the
    // whole dispatch app doesn't crash on startup.
    console.warn("[emergencyService] listEmergencies failed:", err);
    return [];
  }
}

export interface UpdateEmergencyPayload {
  status: EmergencyStatus;
  notes?: string;
}

export async function updateEmergency(id: string, payload: UpdateEmergencyPayload): Promise<Emergency> {
  const res = await api.patch<any>(`/api/dispatch/emergencies/${id}`, payload);
  if (res && res.emergency) return res.emergency as Emergency;
  return res as Emergency;
}
