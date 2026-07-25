// Important: Do NOT include trailing '/api' here because endpoint paths already start with '/api/...'
// In production, use empty string (relative URL) so Nginx proxies to backend
// In development, use localhost:3000
export const API_BASE_URL = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000");

// Socket URL: in production, use the server IP with correct protocol
// In development, use localhost:3000
export const SOCKET_BASE_URL = import.meta.env.PROD
  ? `${window.location.protocol}//54.252.241.150`
  : (import.meta.env.VITE_SOCKET_BASE_URL || "http://localhost:3000");

export const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ??
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
