import classNames from "classnames";
import { AlertTriangle, X } from "lucide-react";
import React from "react";
import { useTheme } from "../../contexts/ThemeContext";

interface ConfirmAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  driverName: string;
  jobReference: string;
}

const ConfirmAssignmentModal: React.FC<ConfirmAssignmentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  driverName,
  jobReference,
}) => {
  const { isDark } = useTheme();
  
  console.log("🔔 ConfirmAssignmentModal render:", {
    isOpen,
    driverName,
    jobReference,
  });

  if (!isOpen) {
    console.log("❌ Modal not open, returning null");
    return null;
  }

  console.log("✅ Modal is open, rendering...");

  const handleConfirm = () => {
    console.log("👍 Confirm clicked");
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={classNames(
        "relative w-full max-w-md rounded-lg p-6 shadow-2xl",
        isDark ? "bg-slate-800 border border-slate-700" : "bg-white"
      )}>
        {/* Close button */}
        <button
          onClick={onClose}
          className={classNames(
            "absolute right-4 top-4 transition",
            isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"
          )}
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={classNames(
            "flex h-14 w-14 items-center justify-center rounded-full",
            isDark ? "bg-amber-900/40" : "bg-amber-100"
          )}>
            <AlertTriangle size={28} className={isDark ? "text-amber-400" : "text-amber-600"} />
          </div>
        </div>

        {/* Content */}
        <div className="text-center">
          <h3 className={classNames(
            "text-xl font-semibold mb-2",
            isDark ? "text-slate-100" : "text-slate-900"
          )}>
            Confirm Job Assignment
          </h3>
          <p className={classNames(
            "text-base mb-2",
            isDark ? "text-slate-300" : "text-slate-700"
          )}>
            Are you sure you want to assign this job to{" "}
            <span className={classNames(
              "font-semibold",
              isDark ? "text-white" : "text-slate-900"
            )}>{driverName}</span>?
          </p>
          <p className={classNames(
            "text-sm mb-6",
            isDark ? "text-slate-400" : "text-slate-500"
          )}>Job #{jobReference}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className={classNames(
              "flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition",
              isDark 
                ? "border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600" 
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition"
          >
            Yes, Assign
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmAssignmentModal;
