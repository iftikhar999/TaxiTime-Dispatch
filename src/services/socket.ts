import { io, Socket } from "socket.io-client";
import { SOCKET_BASE_URL } from "../config/environment";

export interface DispatchSocketAuth {
  userId: string;
  companyId?: string;
  /** Pulled from the auth store so we don't hardcode the dispatcher role. */
  role?: string;
}

let socket: Socket | null = null;
let auth: DispatchSocketAuth | null = null;

export const connectDispatchSocket = (
  credentials: DispatchSocketAuth
): Socket => {
  auth = credentials;

  if (!socket) {
    socket = io(`${SOCKET_BASE_URL}/dispatch`, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 15,
    });
  }

  if (!socket.connected) {
    socket.connect();
  }

  socket.once("connect", () => {
    console.log("[Socket] Connected to dispatch namespace", {
      userId: credentials.userId,
      companyId: credentials.companyId,
      role: credentials.role,
    });

    socket?.emit("authenticate", {
      userId: credentials.userId,
      companyId: credentials.companyId,
      // Fall back to DISPATCHER only if the caller did not supply a role.
      role: credentials.role || "DISPATCHER",
    });

    if (credentials.companyId) {
      // Join the dispatch room to receive real-time updates
      const dispatchRoom = `dispatch_${credentials.companyId}`;
      console.log("[Socket] Joining dispatch room:", dispatchRoom);
      socket?.emit("join", dispatchRoom);
      socket?.emit("joinCompany", credentials.companyId);
    }
  });

  // --- Authenticate ack / error listeners ------------------------------------
  // The backend's /dispatch namespace currently does not emit a success ack,
  // but its join_super_admin_room / request:* handlers emit a generic `error`
  // event on unauthorized access. We listen to the common ack names as well
  // (`authenticated`, `auth:error`) so this works if the backend is hardened
  // later. On any auth failure we dispatch a browser event so the UI layer
  // can toast + the caller can disconnect.
  const handleAuthenticated = () => {
    console.log("[Socket] Dispatch namespace authentication acknowledged");
  };
  const handleAuthError = (payload: any) => {
    console.error("[Socket] Dispatch namespace auth error", payload);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("dispatch:socket:auth-error", {
          detail: payload || { message: "Socket authentication failed" },
        })
      );
    }
    socket?.disconnect();
  };
  const handleGenericError = (payload: any) => {
    // Only treat as an auth failure if the payload looks auth-related;
    // other handlers use `error` for non-auth problems.
    const msg = String(payload?.message || "").toLowerCase();
    if (msg.includes("unauthorized") || msg.includes("auth")) {
      handleAuthError(payload);
    }
  };

  socket.off("authenticated", handleAuthenticated);
  socket.off("auth:error", handleAuthError);
  socket.off("error", handleGenericError);
  socket.on("authenticated", handleAuthenticated);
  socket.on("auth:error", handleAuthError);
  socket.on("error", handleGenericError);

  return socket;
};

export const getDispatchSocket = () => socket;

export const disconnectDispatchSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  auth = null;
};

export const emitJoinZoneRoom = (zoneId: string) => {
  socket?.emit("joinZone", zoneId);
};

export const emitLeaveZoneRoom = (zoneId: string) => {
  socket?.emit("leaveZone", zoneId);
};
