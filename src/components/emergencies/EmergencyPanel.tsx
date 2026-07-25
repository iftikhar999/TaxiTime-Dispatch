import React from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  MapPin,
  Phone,
  User,
  X,
  AlertOctagon,
} from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { useEmergencyStore } from "../../store/useEmergencyStore";
import {
  updateEmergency,
  type Emergency,
  type EmergencyStatus,
} from "../../services/emergencyService";
import { useDispatchStore } from "../../store/useDispatchStore";

interface EmergencyPanelProps {
  open: boolean;
  onClose: () => void;
}

const statusColor: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE: { bg: "bg-red-600", text: "text-white", label: "ACTIVE" },
  ACKNOWLEDGED: { bg: "bg-amber-500", text: "text-white", label: "Ack" },
  RESOLVED: { bg: "bg-emerald-500", text: "text-white", label: "Resolved" },
  FALSE_ALARM: { bg: "bg-slate-500", text: "text-white", label: "False alarm" },
};

const fmt = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const EmergencyPanel: React.FC<EmergencyPanelProps> = ({ open, onClose }) => {
  const { isDark } = useTheme();
  const emergencies = useEmergencyStore((s) => s.emergencies);
  const updateLocal = useEmergencyStore((s) => s.updateEmergencyStatus);
  const loading = useEmergencyStore((s) => s.loading);
  const selectJob = useDispatchStore((s) => s.selectJob);
  const focusMapCoords = useDispatchStore((s) => s.focusMapCoords);

  const active = emergencies.filter((e) => e.status === "ACTIVE");
  const acknowledged = emergencies.filter((e) => e.status === "ACKNOWLEDGED");
  const resolved = emergencies.filter(
    (e) => e.status === "RESOLVED" || e.status === "FALSE_ALARM"
  );

  const handlePatch = async (e: Emergency, next: EmergencyStatus, notes?: string) => {
    try {
      // Optimistic update so UI feels responsive even before server replies
      updateLocal(e.id, {
        status: next,
        notes: notes ?? e.notes ?? null,
        resolvedAt:
          next === "RESOLVED" || next === "FALSE_ALARM"
            ? new Date().toISOString()
            : e.resolvedAt ?? null,
        acknowledgedAt:
          next === "ACKNOWLEDGED" ? new Date().toISOString() : e.acknowledgedAt ?? null,
      });
      await updateEmergency(e.id, { status: next, notes });
      toast.success(`Emergency ${next.toLowerCase().replace("_", " ")}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update emergency");
    }
  };

  const handleResolve = (e: Emergency) => {
    const notes = globalThis.prompt("Resolution notes (optional):") || undefined;
    handlePatch(e, "RESOLVED", notes ?? undefined);
  };

  const handleFalseAlarm = (e: Emergency) => {
    if (!globalThis.confirm(`Mark ${e.userName || "this emergency"} as false alarm?`)) return;
    handlePatch(e, "FALSE_ALARM");
  };

  const handleAcknowledge = (e: Emergency) => handlePatch(e, "ACKNOWLEDGED");

  const handleFocusMap = (e: Emergency, closePanel: boolean = false) => {
    if (e.latitude != null && e.longitude != null) {
      focusMapCoords({ lat: e.latitude, lng: e.longitude, zoom: 16 });
      toast("Focused map on emergency location", { icon: "📍" });
      // Close panel on whole-card tap so dispatcher actually SEES the map —
      // leaving the panel open would defeat the point.
      if (closePanel) onClose();
    }
  };

  const handleOpenJob = (e: Emergency) => {
    if (e.jobId) selectJob(e.jobId);
  };

  if (!open) return null;

  const renderRow = (e: Emergency, showActions: boolean) => {
    const sc = statusColor[e.status as string] || statusColor.ACTIVE;
    const roleLabel = (e.role || "USER").toString().toUpperCase();
    const hasCoords = e.latitude != null && e.longitude != null;
    // Clicking anywhere on the card (except the action buttons) focuses the
    // map on the emergency location. This is the obvious thing after the
    // dispatcher taps Acknowledge and wants to see where the driver is.
    // Whole-card click → focus map AND close the panel. The chip-button
    // click (rendered below) also focuses but keeps the panel open so the
    // dispatcher can triage multiple alerts in a row.
    const onCardClick = () => { if (hasCoords) handleFocusMap(e, true); };
    return (
      <div
        key={e.id}
        onClick={onCardClick}
        role={hasCoords ? "button" : undefined}
        className={`rounded-lg border p-3 flex flex-col gap-2 shadow-md ${
          isDark
            ? "bg-slate-800 border-slate-700"
            : "bg-white border-slate-200"
        } ${hasCoords ? "cursor-pointer hover:ring-1 hover:ring-blue-500/40" : ""} ${
          e.status === "ACTIVE" ? "ring-2 ring-red-500/50 animate-pulse" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertOctagon
              className={`w-4 h-4 ${
                e.status === "ACTIVE"
                  ? "text-red-500"
                  : isDark
                  ? "text-slate-400"
                  : "text-slate-500"
              }`}
            />
            <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${sc.bg} ${sc.text}`}>
              {sc.label}
            </span>
            <span
              className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
              }`}
            >
              {roleLabel}
            </span>
          </div>
          <span
            className={`text-[10px] ${
              isDark ? "text-slate-400" : "text-slate-500"
            }`}
          >
            {fmt(e.createdAt)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <User className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
          <span className={`font-medium truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>
            {e.userName || "Unknown user"}
          </span>
          {e.userPhone && (
            <a
              href={`tel:${e.userPhone}`}
              className={`ml-auto inline-flex items-center gap-1 text-xs ${
                isDark ? "text-emerald-400" : "text-emerald-600"
              } hover:underline`}
            >
              <Phone className="w-3 h-3" />
              {e.userPhone}
            </a>
          )}
        </div>

        {e.message && (
          <p
            className={`text-xs italic rounded px-2 py-1 ${
              isDark ? "bg-slate-900/70 text-slate-300" : "bg-slate-50 text-slate-700"
            }`}
          >
            “{e.message}”
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {hasCoords ? (
            <button
              onClick={(ev) => { ev.stopPropagation(); handleFocusMap(e); }}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
                isDark
                  ? "bg-slate-700 hover:bg-slate-600 text-slate-200"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
              title="Show on map"
            >
              <MapPin className="w-3 h-3" />
              {e.latitude!.toFixed(4)}, {e.longitude!.toFixed(4)}
            </button>
          ) : (
            <span className={isDark ? "text-slate-500" : "text-slate-400"}>No coordinates</span>
          )}

          {e.jobId && (
            <button
              onClick={(ev) => { ev.stopPropagation(); handleOpenJob(e); }}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
                isDark
                  ? "bg-blue-900/40 hover:bg-blue-900/60 text-blue-300"
                  : "bg-blue-50 hover:bg-blue-100 text-blue-700"
              }`}
            >
              Job {e.jobReference || e.jobId.slice(0, 6)}
            </button>
          )}
        </div>

        {e.notes && (
          <p
            className={`text-[11px] rounded px-2 py-1 ${
              isDark ? "bg-slate-900 text-slate-400" : "bg-slate-50 text-slate-600"
            }`}
          >
            <span className="font-semibold">Notes:</span> {e.notes}
          </p>
        )}

        {showActions && (
          <div
            className="flex items-center gap-2 pt-1 border-t border-dashed border-slate-500/20"
            onClick={(ev) => ev.stopPropagation()}
          >
            {e.status === "ACTIVE" && (
              <button
                onClick={() => handleAcknowledge(e)}
                className="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-600"
              >
                Acknowledge
              </button>
            )}
            <button
              onClick={() => handleResolve(e)}
              className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Resolve
            </button>
            <button
              onClick={() => handleFalseAlarm(e)}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                isDark
                  ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                  : "bg-slate-200 text-slate-700 hover:bg-slate-300"
              }`}
            >
              False alarm
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    // Backdrop: bumped from /40 to /75 so the map underneath doesn't bleed
    // through and make the emergency cards look translucent. Also add a
    // subtle blur so the dispatcher's eye lands on the panel, not the map.
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-end bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`h-full w-full max-w-md overflow-auto p-4 shadow-2xl border-l ${
          isDark
            ? "bg-slate-900 border-slate-700"
            : "bg-slate-100 border-slate-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              Emergencies
            </h2>
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
              {active.length} active
            </span>
          </div>
          <button
            onClick={onClose}
            className={`rounded-full p-1 ${
              isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-200"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Loading…</p>
        )}

        <section className="mb-4">
          <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${
            isDark ? "text-red-400" : "text-red-600"
          }`}>
            Active ({active.length})
          </h3>
          {active.length === 0 ? (
            <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
              No active emergencies.
            </p>
          ) : (
            <div className="space-y-2">{active.map((e) => renderRow(e, true))}</div>
          )}
        </section>

        {acknowledged.length > 0 && (
          <section className="mb-4">
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${
              isDark ? "text-amber-400" : "text-amber-600"
            }`}>
              Acknowledged ({acknowledged.length})
            </h3>
            <div className="space-y-2">{acknowledged.map((e) => renderRow(e, true))}</div>
          </section>
        )}

        {resolved.length > 0 && (
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${
              isDark ? "text-emerald-400" : "text-emerald-600"
            }`}>
              Resolved ({resolved.length})
            </h3>
            <div className="space-y-2">{resolved.slice(0, 20).map((e) => renderRow(e, false))}</div>
          </section>
        )}
      </div>
    </div>
  );
};

export default EmergencyPanel;
