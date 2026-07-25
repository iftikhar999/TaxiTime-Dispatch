import React, { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import { useDispatchSocket } from "../../providers/SocketProvider";

/**
 * Persistent banner that warns the operator when the dispatch realtime
 * socket is down. Without this, the dispatcher sees stale jobs/drivers
 * and doesn't know jobs aren't actually being pushed to drivers.
 *
 * Behavior:
 *   - Hidden on initial mount (avoids flashing during first handshake).
 *   - Appears after we've been disconnected for >3 s.
 *   - Disappears immediately on reconnect.
 */
const SocketConnectionBanner: React.FC = () => {
  const { connected, socket } = useDispatchSocket();
  const [visible, setVisible] = useState(false);
  const hasConnectedOnceRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (connected) {
      hasConnectedOnceRef.current = true;
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setVisible(false);
      return;
    }

    // Don't show until we've at least had one successful connection —
    // avoids flashing during page load / before auth resolves.
    if (!hasConnectedOnceRef.current) return;

    hideTimerRef.current = setTimeout(() => setVisible(true), 3000);
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [connected]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
    >
      <WifiOff size={16} />
      <span>
        Realtime disconnected — jobs may not reach drivers until this
        reconnects. Attempting to reconnect…
      </span>
      <button
        onClick={() => {
          // Manual reconnect attempt via the underlying socket.
          try {
            socket?.connect();
          } catch {
            /* no-op */
          }
        }}
        className="ml-2 rounded border border-white/40 px-2 py-0.5 text-xs font-semibold hover:bg-white/10"
      >
        Retry
      </button>
    </div>
  );
};

export default SocketConnectionBanner;
