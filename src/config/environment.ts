// Important: Do NOT include trailing '/api' here because endpoint paths already start with '/api/...'
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_BASE_URL ?? "http://localhost:3000";

export const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ??
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
