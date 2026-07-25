import api from "./api";

export interface DispatchPaymentConfig {
  enabled: boolean;
  publishableKey: string | null;
}

export async function getDispatchPaymentConfig(): Promise<DispatchPaymentConfig> {
  const response = await api.get<{ success: boolean; data: DispatchPaymentConfig }>(
    "/api/dispatch/payments/config"
  );
  const payload = (response as any)?.data?.data ?? (response as any)?.data ?? response;
  return {
    enabled: Boolean(payload?.enabled),
    publishableKey: payload?.publishableKey ?? null,
  };
}

export interface CreatePaymentIntentPayload {
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
  customerId?: string;
}

export interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  publishableKey?: string;
}

export async function createPaymentIntent(
  payload: CreatePaymentIntentPayload
): Promise<CreatePaymentIntentResponse> {
  const response = await api.post<{ success: boolean; data: CreatePaymentIntentResponse }>(
    "/api/dispatch/payments/intent",
    payload
  );
  const data = (response as any)?.data?.data ?? (response as any)?.data ?? response;
  return {
    clientSecret: data?.clientSecret,
    paymentIntentId: data?.paymentIntentId,
    publishableKey: data?.publishableKey,
  };
}

// Extra charge on already-paid jobs
export interface ExtraChargePayload {
  jobId: string;
  amount: number;
  currency: string;
  description?: string;
  paymentMethodId?: string; // Saved card pm_xxx for server-side charging
}

export interface ExtraChargeResponse {
  clientSecret: string;
  paymentIntentId: string;
  publishableKey: string;
  amount: number;
  currency: string;
  status?: string; // 'succeeded' if server-side confirmed
  alreadyConfirmed?: boolean;
}

export async function createExtraCharge(
  payload: ExtraChargePayload
): Promise<ExtraChargeResponse> {
  const response = await api.post<{ success: boolean; data: ExtraChargeResponse }>(
    "/api/dispatch/payments/extra-charge",
    payload
  );
  const data = (response as any)?.data?.data ?? (response as any)?.data ?? response;
  return {
    clientSecret: data?.clientSecret,
    paymentIntentId: data?.paymentIntentId,
    publishableKey: data?.publishableKey,
    amount: data?.amount,
    currency: data?.currency,
    status: data?.status,
    alreadyConfirmed: data?.alreadyConfirmed,
  };
}

export async function confirmExtraCharge(jobId: string, paymentIntentId: string): Promise<void> {
  await api.post("/api/dispatch/payments/extra-charge/confirm", {
    jobId,
    paymentIntentId,
  });
}

// Charge a saved card (off-session) for a new job
export interface ChargeSavedCardPayload {
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
  paymentMethodId: string; // pm_xxx
  customerId: string; // internal user ID — backend looks up Stripe Customer from this
}

export interface ChargeSavedCardResponse {
  paymentIntentId: string;
  status: string;
  alreadyConfirmed: boolean;
  publishableKey: string;
  clientSecret: string;
}

export async function chargeSavedCard(
  payload: ChargeSavedCardPayload
): Promise<ChargeSavedCardResponse> {
  const response = await api.post<{ success: boolean; data: ChargeSavedCardResponse }>(
    "/api/dispatch/payments/charge-saved-card",
    payload
  );
  const data = (response as any)?.data?.data ?? (response as any)?.data ?? response;
  return {
    paymentIntentId: data?.paymentIntentId,
    status: data?.status,
    alreadyConfirmed: data?.alreadyConfirmed ?? false,
    publishableKey: data?.publishableKey,
    clientSecret: data?.clientSecret,
  };
}

