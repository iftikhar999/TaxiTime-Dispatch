import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useV2Api } from "../context/V2ApiContext";

const SOCKET_URL = import.meta.env.PROD
  ? `${window.location.protocol}//54.252.241.150`
  : (import.meta.env.VITE_SOCKET_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:3000");

type UseV2SocketOptions = {
  companyId: string;
  serviceType?: string | null;
  enabled?: boolean;
  onJobUpdate?: (data: any) => void;
  onStopUpdate?: (data: any) => void;
  onPodCaptured?: (data: any) => void;
  onDriverUpdate?: (data: any) => void;
};

export const useV2Socket = (options: UseV2SocketOptions) => {
  const {
    companyId,
    serviceType,
    enabled = true,
    onJobUpdate,
    onStopUpdate,
    onPodCaptured,
    onDriverUpdate,
  } = options;
  const { v2Available } = useV2Api();
  const socketRef = useRef<Socket | null>(null);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("leave:dispatch", { companyId, serviceType });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, [companyId, serviceType]);

  const connect = useCallback(() => {
    if (!enabled || !v2Available || !companyId) return;

    const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    const socket = io(SOCKET_URL, {
      auth: { token },
      query: { companyId, serviceType: serviceType || undefined },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join:dispatch", { companyId, serviceType });
    });

    socket.on("job:created", (data) => onJobUpdate?.({ type: "created", ...data }));
    socket.on("job:status", (data) => onJobUpdate?.({ type: "status", ...data }));
    socket.on("job:assigned", (data) => onJobUpdate?.({ type: "assigned", ...data }));
    socket.on("job:completed", (data) => onJobUpdate?.({ type: "completed", ...data }));

    socket.on("stop:status", (data) => onStopUpdate?.(data));
    socket.on("pod:captured", (data) => onPodCaptured?.(data));

    socket.on("driver:location", (data) => onDriverUpdate?.({ type: "location", ...data }));
    socket.on("driver:status", (data) => onDriverUpdate?.({ type: "status", ...data }));
  }, [companyId, serviceType, enabled, v2Available, onJobUpdate, onStopUpdate, onPodCaptured, onDriverUpdate]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (socketRef.current?.connected && serviceType) {
      socketRef.current.emit("join:dispatch", { companyId, serviceType });
    }
  }, [serviceType, companyId]);

  return {
    socket: socketRef.current,
    connected: socketRef.current?.connected || false,
    reconnect: connect,
    disconnect,
  };
};

export default useV2Socket;
