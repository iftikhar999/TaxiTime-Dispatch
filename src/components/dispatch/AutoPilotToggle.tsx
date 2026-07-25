import { Bot, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getDispatchSocket } from "../../services/socket";

/**
 * Auto-Pilot toggle for the dispatch header.
 *
 * Renders nothing unless the company is entitled (super-admin flipped the
 * `dispatchAutoPilot` premium flag) AND the LLM engine is reachable. State
 * is fetched via the dispatch socket — re-fetched on every reconnect, and
 * passively updated by the `autopilot:state` server event so two
 * dispatchers in different tabs stay in sync.
 */
interface AutoPilotState {
  entitled: boolean;
  enabled: boolean;
  engineReady?: boolean;
  model?: string;
  reason?: string;
}

const AutoPilotToggle: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const [state, setState] = useState<AutoPilotState>({ entitled: false, enabled: false });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const socket = getDispatchSocket();
    if (!socket) return;

    const refresh = () => {
      socket.emit("dispatch:autopilot:state", {}, (resp: AutoPilotState) => {
        setState(resp || { entitled: false, enabled: false });
      });
    };
    refresh();

    const onState = (payload: { enabled: boolean; reason?: string }) => {
      setState((prev) => ({ ...prev, enabled: !!payload.enabled, reason: payload.reason }));
    };
    socket.on("autopilot:state", onState);
    socket.on("connect", refresh);

    // periodic re-poll for engineReady — Ollama might come/go independently
    const t = setInterval(refresh, 30_000);

    return () => {
      socket.off("autopilot:state", onState);
      socket.off("connect", refresh);
      clearInterval(t);
    };
  }, []);

  if (!state.entitled) return null;

  const handleToggle = () => {
    if (pending) return;
    const next = !state.enabled;
    setPending(true);
    const socket = getDispatchSocket();
    socket?.emit(
      "dispatch:autopilot:set",
      { enabled: next },
      (resp: { ok: boolean; enabled?: boolean; reason?: string }) => {
        setPending(false);
        if (resp?.ok) {
          setState((prev) => ({ ...prev, enabled: !!resp.enabled }));
        } else {
          // Best-effort surface — actual toast is the dispatch app's domain.
          console.warn("[AutoPilot] toggle rejected:", resp?.reason);
        }
      }
    );
  };

  const enabled = state.enabled;
  const engineDown = state.engineReady === false;

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      title={
        engineDown
          ? "Auto-Pilot engine offline — toggle saves but won't dispatch until engine is back"
          : enabled
          ? "Auto-Pilot ON — AI is dispatching jobs"
          : "Auto-Pilot OFF — click to let AI dispatch"
      }
      className={`relative flex items-center gap-1.5 rounded-full px-2.5 lg:px-3 py-1 lg:py-1.5 text-[10px] lg:text-xs font-semibold transition border ${
        pending
          ? "opacity-60 cursor-wait"
          : enabled
          ? engineDown
            ? "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
            : "bg-purple-600 text-white border-purple-700 hover:bg-purple-700 shadow-sm"
          : isDark
          ? "bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
      }`}
    >
      {pending ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Bot size={14} className={enabled && !engineDown ? "" : ""} />
      )}
      <span className="hidden sm:inline">
        Auto-Pilot {enabled ? "ON" : "OFF"}
      </span>
      {enabled && !engineDown && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      )}
    </button>
  );
};

export default AutoPilotToggle;
