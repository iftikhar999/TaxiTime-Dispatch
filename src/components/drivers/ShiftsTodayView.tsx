import React, { useEffect, useState } from "react";
import { X, Clock, AlertCircle } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import api from "../../services/api";

interface ShiftsTodayViewProps {
  open: boolean;
  onClose: () => void;
}

interface ShiftRow {
  driverId: string;
  driverName?: string;
  startedAt?: string;
  endedAt?: string | null;
  durationMin?: number | null;
  breaks?: number;
  breakMinutes?: number;
}

// TODO(backend): endpoint `/api/dispatch/shifts?date=today` is not confirmed
// by Wave 2A. If it returns 404, we render a stub with an info banner instead
// of crashing.
const ShiftsTodayView: React.FC<ShiftsTodayViewProps> = ({ open, onClose }) => {
  const { isDark } = useTheme();
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [stubbed, setStubbed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<any>("/api/dispatch/shifts", {
          params: { date: "today" },
        });
        if (cancelled) return;
        const list: ShiftRow[] = Array.isArray(res)
          ? res
          : res?.shifts || res?.data || [];
        setRows(list);
        setStubbed(false);
      } catch (err: any) {
        if (cancelled) return;
        if (err?.response?.status === 404) {
          setStubbed(true);
          setRows([]);
        } else {
          setError(err?.message || "Failed to load shifts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={`w-full max-w-3xl rounded-xl border shadow-2xl flex flex-col max-h-[85vh] ${
          isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${
          isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"
        }`}>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-500" />
            <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              Shifts today
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`rounded p-1 ${
              isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-200"
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {stubbed && (
          <div
            className={`flex items-start gap-2 border-b px-4 py-2 text-xs ${
              isDark ? "bg-amber-900/30 text-amber-300 border-amber-700" : "bg-amber-50 text-amber-800 border-amber-200"
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <strong>TODO (backend):</strong> shifts endpoint not available.
              This view is stubbed until <code>/api/dispatch/shifts?date=today</code> is implemented.
            </div>
          </div>
        )}

        {error && (
          <p className="px-4 py-2 text-xs text-red-500">{error}</p>
        )}

        <div className="flex-1 overflow-auto">
          {loading && (
            <p className={`p-4 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Loading…</p>
          )}

          {!loading && rows.length === 0 && !error && (
            <p className={`p-6 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {stubbed ? "No data (stub)." : "No shifts recorded today."}
            </p>
          )}

          {rows.length > 0 && (
            <table className="w-full text-xs">
              <thead className={isDark ? "bg-slate-800 text-slate-400" : "bg-slate-50 text-slate-600"}>
                <tr>
                  <th className="px-3 py-2 text-left">Driver</th>
                  <th className="px-3 py-2 text-left">Started</th>
                  <th className="px-3 py-2 text-left">Ended</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                  <th className="px-3 py-2 text-right">Breaks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.driverId}-${i}`}
                    className={`border-b ${
                      isDark ? "border-slate-700 hover:bg-slate-800" : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <td className={`px-3 py-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                      {r.driverName || r.driverId.slice(0, 8)}
                    </td>
                    <td className={`px-3 py-2 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                      {r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : "—"}
                    </td>
                    <td className={`px-3 py-2 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                      {r.endedAt ? new Date(r.endedAt).toLocaleTimeString() : "ongoing"}
                    </td>
                    <td className={`px-3 py-2 text-right ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                      {r.durationMin != null ? `${Math.round(r.durationMin)} min` : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                      {(r.breaks ?? 0) > 0
                        ? `${r.breaks} (${r.breakMinutes ?? 0}m)`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShiftsTodayView;
