import { AlertTriangle, X } from "lucide-react";
import React from "react";

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
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle size={28} className="text-amber-600" />
          </div>
        </div>

        {/* Content */}
        <div className="text-center">
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            Confirm Job Assignment
          </h3>
          <p className="text-base text-slate-700 mb-2">
            Are you sure you want to assign this job to{" "}
            <span className="font-semibold text-slate-900">{driverName}</span>?
          </p>
          <p className="text-sm text-slate-500 mb-6">Job #{jobReference}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
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
