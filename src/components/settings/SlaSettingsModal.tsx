import React, { useState } from "react";
import toast from "react-hot-toast";
import { X, Clock } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import {
  DEFAULT_SLA_THRESHOLDS,
  loadSlaThresholds,
  saveSlaThresholds,
  type SlaThresholds,
} from "../../utils/slaThresholds";

interface SlaSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (t: SlaThresholds) => void;
}

const SlaSettingsModal: React.FC<SlaSettingsModalProps> = ({ open, onClose, onSaved }) => {
  const { isDark } = useTheme();
  const [t, setT] = useState<SlaThresholds>(loadSlaThresholds());

  if (!open) return null;

  const handleSave = () => {
    saveSlaThresholds(t);
    toast.success("SLA thresholds saved");
    onSaved?.(t);
    onClose();
  };

  const handleReset = () => {
    setT({ ...DEFAULT_SLA_THRESHOLDS });
  };

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-sm rounded-xl shadow-2xl border ${
          isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between border-b px-4 py-3 ${
            isDark ? "border-slate-700" : "border-slate-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              SLA thresholds
            </h3>
          </div>
          <button
            onClick={onClose}
            className={`rounded p-1 ${isDark ? "hover:bg-slate-700 text-slate-300" : "hover:bg-slate-100 text-slate-500"}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className={isDark ? "text-slate-400" : "text-slate-500"}>
            Jobs exceeding these thresholds will be visually escalated in the job board.
          </p>

          {([
            { key: "pendingSec", label: "Pending / Unassigned", unit: "seconds" },
            { key: "onTheWaySec", label: "On the way / Assigned", unit: "seconds" },
            { key: "startedSec", label: "Started / Active", unit: "seconds" },
          ] as const).map((field) => (
            <div key={field.key}>
              <label
                className={`block mb-1 font-semibold ${
                  isDark ? "text-slate-300" : "text-slate-700"
                }`}
              >
                {field.label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={10}
                  value={t[field.key]}
                  onChange={(e) =>
                    setT((prev) => ({ ...prev, [field.key]: Number(e.target.value) || 0 }))
                  }
                  className={`w-24 rounded border px-2 py-1 text-xs outline-none ${
                    isDark
                      ? "border-slate-700 bg-slate-800 text-white"
                      : "border-slate-300 bg-white text-slate-800"
                  }`}
                />
                <span className={isDark ? "text-slate-500" : "text-slate-400"}>{field.unit}</span>
                <span className={`ml-auto text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  ≈ {Math.round(t[field.key] / 60)} min
                </span>
              </div>
            </div>
          ))}
        </div>

        <div
          className={`flex items-center justify-between border-t px-4 py-3 ${
            isDark ? "border-slate-700 bg-slate-800" : "border-slate-100 bg-slate-50"
          }`}
        >
          <button
            onClick={handleReset}
            className={`text-xs ${isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"}`}
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className={`rounded px-3 py-1.5 text-xs ${
                isDark ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlaSettingsModal;
