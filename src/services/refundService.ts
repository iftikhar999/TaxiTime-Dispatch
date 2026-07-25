/**
 * Refund service — wraps the Wave 2A backend endpoints:
 *   GET  /api/admin/refunds
 *   POST /api/admin/refunds
 *   GET  /api/admin/refunds/:id
 *
 * The modal / list view hit these directly. Wrapped here so if the
 * backend path changes we only need to update one file.
 */
import api from "./api";

export type RefundStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export type RefundReason =
  | "duplicate"
  | "fraudulent"
  | "requested_by_customer"
  | "other";

export interface Refund {
  id: string;
  paymentId: string;
  jobId?: string | null;
  jobReference?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  amount: number;
  currency?: string;
  reason: RefundReason | string;
  reasonText?: string | null;
  status: RefundStatus | string;
  createdAt: string;
  requestedBy?: string | null;
  requestedByName?: string | null;
  stripeRefundId?: string | null;
  notes?: string | null;
}

export interface RefundListFilters {
  companyId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  jobId?: string;
  paymentId?: string;
  page?: number;
  pageSize?: number;
}

export interface RefundListResponse {
  refunds: Refund[];
  total?: number;
  page?: number;
  pageSize?: number;
}

export interface CreateRefundPayload {
  paymentId?: string;
  jobId?: string;
  amount: number;
  reason: RefundReason | string;
  reasonText?: string;
  currency?: string;
}

/**
 * List refunds. Returns a typed response — backend may return
 * either a bare array or a paginated shape, both are handled.
 */
export async function listRefunds(filters: RefundListFilters = {}): Promise<RefundListResponse> {
  const params: Record<string, string> = {};
  if (filters.companyId) params.companyId = filters.companyId;
  if (filters.status) params.status = filters.status;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.jobId) params.jobId = filters.jobId;
  if (filters.paymentId) params.paymentId = filters.paymentId;
  if (filters.page) params.page = String(filters.page);
  if (filters.pageSize) params.pageSize = String(filters.pageSize);

  const res = await api.get<any>("/api/admin/refunds", { params });
  if (Array.isArray(res)) {
    return { refunds: res, total: res.length };
  }
  if (res && Array.isArray(res.refunds)) {
    return res as RefundListResponse;
  }
  if (res && Array.isArray(res.data)) {
    return { refunds: res.data, total: res.total ?? res.data.length, page: res.page, pageSize: res.pageSize };
  }
  return { refunds: [], total: 0 };
}

export async function getRefund(id: string): Promise<Refund | null> {
  const res = await api.get<any>(`/api/admin/refunds/${id}`);
  if (!res) return null;
  if (res.refund) return res.refund as Refund;
  return res as Refund;
}

export async function createRefund(payload: CreateRefundPayload): Promise<Refund> {
  const res = await api.post<any>("/api/admin/refunds", payload);
  if (res && res.refund) return res.refund as Refund;
  return res as Refund;
}
