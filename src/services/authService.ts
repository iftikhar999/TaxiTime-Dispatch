import { AuthUser } from "../store/useAuthStore";
import api from "./api";

interface LoginResponse {
  token: string;
  refreshToken?: string;
  user: AuthUser;
}

interface RefreshResponse {
  token: string;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await api.post<any>("/api/auth/login", {
      email,
      password,
    });

    // Transform response - extract companyId from nested company object
    const user: AuthUser = {
      ...response.user,
      companyId: response.user.company?.id || response.user.companyId || null,
    };

    return {
      token: response.token,
      refreshToken: response.refreshToken,
      user,
    };
  },
  async logout() {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // ignore logout errors on client side
    }
  },
  /**
   * Calls the backend /api/auth/refresh endpoint. The current token is sent
   * automatically via the axios request interceptor. Returns the new token.
   */
  async refreshToken(): Promise<string> {
    const response = await api.post<RefreshResponse>("/api/auth/refresh");
    if (!response?.token) {
      throw new Error("Refresh did not return a token");
    }
    return response.token;
  },
};
