/**
 * Customer Service
 * Handles customer search and management for dispatch
 */

import { api } from "./api";

export interface Customer {
  id: string;
  customerId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  email: string;
  rideHistory?: number;
  defaultPaymentMethod?: "cash" | "card";
  savedCard?: {
    hasCard: boolean;
    cardLast4: string | null;
    cardBrand: string | null;
    cardExpMonth: number | null;
    cardExpYear: number | null;
    savedAt: string | null;
  } | null;
  addresses?: Array<{
    id: string;
    label: string;
    address: string;
    lat: number;
    lng: number;
  }>;
}

export interface CustomerSearchResponse {
  success: boolean;
  data: Customer[];
  total: number;
}

export interface CustomerDetailsResponse {
  success: boolean;
  data: Customer;
}

/**
 * Search customers by name, phone, or email
 */
export async function searchCustomers(
  query: string,
  companyId?: string
): Promise<Customer[]> {
  try {
    const response = await api.get<CustomerSearchResponse>(
      "/api/customers/search",
      {
        params: {
          q: query,
          limit: 10,
          ...(companyId && { companyId }),
        },
      }
    );

    return response.data || [];
  } catch (error) {
    console.error("Customer search error:", error);
    throw error;
  }
}

/**
 * Get customer details by ID
 */
export async function getCustomerDetails(
  customerId: string
): Promise<Customer> {
  try {
    const response = await api.get<CustomerDetailsResponse>(
      `/api/customers/${customerId}`
    );
    return response.data;
  } catch (error) {
    console.error("Get customer details error:", error);
    throw error;
  }
}

/**
 * Create new customer
 */
export async function createCustomer(data: {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  companyId?: string;
}): Promise<Customer> {
  try {
    const response = await api.post<CustomerDetailsResponse>(
      "/api/customers",
      data
    );
    return response.data;
  } catch (error) {
    console.error("Create customer error:", error);
    throw error;
  }
}

/**
 * Save a card (Stripe PaymentMethod) to a customer profile
 */
export async function saveCustomerCard(
  customerId: string,
  cardData: {
    stripePaymentMethodId: string;
    cardLast4: string;
    cardBrand?: string;
    cardExpMonth?: number;
    cardExpYear?: number;
  }
): Promise<void> {
  try {
    await api.post(`/api/customers/${customerId}/save-card`, cardData);
  } catch (error) {
    console.error("Save customer card error:", error);
    // Don't throw — this is a best-effort save, job creation should not fail
  }
}

/**
 * Get saved Stripe PaymentMethod ID for a customer (for off-session charging)
 */
export async function getCustomerPaymentMethod(
  customerId: string
): Promise<{ stripePaymentMethodId: string; cardLast4: string; cardBrand: string } | null> {
  try {
    const response = await api.get<{ success: boolean; data: any }>(
      `/api/customers/${customerId}/payment-method`
    );
    return response.data || null;
  } catch (error) {
    console.error("Get customer payment method error:", error);
    return null;
  }
}
