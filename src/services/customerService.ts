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
