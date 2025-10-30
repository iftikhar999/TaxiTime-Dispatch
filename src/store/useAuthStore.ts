import { create } from "zustand";

export type UserRole = "DRIVER" | "OWNER" | "DISPATCHER" | "SUPER_ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRole;
  companyId?: string | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  hydrated: boolean;
  setCredentials: (token: string, user: AuthUser) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  hydrate: () => void;
}

const TOKEN_KEY = "dispatch_token";
const USER_KEY = "dispatch_user";

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  loading: false,
  error: null,
  hydrated: false,
  setCredentials: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, error: null, loading: false, hydrated: true });
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({
      token: null,
      user: null,
      loading: false,
      error: null,
      hydrated: true,
    });
  },
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  hydrate: () => {
    console.log("[AuthStore] Hydrating from localStorage");
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    console.log("[AuthStore] Found stored data", {
      hasToken: !!storedToken,
      hasUser: !!storedUser,
    });

    if (storedToken && storedUser) {
      try {
        const parsed = JSON.parse(storedUser) as AuthUser;
        console.log("[AuthStore] Successfully parsed user", {
          userId: parsed.id,
          role: parsed.role,
        });
        set({ token: storedToken, user: parsed, hydrated: true });
      } catch (error) {
        console.error("[AuthStore] Failed to parse stored user", error);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        set({ token: null, user: null, hydrated: true });
      }
    } else {
      console.log("[AuthStore] No stored credentials, setting hydrated=true");
      set({ token: null, user: null, hydrated: true });
    }
  },
}));
