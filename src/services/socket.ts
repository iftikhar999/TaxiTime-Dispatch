import { io, Socket } from "socket.io-client";
import { SOCKET_BASE_URL } from "../config/environment";

export interface DispatchSocketAuth {
  userId: string;
  companyId?: string;
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
    });

    socket?.emit("authenticate", {
      userId: credentials.userId,
      companyId: credentials.companyId,
      role: "DISPATCHER",
    });

    if (credentials.companyId) {
      // Join the dispatch room to receive real-time updates
      const dispatchRoom = `dispatch_${credentials.companyId}`;
      console.log("[Socket] Joining dispatch room:", dispatchRoom);
      socket?.emit("join", dispatchRoom);
      socket?.emit("joinCompany", credentials.companyId);
    }
  });

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
