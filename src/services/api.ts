import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "../config/environment";
import { useAuthStore } from "../store/useAuthStore";

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Token-refresh interceptor -------------------------------------------------
// On a single 401 we try the /api/auth/refresh endpoint once, update the store,
// and replay the original request. Repeated 401s (or a 401 on /auth/refresh
// itself) hard-logout and redirect. The `_retry` flag guarantees idempotency —
// we never loop on the same request.
type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let refreshPromise: Promise<string> | null = null;

const logoutAndRedirect = () => {
  try {
    useAuthStore.getState().logout();
  } catch {
    // swallow
  }
  // Respect the Vite base path — in the prod build the dispatch SPA is
  // served under `/dispatch/`, so the redirect must target `/dispatch/login`.
  // Hard-coding `/login` sends the browser to the apex, where nothing
  // dispatch-related exists and some catch-all bounces the user to the
  // marketing website.
  if (typeof window === "undefined" || !window.location) return;
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const loginPath = `${base}/login`;
  if (!window.location.pathname.startsWith(loginPath)) {
    window.location.href = loginPath;
  }
};

const performRefresh = async (): Promise<string> => {
  // Lazy-require the auth service to avoid a circular import at module init.
  const { authService } = await import("./authService");
  const newToken = await authService.refreshToken();
  const state = useAuthStore.getState();
  if (state.user) {
    state.setCredentials(newToken, state.user);
  }
  return newToken;
};

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryConfig | undefined;
    const status = error.response?.status;

    // Non-401 / no config — just propagate.
    if (!originalRequest || status !== 401) {
      return Promise.reject(error);
    }

    // Never try to refresh the refresh call itself — that would infinite-loop.
    const url = originalRequest.url || "";
    if (url.includes("/api/auth/refresh") || url.includes("/api/auth/login")) {
      logoutAndRedirect();
      return Promise.reject(error);
    }

    // Only one retry per request.
    if (originalRequest._retry) {
      logoutAndRedirect();
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      originalRequest.headers = originalRequest.headers || {};
      (originalRequest.headers as any).Authorization = `Bearer ${newToken}`;
      return axiosInstance(originalRequest);
    } catch (refreshErr) {
      logoutAndRedirect();
      return Promise.reject(refreshErr);
    }
  }
);

async function unwrap<T>(
  method: "get" | "post" | "put" | "patch" | "delete",
  url: string,
  dataOrConfig?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  if (method === "get" || method === "delete") {
    const response = await axiosInstance[method]<T>(
      url,
      dataOrConfig as AxiosRequestConfig | undefined
    );
    return response.data;
  }

  const response = await axiosInstance[method]<T>(url, dataOrConfig, config);
  return response.data;
}

export const api = {
  get: <T = any>(url: string, config?: AxiosRequestConfig) =>
    unwrap<T>("get", url, config),
  post: <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>("post", url, data, config),
  put: <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>("put", url, data, config),
  patch: <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>("patch", url, data, config),
  delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
    unwrap<T>("delete", url, config),
  instance: axiosInstance,
};

export default api;
