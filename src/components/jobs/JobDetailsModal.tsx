import {
    Car,
    Clock,
    CreditCard,
    MapPin,
    Phone,
    X,
} from "lucide-react";
import React from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useTheme } from "../../contexts/ThemeContext";
import {
    useDispatchStore,
    type DispatchJob,
} from "../../store/useDispatchStore";
import { isAssignableJobStatus } from "../../utils/jobStatusHelpers";
import DriverVideoPanel from "./DriverVideoPanel";

interface JobDetailsModalProps {
  job: DispatchJob | null;
  onClose: () => void;
  onAssignDriver?: (jobId: string, driverId: string) => void;
  onCancelJob?: (jobId: string) => void;
  onUnassignDriver?: (jobId: string) => void;
  onEditJob?: (jobId: string, jobData: DispatchJob) => void;
}

const JobDetailsModal: React.FC<JobDetailsModalProps> = ({
  job,
  onClose,
  onAssignDriver,
  onCancelJob,
  onUnassignDriver,
  onEditJob,
}) => {
  const { isDark } = useTheme();
  const drivers = useDispatchStore((state) => state.drivers);
  const videoSession = useDispatchStore((state) => job ? state.videoSessions?.[job.id] : undefined);
  const [selectedDriverId, setSelectedDriverId] = React.useState<string>("");
  const [cancelReason, setCancelReason] = React.useState<string>("");
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);

  const availableDrivers = drivers.filter((d) => d.status === "AVAILABLE");
  const canUnassign = job?.status === "ASSIGNED";
  const canAssignDriver = job ? isAssignableJobStatus(job.status) : false;

  const handleAssign = () => {
    if (!job || !selectedDriverId) {
      toast.error("Please select a driver");
      return;
    }
    onAssignDriver?.(job.id, selectedDriverId);
    onClose();
  };

  const handleCancel = () => {
    if (!job || !cancelReason.trim()) {
      toast.error("Please provide a cancellation reason");
      return;
    }
    onCancelJob?.(job.id);
    setShowCancelDialog(false);
    onClose();
  };

  const handleEdit = () => {
    if (!job) {
      return;
    }
    onEditJob?.(job.id, job);
    onClose();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      UNASSIGNED: {
        label: "Unassigned",
        className: isDark ? "bg-rose-900/50 text-rose-300 border-rose-700" : "bg-rose-100 text-rose-700 border-rose-300",
      },
      PENDING: {
        label: "Pending",
        className: isDark ? "bg-amber-900/50 text-amber-300 border-amber-700" : "bg-amber-50 text-amber-700 border-amber-200",
      },
      OFFERED: {
        label: "Offered",
        className: isDark ? "bg-amber-900/50 text-amber-300 border-amber-700" : "bg-amber-100 text-amber-700 border-amber-300",
      },
      ASSIGNED: {
        label: "Assigned",
        className: isDark ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-emerald-100 text-emerald-700 border-emerald-300",
      },
      ACTIVE: {
        label: "Active",
        className: isDark ? "bg-blue-900/50 text-blue-300 border-blue-700" : "bg-blue-100 text-blue-700 border-blue-300",
      },
      FINISHED: {
        label: "Finished",
        className: isDark ? "bg-slate-700 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-700 border-slate-300",
      },
      CANCELLED: {
        label: "Cancelled",
        className: isDark ? "bg-slate-700 text-slate-400 border-slate-600" : "bg-slate-100 text-slate-600 border-slate-300",
      },
    };

    const badge = badges[status] || badges.UNASSIGNED;
    return (
      <span
        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}
      >
        {badge.label}
      </span>
    );
  };

  // Get currency code
  const currencyCode = (job?.requirements?.currency ?? job?.currency ?? "USD").toUpperCase();

  if (!job) {
    return null;
  }

  // Use createPortal to render modal outside of parent component hierarchy
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-lg max-h-[90vh] overflow-auto rounded-xl shadow-2xl border ${
          isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4 ${
          isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
        }`}>
          <div className="flex items-center gap-3">
            <h2 className={`text-lg font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>Job Details</h2>
            <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${
              isDark ? "bg-blue-900/50 text-blue-300" : "bg-blue-50 text-blue-700"
            }`}>
              {job.reference}
            </span>
            {getStatusBadge(job.status)}
          </div>
          <button
            onClick={onClose}
            className={`rounded-lg p-2 transition ${
              isDark ? "text-slate-400 hover:bg-slate-700 hover:text-slate-200" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          
          {/* Live Driver Video - Show when active */}
          {videoSession && (
            <DriverVideoPanel job={job} session={videoSession} />
          )}
          
          {/* Fare Summary - Top Priority */}
          <div className={`rounded-lg p-4 ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>Estimated Fare</p>
                <p className={`text-2xl font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  {currencyCode} ${job.fareEstimate?.toFixed(2) || "0.00"}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>Distance</p>
                <p className={`text-lg font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                  {job.estimatedDistance?.toFixed(2) || "—"} km
                </p>
              </div>
            </div>
            
            {/* Fare Breakdown - Simple Row */}
            <div className={`mt-3 pt-3 border-t grid grid-cols-4 gap-2 text-center text-xs ${
              isDark ? "border-slate-600" : "border-slate-200"
            }`}>
              <div>
                <p className={isDark ? "text-slate-400" : "text-slate-500"}>Base</p>
                <p className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                  ${(job.baseFare || job.requirements?.fareBreakdown?.base || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className={isDark ? "text-slate-400" : "text-slate-500"}>Distance</p>
                <p className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                  ${(job.distanceFare || job.requirements?.fareBreakdown?.distance || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className={isDark ? "text-slate-400" : "text-slate-500"}>Waiting</p>
                <p className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                  ${(job.waitingFare || job.requirements?.fareBreakdown?.waiting || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className={isDark ? "text-slate-400" : "text-slate-500"}>Tariff</p>
                <p className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                  {job.tariffName || "Standard"}
                </p>
              </div>
            </div>
          </div>

          {/* Customer & Schedule Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Customer */}
            <div className={`rounded-lg p-3 ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
              <p className={`text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Customer</p>
              <p className={`font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                {job.riderName || job.requirements?.passengerName || "N/A"}
              </p>
              <p className={`flex items-center gap-1 text-sm mt-1 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                <Phone className="w-3 h-3" />
                {job.riderPhone || job.requirements?.passengerPhone || "N/A"}
              </p>
            </div>
            
            {/* Schedule */}
            <div className={`rounded-lg p-3 ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
              <p className={`text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {job.isScheduled ? "Scheduled For" : "Requested"}
              </p>
              <p className={`font-semibold flex items-center gap-1 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                <Clock className="w-3.5 h-3.5" />
                {job.isScheduled && job.scheduledAt 
                  ? formatDate(job.scheduledAt)
                  : formatDate(job.requestedAt)
                }
              </p>
              <p className={`flex items-center gap-1 text-sm mt-1 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                <CreditCard className="w-3 h-3" />
                {job.paymentMethod || "CASH"}
              </p>
            </div>
          </div>

          {/* Locations - Side by Side */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-lg p-3 ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 flex-shrink-0">
                  <MapPin className="w-3 h-3 text-white" />
                </div>
                <p className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>Pickup</p>
              </div>
              <p className={`text-sm font-medium line-clamp-2 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                {typeof job.pickupAddress === 'object' ? (job.pickupAddress as any)?.address || 'Unknown' : job.pickupAddress}
              </p>
            </div>
            <div className={`rounded-lg p-3 ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 flex-shrink-0">
                  <MapPin className="w-3 h-3 text-white" />
                </div>
                <p className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>Dropoff</p>
              </div>
              <p className={`text-sm font-medium line-clamp-2 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                {typeof job.dropoffAddress === 'object' ? (job.dropoffAddress as any)?.address || 'Unknown' : job.dropoffAddress}
              </p>
            </div>
          </div>

          {/* Notes (if any) */}
          {(job.notes || job.requirements?.notes) && (
            <div className={`rounded-lg p-3 ${
              isDark ? "bg-amber-900/30 border border-amber-700" : "bg-amber-50 border border-amber-200"
            }`}>
              <p className={`text-xs font-semibold mb-1 ${isDark ? "text-amber-400" : "text-amber-700"}`}>Notes</p>
              <p className={`text-sm ${isDark ? "text-amber-200" : "text-amber-900"}`}>
                {job.notes || job.requirements?.notes}
              </p>
            </div>
          )}

          {/* Driver Assignment */}
          {canAssignDriver && (
            <div className={`rounded-lg p-3 ${isDark ? "bg-blue-900/30 border border-blue-700" : "bg-blue-50 border border-blue-200"}`}>
              <p className={`text-xs font-semibold mb-2 flex items-center gap-1 ${isDark ? "text-blue-300" : "text-blue-700"}`}>
                <Car className="w-3.5 h-3.5" />
                Assign Driver
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm outline-none ${
                    isDark 
                      ? "border-slate-600 bg-slate-700 text-slate-100 focus:border-blue-500" 
                      : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
                  }`}
                >
                  <option value="">Select driver...</option>
                  {availableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name} - {driver.vehicle}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAssign}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Assign
                </button>
              </div>
            </div>
          )}

          {/* Assigned Driver Info */}
          {job.driverId && (
            <div className={`rounded-lg p-3 flex items-center justify-between ${isDark ? "bg-emerald-900/30 border border-emerald-700" : "bg-emerald-50 border border-emerald-200"}`}>
              <div className="flex items-center gap-2">
                <Car className={`w-4 h-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                <span className={`text-sm font-medium ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                  Driver: {job.driverId}
                </span>
              </div>
              {canUnassign && (
                <button
                  onClick={() => onUnassignDriver?.(job.id)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                    isDark 
                      ? "bg-amber-900/50 text-amber-300 hover:bg-amber-900" 
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  }`}
                >
                  Unassign
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`sticky bottom-0 z-10 flex items-center justify-between border-t px-5 py-3 ${
          isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
        }`}>
          <button
            onClick={() => setShowCancelDialog(true)}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              isDark 
                ? "text-rose-400 hover:bg-rose-900/30" 
                : "text-rose-600 hover:bg-rose-50"
            }`}
          >
            Cancel Job
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                isDark 
                  ? "text-slate-300 hover:bg-slate-700" 
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Close
            </button>
            <button 
              onClick={handleEdit}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Edit Job
            </button>
          </div>
        </div>

        {/* Cancel Dialog */}
        {showCancelDialog && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4 rounded-xl">
            <div className={`w-full max-w-sm rounded-lg p-5 shadow-xl ${isDark ? "bg-slate-800" : "bg-white"}`}>
              <h3 className={`mb-3 text-lg font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                Cancel Job
              </h3>
              <p className={`mb-3 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Reason for cancellation:
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason..."
                className={`mb-4 w-full rounded-md border p-3 text-sm outline-none ${
                  isDark 
                    ? "border-slate-600 bg-slate-700 text-slate-100 placeholder-slate-500" 
                    : "border-slate-300 bg-white text-slate-900 placeholder-slate-400"
                }`}
                rows={2}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowCancelDialog(false)}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                    isDark ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Keep
                </button>
                <button
                  onClick={handleCancel}
                  className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                >
                  Cancel Job
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default JobDetailsModal;
