import {
  AlertCircle,
  Car,
  Clock,
  CreditCard,
  DollarSign,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Users,
  User,
  X,
} from "lucide-react";
import React from "react";
import toast from "react-hot-toast";
import {
  useDispatchStore,
  type DispatchJob,
} from "../../store/useDispatchStore";

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
  const drivers = useDispatchStore((state) => state.drivers);
  const [selectedDriverId, setSelectedDriverId] = React.useState<string>("");
  const [cancelReason, setCancelReason] = React.useState<string>("");
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);

  if (!job) return null;

  const availableDrivers = drivers.filter((d) => d.status === "AVAILABLE");
  const canUnassign = job.status === "ASSIGNED";

  const handleAssign = () => {
    if (!selectedDriverId) {
      toast.error("Please select a driver");
      return;
    }
    onAssignDriver?.(job.id, selectedDriverId);
    onClose();
  };

  const handleCancel = () => {
    if (!cancelReason.trim()) {
      toast.error("Please provide a cancellation reason");
      return;
    }
    onCancelJob?.(job.id);
    setShowCancelDialog(false);
    onClose();
  };

  const handleEdit = () => {
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
        className: "bg-rose-100 text-rose-700 border-rose-300",
      },
      OFFERED: {
        label: "Offered",
        className: "bg-amber-100 text-amber-700 border-amber-300",
      },
      ASSIGNED: {
        label: "Assigned",
        className: "bg-emerald-100 text-emerald-700 border-emerald-300",
      },
      ACTIVE: {
        label: "Active",
        className: "bg-blue-100 text-blue-700 border-blue-300",
      },
      FINISHED: {
        label: "Finished",
        className: "bg-slate-100 text-slate-700 border-slate-300",
      },
      CANCELLED: {
        label: "Cancelled",
        className: "bg-slate-100 text-slate-600 border-slate-300",
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

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-auto rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900">Job Details</h2>
            <span className="rounded-md bg-blue-50 px-3 py-1 font-mono text-sm font-semibold text-blue-700">
              {job.reference}
            </span>
            {getStatusBadge(job.status)}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
          {/* Customer Info */}
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <User size={16} />
              Customer Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-slate-500">Name</span>
                <p className="font-medium text-slate-900">
                  {job.riderName || job.requirements?.passengerName || "N/A"}
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500">Phone</span>
                <p className="flex items-center gap-1 font-medium text-slate-900">
                  <Phone size={14} />
                  {job.riderPhone || job.requirements?.passengerPhone || "N/A"}
                </p>
              </div>
              {(job.customer?.email || job.requirements?.passengerEmail) && (
                <div className="col-span-2">
                  <span className="text-xs text-slate-500">Email</span>
                  <p className="flex items-center gap-1 font-medium text-slate-900">
                    <Mail size={14} />
                    {job.customer?.email || job.requirements?.passengerEmail}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Job Requirements */}
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Users size={16} />
              Job Requirements
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="rounded-md bg-white p-3 text-center border border-slate-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Users size={14} className="text-blue-600" />
                  <span className="text-xs text-slate-500">Passengers</span>
                </div>
                <p className="text-lg font-bold text-slate-900">
                  {job.requirements?.passengers || job.passengers || 1}
                </p>
              </div>
              <div className="rounded-md bg-white p-3 text-center border border-slate-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <DollarSign size={14} className="text-amber-600" />
                  <span className="text-xs text-slate-500">Bags</span>
                </div>
                <p className="text-lg font-bold text-slate-900">
                  {job.requirements?.bags ?? job.bags ?? 0}
                </p>
              </div>
              <div className="rounded-md bg-white p-3 text-center border border-slate-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <AlertCircle size={14} className="text-purple-600" />
                  <span className="text-xs text-slate-500">Wheelchairs</span>
                </div>
                <p className="text-lg font-bold text-slate-900">
                  {job.requirements?.wheelchairs ?? job.wheelchairs ?? 0}
                </p>
              </div>
            </div>
          </section>

          {/* Location Details */}
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Navigation size={16} />
              Trip Details
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <MapPin size={16} className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-medium text-slate-500">
                    Pickup Location
                  </span>
                  <p className="text-sm font-medium text-slate-900">
                    {job.pickupAddress}
                  </p>
                  {job.pickupLocation && (
                    <p className="text-xs text-slate-500">
                      {job.pickupLocation.latitude.toFixed(4)},{" "}
                      {job.pickupLocation.longitude.toFixed(4)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                  <MapPin size={16} className="text-green-600" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-medium text-slate-500">
                    Dropoff Location
                  </span>
                  <p className="text-sm font-medium text-slate-900">
                    {job.dropoffAddress}
                  </p>
                  {job.dropoffLocation && (
                    <p className="text-xs text-slate-500">
                      {job.dropoffLocation.latitude.toFixed(4)},{" "}
                      {job.dropoffLocation.longitude.toFixed(4)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Pricing & Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <DollarSign size={16} />
                Pricing
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Estimated Fare</span>
                  <span className="font-semibold text-slate-900">
                    {job.currency || "USD"} ${job.fareEstimate?.toFixed(2) || "0.00"}
                  </span>
                </div>
                {job.estimatedDistance && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Distance</span>
                    <span className="text-slate-700">
                      {job.estimatedDistance.toFixed(2)} km
                    </span>
                  </div>
                )}
                {(job.baseFare || job.requirements?.fareBreakdown?.base) && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Base Fare</span>
                    <span className="text-slate-700">
                      ${(job.baseFare || job.requirements?.fareBreakdown?.base || 0).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-300 pt-2">
                  <span className="text-slate-600">Tariff</span>
                  <span className="font-medium text-slate-900">
                    {job.tariffName || "Standard"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-300 pt-2">
                  <span className="text-slate-600">Payment Method</span>
                  <span className="flex items-center gap-1 font-medium text-slate-900">
                    <CreditCard size={14} />
                    {job.paymentMethod || "CASH"}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Clock size={16} />
                Schedule
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Requested</span>
                  <span className="font-medium text-slate-900">
                    {formatDate(job.requestedAt)}
                  </span>
                </div>
                {job.isScheduled && job.scheduledAt && (
                  <div className="flex flex-col gap-1 rounded-md bg-blue-50 border border-blue-200 p-2">
                    <span className="text-xs font-semibold text-blue-700">Scheduled For</span>
                    <span className="text-sm font-bold text-blue-900">
                      {new Date(job.scheduledAt).toLocaleString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">Status</span>
                  <span className="font-semibold text-blue-600">
                    {job.status}
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* Notes */}
          {job.notes && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertCircle size={16} />
                Special Notes
              </h3>
              <p className="text-sm text-amber-800">{job.notes}</p>
            </section>
          )}

          {/* Driver Assignment */}
          {job.status === "UNASSIGNED" && (
            <section className="rounded-lg border border-slate-200 bg-blue-50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Car size={16} />
                Assign Driver
              </h3>
              <div className="flex items-center gap-3">
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Select a driver</option>
                  {availableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name} - {driver.vehicle} ({driver.status})
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
            </section>
          )}

          {/* Driver Info (if assigned) */}
          {job.driverId && (
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Car size={16} />
                Assigned Driver
              </h3>
              <div className="flex items-center justify-between text-sm">
                <p className="font-semibold text-slate-900">
                  Driver ID: {job.driverId}
                </p>
                {canUnassign && (
                  <button
                    onClick={() => onUnassignDriver?.(job.id)}
                    className="rounded-md border border-amber-400 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                  >
                    Unassign Driver
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            onClick={() => setShowCancelDialog(true)}
            className="rounded-md border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            Cancel Job
          </button>
          <div className="flex items-center gap-3">
            {canUnassign && (
              <button
                onClick={() => onUnassignDriver?.(job.id)}
                className="rounded-md border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
              >
                Unassign
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
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
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-bold text-slate-900">
                Cancel Job
              </h3>
              <p className="mb-4 text-sm text-slate-600">
                Please provide a reason for cancelling this job:
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter cancellation reason..."
                className="mb-4 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                rows={3}
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowCancelDialog(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Keep Job
                </button>
                <button
                  onClick={handleCancel}
                  className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                >
                  Confirm Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobDetailsModal;
