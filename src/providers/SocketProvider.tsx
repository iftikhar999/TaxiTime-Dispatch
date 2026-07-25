import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Socket } from "socket.io-client";
import {
  connectDispatchSocket,
  disconnectDispatchSocket,
  getDispatchSocket,
} from "../services/socket";
import { useAuthStore } from "../store/useAuthStore";

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
});

type SocketProviderProps = {
  children: React.ReactNode;
};

const ALLOWED_SOCKET_ROLES = new Set([
  "DISPATCHER",
  "OWNER",
  "COMPANY_ADMIN",
  "ADMIN",
  "SUPER_ADMIN",
]);

export function SocketProvider({ children }: SocketProviderProps) {
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Subscribe to auth store changes inside useEffect to avoid render-phase store reads
    const unsubscribe = useAuthStore.subscribe((state) => {
      console.log("[SocketProvider] Auth state changed", {
        hydrated: state.hydrated,
        user: state.user?.id,
        token: !!state.token,
      });

      if (!state.hydrated) {
        console.log("[SocketProvider] Not hydrated yet, skipping socket setup");
        return;
      }

      if (
        !state.user ||
        !state.token ||
        !ALLOWED_SOCKET_ROLES.has(state.user.role || "")
      ) {
        console.log(
          "[SocketProvider] No user/token or not dispatcher, disconnecting"
        );
        disconnectDispatchSocket();
        setSocket(null);
        setConnected(false);
        return;
      }

      console.log("[SocketProvider] Connecting socket for user", state.user.id);
      const nextSocket = connectDispatchSocket({
        userId: state.user.id,
        companyId: state.user.companyId || undefined,
        // Pull the role from the auth store; fall back to DISPATCHER only
        // when the user object is somehow missing a role (should not happen).
        role: state.user.role || "DISPATCHER",
      });
      setSocket(nextSocket);

      const handleConnect = () => setConnected(true);
      const handleDisconnect = () => setConnected(false);

      nextSocket.on("connect", handleConnect);
      nextSocket.on("disconnect", handleDisconnect);
    });

    // Trigger initial check
    const state = useAuthStore.getState();
    if (state.hydrated) {
      if (
        state.user &&
        state.token &&
        ALLOWED_SOCKET_ROLES.has(state.user.role || "")
      ) {
        const nextSocket = connectDispatchSocket({
          userId: state.user.id,
          companyId: state.user.companyId || undefined,
          role: state.user.role || "DISPATCHER",
        });
        setSocket(nextSocket);

        const handleConnect = () => setConnected(true);
        const handleDisconnect = () => setConnected(false);

        nextSocket.on("connect", handleConnect);
        nextSocket.on("disconnect", handleDisconnect);
      }
    }

    // Surface socket auth failures to the user — see socket.ts which emits
    // this CustomEvent on an `auth:error` / unauthorized `error` payload.
    const handleSocketAuthError = (evt: Event) => {
      const detail = (evt as CustomEvent).detail;
      console.error("[SocketProvider] Socket auth error", detail);
      setConnected(false);
      // Dynamic import to avoid bringing react-hot-toast into this module's
      // initial eval if it's not already loaded.
      import("react-hot-toast")
        .then(({ default: toast }) => {
          toast.error(
            detail?.message
              ? `Realtime disconnected: ${detail.message}`
              : "Realtime disconnected (auth error). Please sign in again."
          );
        })
        .catch(() => {
          // toast unavailable — already logged above.
        });
    };
    if (typeof window !== "undefined") {
      window.addEventListener(
        "dispatch:socket:auth-error",
        handleSocketAuthError
      );
    }

    return () => {
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "dispatch:socket:auth-error",
          handleSocketAuthError
        );
      }
      disconnectDispatchSocket();
    };
  }, []);

  const value = useMemo(
    () => ({
      socket: socket ?? getDispatchSocket(),
      connected,
    }),
    [socket, connected]
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useDispatchSocket() {
  return useContext(SocketContext);
}

export default SocketProvider;
