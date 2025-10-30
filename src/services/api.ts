import axios, { AxiosError, AxiosRequestConfig } from "axios";
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

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
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
