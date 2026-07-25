/**
 * useEmergencyAlerts — wires the dispatch socket `emergency:new` event
 * and an initial fetch into the emergency store. Also plays a sound
 * (reusing the existing public/sounds/a.wav asset) and toasts when a
 * new SOS comes in.
 *
 * Designed to be mounted ONCE at the app root.
 */
import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useDispatchSocket } from "../providers/SocketProvider";
import { listEmergencies, type Emergency } from "../services/emergencyService";
import { useEmergencyStore } from "../store/useEmergencyStore";

let sosAudio: HTMLAudioElement | null = null;
const playSosSound = () => {
  try {
    if (typeof window === "undefined") return;
    if (!sosAudio) {
      // Reuse an existing shipping sound asset. If it ever gets replaced
      // with a dedicated SOS tone, only this path needs to change.
      sosAudio = new Audio("/sounds/b.wav");
      sosAudio.volume = 0.9;
    }
    sosAudio.currentTime = 0;
    void sosAudio.play().catch(() => {
      /* browsers block autoplay until user interacts — swallow quietly */
    });
  } catch {
    /* noop */
  }
};

export function useEmergencyAlerts() {
  const { socket } = useDispatchSocket();
  const setEmergencies = useEmergencyStore((s) => s.setEmergencies);
  const upsertEmergency = useEmergencyStore((s) => s.upsertEmergency);
  const setLoading = useEmergencyStore((s) => s.setLoading);
  const setError = useEmergencyStore((s) => s.setError);
  const firstLoad = useRef(true);

  // Initial load + refresh when socket reconnects
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const list = await listEmergencies("ALL");
        if (!cancelled) setEmergencies(list);
        setError(null);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load emergencies");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [setEmergencies, setLoading, setError]);

  // Listen for new SOS events
  useEffect(() => {
    if (!socket) return;

    const handleNew = (payload: Emergency | any) => {
      const e: Emergency = payload?.emergency || payload;
      if (!e || !e.id) return;
      upsertEmergency(e);
      // Don't toast/sound on initial hydration
      if (firstLoad.current) {
        firstLoad.current = false;
        return;
      }
      playSosSound();
      toast.error(
        `🚨 SOS from ${e.userName || e.role || "user"}${
          e.jobReference ? ` (Job ${e.jobReference})` : ""
        }`,
        { duration: 15000, id: `sos-${e.id}` }
      );
    };

    const handleUpdate = (payload: Emergency | any) => {
      const e: Emergency = payload?.emergency || payload;
      if (!e || !e.id) return;
      upsertEmergency(e);
    };

    socket.on("emergency:new", handleNew);
    socket.on("emergency:update", handleUpdate);
    socket.on("emergency:resolved", handleUpdate);

    // After the socket has been listened to at least once, any further
    // emergencies we receive are truly new, so flip the first-load flag.
    const t = setTimeout(() => {
      firstLoad.current = false;
    }, 2000);

    return () => {
      socket.off("emergency:new", handleNew);
      socket.off("emergency:update", handleUpdate);
      socket.off("emergency:resolved", handleUpdate);
      clearTimeout(t);
    };
  }, [socket, upsertEmergency]);
}
