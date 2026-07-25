import axios from "axios";
import { useAuthStore } from "../../store/useAuthStore";

const TOKEN_KEY = "dispatch_token";

const API_BASE = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000");

type AvailabilityCache = {
  available: boolean | null;
  checkedAt: number | null;
  ttlMs: number;
};

let v2AvailabilityCache: AvailabilityCache = {
  available: null,
  checkedAt: null,
  ttlMs: 60000,
};

// Per-path "this V2 endpoint 404s" cache. Even when /api/v2/health says V2
// is up, individual V2 endpoints may not be deployed yet (/api/v2/jobs is
// the current offender). Once we see a 404 on a path, remember it for the
// rest of the session so subsequent callers skip straight to V1 and don't
// produce a noisy 404 storm in devtools.
const v2UnsupportedPaths = new Set<string>();

const normalisePath = (url: string | undefined): string => {
  if (!url) return "";
  const cleaned = url.split("?")[0];
  const idx = cleaned.indexOf("/api/v2");
  return idx >= 0 ? cleaned.slice(idx) : cleaned;
};

export const isV2PathUnsupported = (path: string): boolean =>
  v2UnsupportedPaths.has(normalisePath(path));

export const markV2PathUnsupported = (path: string): void => {
  v2UnsupportedPaths.add(normalisePath(path));
};

const getToken = () => {
  // Prefer Zustand store (keeps source of truth) then localStorage fallback
  const fromStore = useAuthStore.getState().token;
  if (fromStore) return fromStore;
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem("token");
  }
  return null;
};

// Coalesce concurrent availability checks — without this, every component
// mounting in the same tick fires its own GET /api/v2/health. The three
// `health` requests the user saw in devtools on page load came from here.
let v2AvailabilityInFlight: Promise<boolean> | null = null;

export const checkV2Availability = async (): Promise<boolean> => {
  const now = Date.now();
  if (
    v2AvailabilityCache.available !== null &&
    v2AvailabilityCache.checkedAt &&
    now - v2AvailabilityCache.checkedAt < v2AvailabilityCache.ttlMs
  ) {
    return v2AvailabilityCache.available;
  }
  if (v2AvailabilityInFlight) {
    return v2AvailabilityInFlight;
  }

  v2AvailabilityInFlight = (async () => {
    try {
      const token = getToken();
      const res = await axios.get(`${API_BASE}/api/v2/health`, {
        timeout: 2000,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // The backend returns 200 for /health EVEN WHEN the V2 feature flag
      // is off — body `{ status: 'disabled', featureEnabled: false }`.
      // Treat that as unavailable so we don't subsequently hit every V2
      // path only to get a 404 (the other handler's response).
      const payload = res.data || {};
      const disabled =
        payload.status === 'disabled' || payload.featureEnabled === false;
      v2AvailabilityCache = {
        available: res.status === 200 && !disabled,
        checkedAt: now,
        // Longer TTL when disabled — the feature flag doesn't flip often.
        ttlMs: disabled ? 10 * 60 * 1000 : 60000,
      };
    } catch (error: any) {
      console.warn('[V2 Client] V2 API not available:', error?.message);
      v2AvailabilityCache = {
        available: false,
        checkedAt: now,
        ttlMs: 30000,
      };
    }
    return v2AvailabilityCache.available === true;
  })();

  try {
    return await v2AvailabilityInFlight;
  } finally {
    v2AvailabilityInFlight = null;
  }
};

export const refreshV2Availability = () => {
  v2AvailabilityCache = { available: null, checkedAt: null, ttlMs: 60000 };
  return checkV2Availability();
};

export const isV2Available = () => v2AvailabilityCache.available === true;

export const v2Client = axios.create({
  baseURL: `${API_BASE}/api/v2`,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

v2Client.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (config.method === "post" && !config.headers["Idempotency-Key"]) {
      config.headers["Idempotency-Key"] = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

v2Client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 404) {
      // Don't nuke the whole V2 availability flag — /api/v2/health is alive,
      // just this specific endpoint isn't deployed yet. Mark the path so
      // future callers go straight to V1 instead of re-hitting V2.
      const url: string | undefined = error?.config?.baseURL
        ? `${error.config.baseURL}${error.config.url ?? ""}`
        : error?.config?.url;
      markV2PathUnsupported(url ?? "");
    }
    return Promise.reject(error);
  }
);

export const v1Client = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

v1Client.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

export default v2Client;
