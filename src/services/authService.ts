import { get } from "http";
import { AuthUser } from "../store/useAuthStore";
import api from "./api";

interface LoginResponse {
  token: string;
  refreshToken?: string;
  user: AuthUser;
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
};
