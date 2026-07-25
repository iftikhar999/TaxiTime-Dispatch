import {
    AlertTriangle,
    Activity,
    Banknote,
    Car,
    CheckCircle,
    Clock,
    CreditCard,
    MapPin,
    Phone,
    Receipt,
    RefreshCw,
    Wallet,
    X,
} from "lucide-react";
import React from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useTheme } from "../../contexts/ThemeContext";
import { useDispatchController } from "../../hooks/useDispatchController";
import { useDispatchSocket } from "../../providers/SocketProvider";
import {
    useDispatchStore,
    type DispatchJob,
} from "../../store/useDispatchStore";
import { isAssignableJobStatus } from "../../utils/jobStatusHelpers";
import { calculateStripeFee, formatFee } from "../../utils/stripeFeeCalculator";
import api from "../../services/api";

// --- Inline JobTimelineModal ---
// Displays the chronological event stream for a job (assignments, offers,
// status transitions, audit logs) so the dispatcher can self-diagnose
// "why did this job behave weirdly". Backed by GET /api/dispatch/jobs/
// :jobId/timeline which combines four data sources server-side.
type TimelineEvent = {
  timestamp: string;
  kind: string;
  summary: string;
  driverId: string | null;
  driverName: string | null;
  detail: any;
};
const JobTimelineModal: React.FC<{
  jobId: string;
  jobReference: string;
  onClose: () => void;
}> = ({ jobId, jobReference, onClose }) => {
  const { isDark } = useTheme();
  const [events, setEvents] = React.useState<TimelineEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<Record<string, number>>({});

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.get(`/api/dispatch/jobs/${jobId}/timeline`);
      const list: TimelineEvent[] = Array.isArray(res?.events) ? res.events : [];
      setEvents(list);
      setCounts(res?.counts || {});
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  React.useEffect(() => { refresh(); }, [refresh]);

  const kindColor = (kind: string): string => {
    if (kind.includes('REJECT')) return isDark ? 'text-rose-300 bg-rose-900/40' : 'text-rose-700 bg-rose-50';
    if (kind.includes('TIMEOUT')) return isDark ? 'text-amber-300 bg-amber-900/40' : 'text-amber-700 bg-amber-50';
    if (kind.includes('ACCEPT')) return isDark ? 'text-emerald-300 bg-emerald-900/40' : 'text-emerald-700 bg-emerald-50';
    if (kind.includes('OFFER') || kind.includes('ASSIGN')) return isDark ? 'text-indigo-300 bg-indigo-900/40' : 'text-indigo-700 bg-indigo-50';
    if (kind.includes('CREATE')) return isDark ? 'text-blue-300 bg-blue-900/40' : 'text-blue-700 bg-blue-50';
    return isDark ? 'text-slate-300 bg-slate-800' : 'text-slate-700 bg-slate-100';
  };

  const fmtTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    } catch { return iso; }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className={`w-full max-w-3xl rounded-xl border shadow-2xl flex flex-col max-h-[88vh] ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <h2 className={`text-base font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>Job Timeline</h2>
            <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
              {jobReference}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={refresh}
              disabled={loading}
              title="Refresh"
              className={`rounded p-1.5 ${isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200'} ${loading ? 'opacity-50' : ''}`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className={`rounded p-1.5 ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-200'}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className={`px-4 py-2 text-xs ${isDark ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-50 text-rose-700'}`}>
            {error}
          </div>
        )}

        <div className={`px-4 py-2 text-[10px] flex gap-3 border-b ${isDark ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-200'}`}>
          <span>Assignments: <strong>{counts.assignments ?? '·'}</strong></span>
          <span>Offers: <strong>{counts.offers ?? '·'}</strong></span>
          <span>Status changes: <strong>{counts.jobEvents ?? '·'}</strong></span>
          <span>Audit logs: <strong>{counts.auditLogs ?? '·'}</strong></span>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          {loading && events.length === 0 ? (
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Loading…</p>
          ) : events.length === 0 ? (
            <p className={`text-sm text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No events recorded.</p>
          ) : (
            <ol className="space-y-2">
              {events.map((ev, i) => (
                <li key={i} className={`rounded-lg border p-2.5 ${isDark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${kindColor(ev.kind)}`}>
                      {ev.kind}
                    </span>
                    <span className={`font-mono text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {fmtTime(ev.timestamp)}
                    </span>
                  </div>
                  <div className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{ev.summary}</div>
                  {ev.detail && Object.keys(ev.detail).length > 0 && (
                    <details className="mt-1">
                      <summary className={`cursor-pointer text-[10px] ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}>detail</summary>
                      <pre className={`mt-1 overflow-x-auto rounded p-2 text-[10px] font-mono ${isDark ? 'bg-slate-950 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
                        {JSON.stringify(ev.detail, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
import DriverVideoPanel from "./DriverVideoPanel";
import { useV2Stops, useV2Pod } from "../../hooks/useV2Stops";
import { ServiceTypeBadge } from "../v2/ServiceTypeSelector";
import classNames from "classnames";
import IssueRefundModal from "../refunds/IssueRefundModal";
import { listRefunds, type Refund } from "../../services/refundService";

interface JobDetailsModalProps {
  job: DispatchJob | null;
  onClose: () => void;
  onAssignDriver?: (jobId: string, driverId: string) => void;
  onCancelJob?: (jobId: string, reason?: string, refundAction?: 'STRIPE_REFUND' | 'WALLET_CREDIT' | 'MANUAL_REFUND', manualRefundAcknowledged?: boolean) => void;
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
  const { socket } = useDispatchSocket();
  const { fetchJobs, fetchJobCounters } = useDispatchController();

  // Show/hide the activity-timeline modal (chronological event stream
  // for this job — assignments, offers, status changes, audit logs).
  const [showTimeline, setShowTimeline] = React.useState(false);

  // Listen for live job lifecycle events for the currently-open job so the
  // modal reflects the server truth without polling. We refetch the lists
  // (which drives the store entry powering this modal) and, on a terminal
  // transition for this job, surface a toast so the dispatcher notices.
  React.useEffect(() => {
    if (!socket || !job?.id) return;
    const jobId = job.id;
    const matches = (payload: any) =>
      !payload || payload.jobId === jobId || payload.id === jobId;

    const handleAssigned = (payload: any) => {
      if (!matches(payload)) return;
      fetchJobs();
      fetchJobCounters();
    };
    const handleStatus = (payload: any) => {
      if (!matches(payload)) return;
      fetchJobs();
      fetchJobCounters();
    };
    const handleCancelled = (payload: any) => {
      if (!matches(payload)) return;
      fetchJobs();
      fetchJobCounters();
      toast("Job was cancelled", { icon: "🛑" });
    };
    const handleCompleted = (payload: any) => {
      if (!matches(payload)) return;
      fetchJobs();
      fetchJobCounters();
    };

    socket.on("job:assigned", handleAssigned);
    socket.on("job:status", handleStatus);
    socket.on("job:cancelled", handleCancelled);
    socket.on("job:completed", handleCompleted);
    return () => {
      socket.off("job:assigned", handleAssigned);
      socket.off("job:status", handleStatus);
      socket.off("job:cancelled", handleCancelled);
      socket.off("job:completed", handleCompleted);
    };
  }, [socket, job?.id, fetchJobs, fetchJobCounters]);
  const [selectedDriverId, setSelectedDriverId] = React.useState<string>("");
  const [cancelReason, setCancelReason] = React.useState<string>("");
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [refundAction, setRefundAction] = React.useState<'STRIPE_REFUND' | 'WALLET_CREDIT' | 'MANUAL_REFUND' | null>(null);
  const [manualRefundAck, setManualRefundAck] = React.useState(false);
  const [cancelLoading, setCancelLoading] = React.useState(false);

  // Wave 2D — refund UI
  const [showRefundModal, setShowRefundModal] = React.useState(false);
  const [jobRefunds, setJobRefunds] = React.useState<Refund[]>([]);
  const loadJobRefunds = React.useCallback(async () => {
    if (!job?.id) return;
    try {
      const res = await listRefunds({ jobId: job.id });
      setJobRefunds(res.refunds || []);
    } catch {
      /* non-fatal */
    }
  }, [job?.id]);
  React.useEffect(() => {
    if (job?.id && job.paymentStatus === "PAID") {
      loadJobRefunds();
    } else {
      setJobRefunds([]);
    }
  }, [job?.id, job?.paymentStatus, loadJobRefunds]);

  // Determine if this is a paid job
  const isPaidJob = job?.paymentStatus === 'PAID' && (job?.paymentMethod || '').toUpperCase() === 'CARD';
  const paidAmount = Number(job?.totalCharged ?? job?.chargedAmount ?? job?.fareEstimate ?? job?.estimatedPrice ?? 0);

  const isV2Service = job?.serviceType && job.serviceType !== "TAXI";
  const {
    stops,
    progress,
    currentStop,
    loading: stopsLoading,
    error: stopsError,
    v2Available,
    refetch: refetchStops,
    arrive,
    complete,
    fail,
    skip,
  } = useV2Stops(job?.id ?? null, {
    enabled: Boolean(job?.id && isV2Service),
    autoRefresh: true,
    refreshInterval: 15000,
  });

  const {
    proofs,
    requirements,
    loading: podLoading,
    error: podError,
  } = useV2Pod(job?.id ?? null, currentStop?.id ?? null, {
    enabled: Boolean(job?.id && currentStop?.id && isV2Service),
  });

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

  const handleCancel = async () => {
    if (!job || !cancelReason.trim()) {
      toast.error("Please provide a cancellation reason");
      return;
    }
    if (isPaidJob && !refundAction) {
      toast.error("Please select a refund option for this paid job");
      return;
    }
    if (isPaidJob && refundAction === 'MANUAL_REFUND' && !manualRefundAck) {
      toast.error("Please acknowledge the manual refund");
      return;
    }
    setCancelLoading(true);
    try {
      await onCancelJob?.(job.id, cancelReason.trim(), refundAction || undefined, manualRefundAck || undefined);
      setCancelReason("");
      setRefundAction(null);
      setManualRefundAck(false);
      setShowCancelDialog(false);
      onClose();
    } catch (err) {
      // Error handled by parent
    } finally {
      setCancelLoading(false);
    }
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
  // Display label resolution for payment method. The driver app sends
  // semantic labels (CASH / TAP_TO_PAY / CARD / EFTPOS / ACCOUNT /
  // GIFT_CARD), but the backend has to map non-enum values to the
  // Prisma enum (WALLET / CARD / BANK_TRANSFER) and stashes the original
  // in metadata.originalPaymentMethod. Here we recover the user-facing
  // label so the dispatcher sees "Gift Card" instead of "WALLET",
  // "EFTPOS" instead of "CARD", etc.
  const labelForPaymentMethod = (raw: string | null | undefined, originalRaw?: string | null): string => {
    const original = String(originalRaw || '').toUpperCase();
    const enumValue = String(raw || '').toUpperCase();
    const fromOriginal: Record<string, string> = {
      CASH: 'Cash',
      CARD: 'Card',
      TAP_TO_PAY: 'Tap to Pay',
      EFTPOS: 'EFTPOS',
      EPOS: 'EFTPOS',
      ACCOUNT: 'Account',
      GIFT_CARD: 'Gift Card',
      VOUCHER: 'Voucher',
      APPLE_PAY: 'Apple Pay',
      GOOGLE_PAY: 'Google Pay',
      STRIPE: 'Card (Online)',
    };
    if (original && fromOriginal[original]) return fromOriginal[original];
    const fromEnum: Record<string, string> = {
      CASH: 'Cash',
      CARD: 'Card',
      WALLET: 'Wallet',
      DIGITAL_WALLET: 'Digital Wallet',
      BANK_TRANSFER: 'Account',
    };
    return fromEnum[enumValue] || (raw || 'Cash');
  };
  const firstTxOriginalMethod = Array.isArray(job?.transactions) && job.transactions.length > 0
    ? (((job.transactions[0] as any)?.metadata?.originalPaymentMethod) || null)
    : null;
  const displayPaymentMethod = labelForPaymentMethod(
    (job as any)?.paymentMethod || (job as any)?.transactions?.[0]?.method || (job as any)?.transactions?.[0]?.paymentMethod,
    firstTxOriginalMethod,
  );

  // Currency resolution: the actual transaction is the most authoritative
  // source — that's the money that physically moved. Old buggy job rows
  // have `requirements.currency = "USD"` even on NZ tenants, so reading
  // requirements first mislabels the whole top section. Order:
  //   1. The first transaction's currency (real money)
  //   2. job.currency (top-level)
  //   3. requirements.currency (legacy fallback, often wrong)
  //   4. "NZD" — better default than "USD" for our NZ/AU/QA tenants.
  const txCurrency = Array.isArray(job?.transactions) && job.transactions.length > 0
    ? (job.transactions[0]?.currency || null)
    : null;
  const currencyCode = String(
    txCurrency ?? job?.currency ?? job?.requirements?.currency ?? "NZD",
  ).toUpperCase();

  // A job is "finalised" once it's completed/finished/cancelled — at that
  // point we should display the ACTUAL recorded amounts (final fare,
  // actual distance) instead of the estimates. Estimates are wrong for
  // closed trips and confuse the dispatcher (they read like the customer
  // was charged the estimated number).
  const finishedStatuses = ["COMPLETED", "FINISHED", "CANCELLED", "CANCELED", "NOSHOW", "NO_SHOW"];
  const isFinalised = finishedStatuses.includes(String(job?.status || "").toUpperCase());

  // Helper: return the first numeric, finite, non-zero value. CRITICAL:
  // we use truthy semantics here, NOT the `??` operator. Old job rows
  // often have `actualFare: 0` (driver never confirmed) AND a real
  // `chargedAmount: 9.09` from a transaction. With `??` the zero blocked
  // the chargedAmount → user saw "Final Fare $0.00" while CHARGED below
  // showed $9.09 for the same job. Pick the first non-zero.
  const firstNonZero = (...candidates: any[]): number | null => {
    for (const c of candidates) {
      const n = typeof c === 'number' ? c : Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  // Pull the best-available "what was actually charged" number.
  const finalisedFareAmount = firstNonZero(
    (job as any)?.actualFare,
    (job as any)?.finalAmount,
    job?.chargedAmount,
    Array.isArray(job?.transactions) && job.transactions.length > 0
      ? Number((job.transactions[0] as any)?.amount)
      : null,
    job?.fareEstimate,
  );
  // Distance: a finished job with no dropoff has phantom km from old
  // pickup-only-fare bug. If no actual distance was recorded AND no
  // dropoff coords were ever set, hide rather than show the phantom.
  const hasDropoffCoords = !!(
    (job as any)?.dropoffLatitude && (job as any)?.dropoffLongitude
  );
  const actualDistanceKm = firstNonZero(
    (job as any)?.actualDistanceKm,
    (job as any)?.actualDistance,
  );
  const finalisedDistanceKm = isFinalised
    ? actualDistanceKm ?? (hasDropoffCoords ? job?.estimatedDistance ?? null : null)
    : (hasDropoffCoords ? job?.estimatedDistance ?? null : null);
  const fareLabel = isFinalised ? "Final Fare" : "Estimated Fare";
  const distanceLabel = isFinalised ? "Distance" : "Distance";
  const fareDisplayAmount = isFinalised
    ? finalisedFareAmount
    : firstNonZero(job?.fareEstimate);
  const distanceDisplayKm = finalisedDistanceKm;

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
            {job.serviceType && (
              <ServiceTypeBadge serviceType={job.serviceType} size="small" />
            )}
            {getStatusBadge(job.status)}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowTimeline(true)}
              title="View activity timeline"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                isDark ? "text-indigo-300 hover:bg-indigo-900/40 border border-indigo-800" : "text-indigo-700 hover:bg-indigo-50 border border-indigo-200"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Timeline
            </button>
            <button
              onClick={onClose}
              className={`rounded-lg p-2 transition ${
                isDark ? "text-slate-400 hover:bg-slate-700 hover:text-slate-200" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showTimeline && (
          <JobTimelineModal
            jobId={job.id}
            jobReference={job.reference}
            onClose={() => setShowTimeline(false)}
          />
        )}

        {/* Content */}
        <div className="p-5 space-y-4">
          
          {/* Live Driver Video - Show when active */}
          {videoSession && (
            <DriverVideoPanel job={job} session={videoSession} />
          )}
          
          {/* Fare Summary - Top Priority. Header switches between
              "Estimated Fare" (offer/active) and "Final Fare" (after the
              trip is closed) so the dispatcher knows whether the number
              is a quote or a charge. Same for distance. */}
          <div className={`rounded-lg p-4 ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>{fareLabel}</p>
                <p className={`text-2xl font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  {currencyCode} ${typeof fareDisplayAmount === 'number' ? fareDisplayAmount.toFixed(2) : "0.00"}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>{distanceLabel}</p>
                <p className={`text-lg font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                  {typeof distanceDisplayKm === 'number' ? `${distanceDisplayKm.toFixed(2)} km` : "—"}
                </p>
              </div>
            </div>
            
            {/* Fare Breakdown - Simple Row */}
            <div className={`mt-3 pt-3 border-t grid grid-cols-4 gap-2 text-center text-xs ${
              isDark ? "border-slate-600" : "border-slate-200"
            }`}>
              {(() => {
                // Breakdown resolution. Three sources, in priority order:
                //   1. Stored fareBreakdown on the job (filled in by composer)
                //   2. Direct fields on the job (baseFare/distanceFare/...)
                //   3. Derived from the tariff lookup (TM2 → baseFare, perKm,
                //      waitingFee) × actual distance + waiting time.
                // The third source is what saves the dispatcher from looking
                // at "USD 0.00 / USD 0.00 / USD 0.00" on every closed job
                // because the driver app didn't ship a breakdown — the
                // tariff record on the server has the rates, we can rebuild.
                const breakdown = (job as any)?.requirements?.fareBreakdown || (job as any)?.fareBreakdown || {};
                const tariffId = (job as any)?.tariffId || (job as any)?.requirements?.tariffId;
                const tariffsList = useDispatchStore.getState().tariffs as any[];
                const tariff = tariffsList.find(
                  (t: any) => t.id === tariffId || t.identifier === tariffId,
                );

                // Distance & waiting time we can plug into rate × qty.
                const distanceForFare =
                  (job as any)?.actualDistanceKm ??
                  (job as any)?.actualDistance ??
                  (hasDropoffCoords ? job?.estimatedDistance : null);
                const waitingMinutes =
                  (job as any)?.actualWaitingMinutes ??
                  (job as any)?.waitingMinutes ??
                  (job as any)?.requirements?.waitingMinutes ??
                  null;

                const derivedBase = tariff?.baseFare != null ? Number(tariff.baseFare) : null;
                const derivedDistanceFare =
                  tariff?.perKm != null && typeof distanceForFare === 'number' && distanceForFare > 0
                    ? Number(tariff.perKm) * distanceForFare
                    : null;
                // Waiting rate sometimes lives on `waitingFee`, sometimes on
                // `perMinute` depending on the schema version. Prefer waitingFee.
                const waitingPerMin =
                  tariff?.waitingFee != null
                    ? Number(tariff.waitingFee)
                    : tariff?.perMinute != null
                    ? Number(tariff.perMinute)
                    : null;
                const derivedWaitingFare =
                  waitingPerMin != null && typeof waitingMinutes === 'number' && waitingMinutes > 0
                    ? waitingPerMin * waitingMinutes
                    : null;

                // Pick stored values over derived ones, but skip stored zero
                // (same reason as Final Fare — `0` blocks a real derived value).
                const base =
                  firstNonZero((job as any)?.baseFare, breakdown?.base, derivedBase);
                const distFare =
                  firstNonZero((job as any)?.distanceFare, breakdown?.distance, derivedDistanceFare);
                const waitFare =
                  firstNonZero((job as any)?.waitingFare, breakdown?.waiting, derivedWaitingFare);

                const fmt = (v: number | null) => (v == null ? '—' : `${currencyCode} ${v.toFixed(2)}`);
                return (
                  <>
                    <div>
                      <p className={isDark ? "text-slate-400" : "text-slate-500"}>Base</p>
                      <p className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>{fmt(base)}</p>
                    </div>
                    <div>
                      <p className={isDark ? "text-slate-400" : "text-slate-500"}>Distance</p>
                      <p className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>{fmt(distFare)}</p>
                    </div>
                    <div>
                      <p className={isDark ? "text-slate-400" : "text-slate-500"}>Waiting</p>
                      <p className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>{fmt(waitFare)}</p>
                    </div>
                  </>
                );
              })()}
              <div>
                <p className={isDark ? "text-slate-400" : "text-slate-500"}>Tariff</p>
                <p className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                  {job.tariffName || job.requirements?.tariffName || "Standard"}
                </p>
              </div>
            </div>
          </div>

          {/* ───── Taxi multi-stop waypoints ─────────────────────────
              Shows pickup → intermediate stops → dropoff in order for any
              job whose requirements JSON carries a `stops` array (typical
              of dispatch-created TAXI jobs with waypoints). The V2 block
              below handles COURIER deliveries with per-stop status + POD.
              These are intentionally separate because TAXI waypoints are
              lightweight addresses while COURIER stops carry proof +
              contact info. */}
          {(() => {
            const taxiStops = Array.isArray(job?.requirements?.stops) ? job.requirements.stops : [];
            if (isV2Service || taxiStops.length === 0) return null;
            const currentStopIndex = Number(job?.requirements?.currentStopIndex) || 0;
            return (
              <div className={`rounded-lg p-4 ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
                <div className="mb-3">
                  <p className={`text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    Route ({taxiStops.length + 2} points)
                  </p>
                  <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Driver is currently heading to{" "}
                    {currentStopIndex < taxiStops.length
                      ? `Stop ${currentStopIndex + 1}`
                      : "final destination"}
                  </p>
                </div>
                <ol className="space-y-1.5 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex w-5 h-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                      ●
                    </span>
                    <div className="flex-1">
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                        Pickup
                      </p>
                      <p className={isDark ? "text-slate-200" : "text-slate-800"}>{job?.pickupAddress}</p>
                    </div>
                  </li>
                  {taxiStops.map((stop: any, i: number) => {
                    const isCurrent = i === currentStopIndex;
                    const isDone = i < currentStopIndex;
                    const dotColor = isDone
                      ? "bg-slate-400"
                      : isCurrent
                        ? "bg-blue-500 ring-2 ring-blue-300"
                        : "bg-amber-500";
                    return (
                      <li
                        key={`stop-${i}`}
                        className={`flex items-start gap-2 ${
                          isCurrent
                            ? isDark
                              ? "bg-blue-950/40 rounded px-2 py-1 -mx-2"
                              : "bg-blue-50 rounded px-2 py-1 -mx-2"
                            : ""
                        }`}
                      >
                        <span className={`mt-0.5 inline-flex w-5 h-5 items-center justify-center rounded-full text-white text-[10px] font-bold ${dotColor}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <p className={`text-[11px] font-semibold uppercase tracking-wide ${
                            isCurrent
                              ? "text-blue-500"
                              : isDark ? "text-amber-400" : "text-amber-700"
                          }`}>
                            Stop {i + 1}{isCurrent ? " · in progress" : isDone ? " · completed" : ""}
                          </p>
                          <p className={isDark ? "text-slate-200" : "text-slate-800"}>{stop.address || "—"}</p>
                        </div>
                      </li>
                    );
                  })}
                  <li className="flex items-start gap-2">
                    <span className={`mt-0.5 inline-flex w-5 h-5 items-center justify-center rounded-full text-white text-[10px] font-bold ${
                      currentStopIndex >= taxiStops.length ? "bg-blue-500 ring-2 ring-blue-300" : "bg-rose-500"
                    }`}>
                      ★
                    </span>
                    <div className="flex-1">
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${
                        currentStopIndex >= taxiStops.length
                          ? "text-blue-500"
                          : isDark ? "text-rose-400" : "text-rose-700"
                      }`}>
                        Dropoff{currentStopIndex >= taxiStops.length ? " · in progress" : ""}
                      </p>
                      <p className={isDark ? "text-slate-200" : "text-slate-800"}>{job?.dropoffAddress}</p>
                    </div>
                  </li>
                </ol>
              </div>
            );
          })()}

          {/* Stops & POD for V2 Delivery/Courier */}
          {isV2Service && (
            <div className={`rounded-lg p-4 ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className={`text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Stops & POD</p>
                  <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Track stop progress and POD requirements
                  </p>
                </div>
                <button
                  className="text-xs px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-100"
                  onClick={() => refetchStops()}
                >
                  Refresh
                </button>
              </div>
              {!v2Available && (
                <p className="text-xs text-amber-500">V2 API not available for stops.</p>
              )}
              {stopsLoading && <p className="text-xs text-slate-400">Loading stops…</p>}
              {stopsError && (
                <p className="text-xs text-rose-500">Failed to load stops: {String(stopsError)}</p>
              )}
              {!stopsLoading && stops?.length === 0 && (
                <p className="text-xs text-slate-500">No stops for this job.</p>
              )}
              {stops && stops.length > 0 && (
                <div className="space-y-2">
                  {progress && (
                    <div className="text-[11px] text-slate-500">
                      {progress.completed || 0} of {progress.total || stops.length} completed • Current stop{" "}
                      {progress.currentStop ?? "—"}
                    </div>
                  )}
                  {stops.map((stop: any) => {
                    const isCurrent = currentStop && currentStop.id === stop.id;
                    const status = String(stop.status || "PENDING").toUpperCase();
                    const statusBadge = (
                      <span
                        className={classNames(
                          "text-[10px] font-semibold px-2 py-1 rounded-full",
                          status === "DELIVERED"
                            ? "bg-emerald-100 text-emerald-700"
                            : status === "ARRIVED"
                            ? "bg-amber-100 text-amber-700"
                            : status === "FAILED"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {status}
                      </span>
                    );
                    return (
                      <div
                        key={stop.id}
                        className={classNames(
                          "rounded-md border px-3 py-2",
                          isDark ? "border-slate-700 bg-slate-900/50" : "border-slate-200 bg-white",
                          isCurrent && "ring-1 ring-blue-400"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">
                                #{stop.sequence} {stop.type || "STOP"}
                              </span>
                              {statusBadge}
                            </div>
                            <p className="text-[11px] text-slate-500">{stop.address}</p>
                          </div>
                          <div className="flex gap-1">
                            {(status === "PENDING" || status === "READY") && (
                              <button
                                className="text-[11px] px-2 py-1 rounded-md border border-slate-300 hover:bg-slate-100"
                                onClick={() => arrive(stop.id)}
                              >
                                Arrive
                              </button>
                            )}
                            {(status === "ARRIVED" || status === "IN_TRANSIT" || status === "PICKED_UP") && (
                              <button
                                className="text-[11px] px-2 py-1 rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => complete(stop.id)}
                              >
                                Complete
                              </button>
                            )}
                            {(status === "ARRIVED" || status === "IN_TRANSIT" || status === "PENDING") && (
                              <button
                                className="text-[11px] px-2 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50"
                                onClick={() => fail(stop.id, "Failed/undeliverable")}
                              >
                                Fail
                              </button>
                            )}
                            {status !== "DELIVERED" && status !== "FAILED" && (
                              <button
                                className="text-[11px] px-2 py-1 rounded-md border border-slate-300 hover:bg-slate-100"
                                onClick={() => skip(stop.id, "Skipped by dispatcher")}
                              >
                                Skip
                              </button>
                            )}
                          </div>
                        </div>
                        {isCurrent && (
                          <div className="mt-2 text-[11px] text-slate-600">
                            {requirements ? (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">POD:</span>
                                <span>
                                  {requirements.required
                                    ? `Required (${requirements.type || "ANY"})`
                                    : "Not required"}
                                </span>
                                {proofs?.length ? (
                                  <span className="text-emerald-600">
                                    {proofs.length} proof{proofs.length === 1 ? "" : "s"} captured
                                  </span>
                                ) : (
                                  <span className="text-amber-600">No proofs yet</span>
                                )}
                              </div>
                            ) : (
                              <span>POD info not available</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
                {(job.paymentMethod || 'CASH').toUpperCase() === 'CARD' ? (
                  <CreditCard className="w-3 h-3" />
                ) : (
                  <Banknote className="w-3 h-3" />
                )}
                {displayPaymentMethod}
                {job.paymentStatus === 'PAID' && (
                  <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold text-white uppercase">
                    <CreditCard className="w-2.5 h-2.5" />
                    PAID {job.chargedAmount ? `$${Number(job.chargedAmount).toFixed(2)}` : ''}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Parcel info — non-TAXI only. Surfaces what the passenger
              entered when booking (recipient, weight, fragile, photo
              proof, parcel description) so the dispatcher doesn't have
              to crack open requirements / instructions to find it. Reads
              several legacy/new shapes because old jobs only have it
              buried in instructions while new ones have proper JSON. */}
          {job.serviceType && job.serviceType !== "TAXI" && (() => {
            const c = (job as any).ride?.courierDetails || (job as any).courierDetails || null;
            const d = (job as any).ride?.foodDeliveryDetails || (job as any).deliveryDetails || null;
            const meta = c || d || {};
            const recipient = meta.recipient || {};
            const sender = meta.sender || {};
            const weight = meta.totalWeightKg ?? meta.weightKg ?? null;
            const desc = meta.parcelDescriptions?.[0] || meta.notes || null;
            const fragile = !!meta.fragile;
            const proof = !!(meta.proofRequired ?? d?.proofRequired);
            const hasAny = !!(recipient.name || recipient.phone || weight || desc || fragile || proof || sender.name);
            if (!hasAny) return null;
            return (
              <div className={`rounded-lg p-3 border ${
                isDark ? "bg-amber-900/10 border-amber-800/40" : "bg-amber-50 border-amber-200"
              }`}>
                <p className={`text-xs font-semibold mb-2 uppercase tracking-wide ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                  {job.serviceType === "COURIER" ? "Courier Parcel" : "Delivery Parcel"}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {recipient.name && (
                    <div>
                      <p className={`text-[10px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>Recipient</p>
                      <p className={`font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{recipient.name}</p>
                      {recipient.phone && <p className={isDark ? "text-slate-300" : "text-slate-600"}>{recipient.phone}</p>}
                    </div>
                  )}
                  {sender.name && (
                    <div>
                      <p className={`text-[10px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>Sender</p>
                      <p className={`font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{sender.name}</p>
                      {sender.phone && <p className={isDark ? "text-slate-300" : "text-slate-600"}>{sender.phone}</p>}
                    </div>
                  )}
                  {desc && (
                    <div className="col-span-2">
                      <p className={`text-[10px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>Contents</p>
                      <p className={isDark ? "text-slate-200" : "text-slate-800"}>{desc}</p>
                    </div>
                  )}
                  {weight != null && (
                    <div>
                      <p className={`text-[10px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>Weight</p>
                      <p className={`font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{Number(weight).toFixed(1)} kg</p>
                    </div>
                  )}
                  {(fragile || proof) && (
                    <div className="col-span-2 flex items-center gap-2 pt-1">
                      {fragile && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isDark ? "bg-rose-900/40 text-rose-300" : "bg-rose-100 text-rose-700"
                        }`}>FRAGILE</span>
                      )}
                      {proof && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700"
                        }`}>PHOTO PROOF</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Payment & Transaction Section - Show for card payments or paid jobs */}
          {(job.paymentStatus === 'PAID' || job.paymentMethod === 'CARD' || (job.transactions && job.transactions.length > 0) || (job.extraCharges && job.extraCharges.length > 0)) && (
            <div className={`rounded-lg p-3 ${
              job.paymentStatus === 'PAID'
                ? isDark ? "bg-red-900/20 border border-red-700/50" : "bg-red-50 border border-red-200"
                : isDark ? "bg-slate-800 border border-slate-700" : "bg-slate-50 border border-slate-200"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-xs font-semibold flex items-center gap-1.5 ${
                  job.paymentStatus === 'PAID'
                    ? isDark ? "text-red-400" : "text-red-700"
                    : isDark ? "text-slate-300" : "text-slate-700"
                }`}>
                  <Receipt className="w-3.5 h-3.5" />
                  Payment & Transactions
                </p>
                {job.paymentStatus === 'PAID' && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    isDark ? "bg-red-600 text-white" : "bg-red-500 text-white"
                  }`}>
                    <CreditCard className="w-3 h-3" />
                    PAID {job.chargedAmount ? `$${Number(job.chargedAmount).toFixed(2)}` : ''}
                  </span>
                )}
              </div>
              
              {/* Payment Summary Grid */}
              <div className={`grid grid-cols-2 gap-3 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                <div className={`rounded-md p-2 ${isDark ? "bg-slate-800/80" : "bg-white"}`}>
                  <span className={`block text-[10px] uppercase tracking-wide mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Method</span>
                  <span className="font-semibold flex items-center gap-1">
                    {(job.paymentMethod || 'CASH').toUpperCase() === 'CARD' ? (
                      <CreditCard className="w-3 h-3" />
                    ) : (
                      <Banknote className="w-3 h-3" />
                    )}
                    {displayPaymentMethod}
                  </span>
                </div>
                {job.chargedAmount != null && (
                  <div className={`rounded-md p-2 ${isDark ? "bg-slate-800/80" : "bg-white"}`}>
                    <span className={`block text-[10px] uppercase tracking-wide mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Charged</span>
                    <span className={`font-bold ${job.paymentStatus === 'PAID' ? "text-red-500" : isDark ? "text-slate-200" : "text-slate-700"}`}>
                      {currencyCode} ${Number(job.chargedAmount).toFixed(2)}
                    </span>
                  </div>
                )}
                {/* Stripe Fee Breakdown - shown for CARD payments with a charged amount */}
                {job.chargedAmount != null && (job.paymentMethod || '').toUpperCase() === 'CARD' && (() => {
                  const totalCharged = job.totalCharged != null ? Number(job.totalCharged) : Number(job.chargedAmount);
                  const fee = calculateStripeFee(totalCharged);
                  return (
                    <div className={`col-span-2 rounded-md p-2 ${isDark ? "bg-indigo-900/20 border border-indigo-700/40" : "bg-indigo-50 border border-indigo-200"}`}>
                      <span className={`block text-[10px] uppercase tracking-wide mb-1 ${isDark ? "text-indigo-400" : "text-indigo-500"}`}>
                        💡 Stripe Fee Breakdown (2.65% + $0.30)
                      </span>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className={`block text-[8px] uppercase ${isDark ? "text-indigo-500" : "text-indigo-400"}`}>Stripe Takes</span>
                          <span className="font-bold text-red-400">${formatFee(fee.totalFee)}</span>
                        </div>
                        <div>
                          <span className={`block text-[8px] uppercase ${isDark ? "text-indigo-500" : "text-indigo-400"}`}>You Receive</span>
                          <span className={`font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>${formatFee(fee.netReceived)}</span>
                        </div>
                        <div>
                          <span className={`block text-[8px] uppercase ${isDark ? "text-indigo-500" : "text-indigo-400"}`}>Break-even Fare</span>
                          <span className={`font-bold ${isDark ? "text-amber-400" : "text-amber-600"}`}>${formatFee(fee.chargeToBreakEven)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {job.totalCharged != null && Number(job.totalCharged) !== Number(job.chargedAmount) && (
                  <div className={`rounded-md p-2 ${isDark ? "bg-slate-800/80" : "bg-white"}`}>
                    <span className={`block text-[10px] uppercase tracking-wide mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Total (incl. extras)</span>
                    <span className="font-bold text-red-500">
                      {currencyCode} ${Number(job.totalCharged).toFixed(2)}
                    </span>
                  </div>
                )}
                {job.paidAt && (
                  <div className={`rounded-md p-2 ${isDark ? "bg-slate-800/80" : "bg-white"}`}>
                    <span className={`block text-[10px] uppercase tracking-wide mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Paid At</span>
                    <span className="font-medium">{formatDate(job.paidAt)}</span>
                  </div>
                )}
                {job.paymentIntentId && (
                  <div className={`col-span-2 rounded-md p-2 ${isDark ? "bg-slate-800/80" : "bg-white"}`}>
                    <span className={`block text-[10px] uppercase tracking-wide mb-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Stripe ID</span>
                    <span className="font-mono text-[10px]">{job.paymentIntentId}</span>
                  </div>
                )}
              </div>

              {/* Transaction History from payments table */}
              {job.transactions && job.transactions.length > 0 && (
                <div className={`mt-3 pt-3 border-t ${job.paymentStatus === 'PAID' ? (isDark ? "border-red-700/50" : "border-red-200") : (isDark ? "border-slate-700" : "border-slate-200")}`}>
                  <p className={`text-[10px] font-semibold mb-2 flex items-center gap-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    <Receipt className="w-3 h-3" />
                    Transactions ({job.transactions.length})
                  </p>
                  <div className="space-y-1.5">
                    {job.transactions.map((tx: any, idx: number) => (
                      <div key={tx.id || idx} className={`flex items-center justify-between rounded-md px-2.5 py-2 ${
                        isDark ? "bg-slate-800/80" : "bg-white"
                      }`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 ${
                              isDark ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-600"
                            }`}>
                              {idx + 1}
                            </span>
                            <span className={`text-xs font-medium truncate ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                              {tx.description || tx.method || 'Payment'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 ml-5.5">
                            {tx.createdAt && (
                              <span className={`text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                                {formatDate(tx.createdAt)}
                              </span>
                            )}
                            {tx.transactionId && (
                              <span className={`font-mono text-[9px] ${isDark ? "text-slate-600" : "text-slate-300"}`}>
                                {tx.transactionId.slice(0, 16)}...
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(() => {
                            // Effective status: a transaction on a FINISHED
                            // job for any in-vehicle payment method was
                            // physically collected by the driver at trip
                            // end, and is logically COMPLETED even if the
                            // legacy DB row still says PENDING (we now
                            // write COMPLETED for new jobs but old rows
                            // aren't backfilled). Treat CASH, WALLET (gift
                            // card), BANK_TRANSFER (account), and EFTPOS-
                            // mapped CARD as collected on completion.
                            const rawStatus = String(tx.status || 'PENDING').toUpperCase();
                            const txMethod = String(tx.method || tx.paymentMethod || job.paymentMethod || '').toUpperCase();
                            const txOriginal = String((tx as any)?.metadata?.originalPaymentMethod || '').toUpperCase();
                            const inVehicleMethods = new Set([
                              'CASH', 'WALLET', 'BANK_TRANSFER',
                              'GIFT_CARD', 'VOUCHER', 'EFTPOS', 'EPOS',
                              'ACCOUNT', 'TAP_TO_PAY',
                            ]);
                            const isFinalisedJob = isFinalised;
                            const isInVehicle = inVehicleMethods.has(txMethod) || inVehicleMethods.has(txOriginal);
                            const effective = (rawStatus === 'PENDING' && isInVehicle && isFinalisedJob)
                              ? 'COLLECTED'
                              : rawStatus;
                            const isPositive = ['COMPLETED', 'PAID', 'SUCCEEDED', 'COLLECTED'].includes(effective);
                            const isFailed = ['FAILED'].includes(effective);
                            return (
                              <>
                                {tx.amount != null && (
                                  <span className={`text-xs font-bold ${isPositive ? "text-red-500" : isDark ? "text-slate-300" : "text-slate-700"}`}>
                                    {tx.currency || currencyCode} ${Number(tx.amount).toFixed(2)}
                                  </span>
                                )}
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                  isPositive ? "bg-green-500 text-white"
                                    : isFailed ? "bg-red-500 text-white"
                                    : isDark ? "bg-slate-600 text-slate-300" : "bg-slate-200 text-slate-600"
                                }`}>
                                  {effective}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Extra Charges */}
              {job.extraCharges && job.extraCharges.length > 0 && (
                <div className={`mt-3 pt-3 border-t ${job.paymentStatus === 'PAID' ? (isDark ? "border-red-700/50" : "border-red-200") : (isDark ? "border-slate-700" : "border-slate-200")}`}>
                  <p className={`text-[10px] font-semibold mb-2 flex items-center gap-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    <CreditCard className="w-3 h-3" />
                    Extra Charges ({job.extraCharges.length})
                  </p>
                  <div className="space-y-1.5">
                    {job.extraCharges.map((ec: any, i: number) => (
                      <div key={i} className={`flex items-center justify-between rounded-md px-2.5 py-2 ${
                        isDark ? "bg-slate-800/80" : "bg-white"
                      }`}>
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                            {ec.description || 'Extra charge'}
                          </span>
                          {ec.createdAt && (
                            <span className={`block text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                              {formatDate(ec.createdAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${
                            ec.status === 'PAID' ? "text-red-500" : isDark ? "text-slate-300" : "text-slate-700"
                          }`}>
                            ${Number(ec.amount).toFixed(2)}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            ec.status === 'PAID' 
                              ? "bg-green-500 text-white" 
                              : isDark ? "bg-amber-900/50 text-amber-300" : "bg-amber-100 text-amber-700"
                          }`}>
                            {ec.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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

          {/* Assigned Driver Info — resolve the driverId to a human name
              from job.assignedDriver (server-included on dispatch fetch) or
              the in-memory drivers store (live socket updates), falling
              back to a 6-char id slice rather than dumping the raw cuid
              which is unreadable to dispatchers. */}
          {job.driverId && (() => {
            const knownDrivers = useDispatchStore.getState().drivers;
            const direct = (job as any)?.assignedDriver;
            const lookup = knownDrivers.find(
              (d) => d.id === job.driverId || (d as any).userId === job.driverId,
            );
            const name = direct
              ? `${direct.firstName || ''} ${direct.lastName || ''}`.trim() || direct.name
              : lookup?.name || (lookup ? `${(lookup as any).firstName || ''} ${(lookup as any).lastName || ''}`.trim() : null);
            const displayName = name || `Driver ${String(job.driverId).slice(-6)}`;
            return (
            <div className={`rounded-lg p-3 flex items-center justify-between ${isDark ? "bg-emerald-900/30 border border-emerald-700" : "bg-emerald-50 border border-emerald-200"}`}>
              <div className="flex items-center gap-2">
                <Car className={`w-4 h-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                <span className={`text-sm font-medium ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                  Driver: {displayName}
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
          ); })()}
        </div>

        {/* Refund audit visibility — show when refunds exist for this job */}
        {jobRefunds.length > 0 && (
          <div
            className={`mx-5 mb-3 rounded-lg border px-3 py-2 ${
              isDark
                ? "bg-emerald-900/20 border-emerald-800"
                : "bg-emerald-50 border-emerald-200"
            }`}
          >
            <p
              className={`text-[11px] font-bold uppercase tracking-wide mb-1 ${
                isDark ? "text-emerald-300" : "text-emerald-700"
              }`}
            >
              Refund audit
            </p>
            <ul className="space-y-1">
              {jobRefunds.map((r) => (
                <li
                  key={r.id}
                  className={`text-xs ${
                    isDark ? "text-emerald-200" : "text-emerald-800"
                  }`}
                >
                  Refunded {r.currency || "$"} {Number(r.amount).toFixed(2)} at{" "}
                  {formatDate(r.createdAt)}{" "}
                  by {r.requestedByName || r.requestedBy || "system"}{" "}
                  <span
                    className={`ml-1 rounded px-1 py-0.5 text-[10px] ${
                      isDark ? "bg-emerald-800 text-emerald-100" : "bg-emerald-200 text-emerald-800"
                    }`}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer Actions */}
        <div className={`sticky bottom-0 z-10 flex items-center justify-between border-t px-5 py-3 ${
          isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
        }`}>
          <div className="flex items-center gap-2">
            {job?.status !== 'ACTIVE' && job?.status !== 'FINISHED' && job?.status !== 'CANCELLED' && job?.status !== 'NOSHOW' && (
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
            )}
            {/* Issue refund button — visible for any paid job */}
            {job?.paymentStatus === 'PAID' && (
              <button
                onClick={() => setShowRefundModal(true)}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  isDark
                    ? "text-emerald-400 hover:bg-emerald-900/30 border border-emerald-700"
                    : "text-emerald-700 hover:bg-emerald-50 border border-emerald-200"
                }`}
              >
                Issue refund
              </button>
            )}
          </div>
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
            {job?.status !== 'ACTIVE' && job?.status !== 'FINISHED' && job?.status !== 'CANCELLED' && job?.status !== 'NOSHOW' && (
              <button
                onClick={handleEdit}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Edit Job
              </button>
            )}
          </div>
        </div>

        {/* Issue refund modal (Wave 2D) */}
        <IssueRefundModal
          open={showRefundModal}
          job={job}
          onClose={() => setShowRefundModal(false)}
          onSuccess={async () => {
            await loadJobRefunds();
            await fetchJobs();
            await fetchJobCounters();
          }}
        />

        {/* Cancel Dialog — Full overlay */}
        {showCancelDialog && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => { if (!cancelLoading) { setShowCancelDialog(false); setRefundAction(null); setManualRefundAck(false); } }}>
            <div
              className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${
                isDark ? "bg-slate-900 ring-1 ring-slate-700" : "bg-white ring-1 ring-slate-200"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`px-6 py-4 flex items-center justify-between border-b ${
                isDark ? "border-slate-700/80 bg-slate-800/60" : "border-slate-100 bg-slate-50"
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-lg ${isDark ? "bg-red-900/40" : "bg-red-50"}`}>
                    <X className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-500"}`} />
                  </div>
                  <div>
                    <h3 className={`text-base font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                      Cancel Job
                    </h3>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                      {job.reference || job.id.slice(0, 16)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowCancelDialog(false); setRefundAction(null); setManualRefundAck(false); }}
                  disabled={cancelLoading}
                  className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

                {/* PAID JOB — Refund Section */}
                {isPaidJob && (
                  <>
                    {/* Payment summary banner */}
                    <div className={`rounded-xl p-4 flex items-center gap-4 ${
                      isDark ? "bg-red-950/50 ring-1 ring-red-800/60" : "bg-red-50 ring-1 ring-red-200"
                    }`}>
                      <div className={`p-2.5 rounded-full ${isDark ? "bg-red-900/60" : "bg-red-100"}`}>
                        <CreditCard className={`w-5 h-5 ${isDark ? "text-red-400" : "text-red-500"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-red-400/80" : "text-red-500"}`}>
                          Payment Received
                        </p>
                        <p className={`text-xl font-bold tabular-nums ${isDark ? "text-red-300" : "text-red-700"}`}>
                          ${paidAmount.toFixed(2)}
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isDark ? "bg-red-900/80 text-red-300 ring-1 ring-red-700" : "bg-red-100 text-red-600 ring-1 ring-red-300"
                      }`}>PAID</span>
                    </div>

                    {/* Refund method heading */}
                    <div>
                      <p className={`text-sm font-semibold mb-3 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                        Choose refund method
                      </p>

                      {/* Refund Options */}
                      <div className="space-y-2">
                        {/* Option 1: Stripe */}
                        <label className={`group flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                          refundAction === 'STRIPE_REFUND'
                            ? isDark ? "border-blue-500 bg-blue-950/40 ring-1 ring-blue-500/30" : "border-blue-500 bg-blue-50/80 ring-1 ring-blue-200"
                            : isDark ? "border-slate-700/80 hover:border-slate-600 bg-slate-800/40" : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}>
                          <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
                            refundAction === 'STRIPE_REFUND'
                              ? "border-blue-500 bg-blue-500"
                              : isDark ? "border-slate-600" : "border-slate-300"
                          }`}>
                            {refundAction === 'STRIPE_REFUND' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <input type="radio" name="refundAction" className="sr-only" checked={refundAction === 'STRIPE_REFUND'} onChange={() => { setRefundAction('STRIPE_REFUND'); setManualRefundAck(false); }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <RefreshCw className={`w-3.5 h-3.5 flex-shrink-0 ${refundAction === 'STRIPE_REFUND' ? (isDark ? "text-blue-400" : "text-blue-600") : (isDark ? "text-slate-500" : "text-slate-400")}`} />
                              <span className={`text-sm font-semibold ${refundAction === 'STRIPE_REFUND' ? (isDark ? "text-blue-300" : "text-blue-700") : (isDark ? "text-slate-300" : "text-slate-700")}`}>
                                Refund via Stripe
                              </span>
                            </div>
                            <p className={`text-xs mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              Automatically refund ${paidAmount.toFixed(2)} to the customer's card. Takes 5–10 business days.
                            </p>
                          </div>
                        </label>

                        {/* Option 2: Wallet */}
                        <label className={`group flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                          refundAction === 'WALLET_CREDIT'
                            ? isDark ? "border-emerald-500 bg-emerald-950/40 ring-1 ring-emerald-500/30" : "border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-200"
                            : isDark ? "border-slate-700/80 hover:border-slate-600 bg-slate-800/40" : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}>
                          <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
                            refundAction === 'WALLET_CREDIT'
                              ? "border-emerald-500 bg-emerald-500"
                              : isDark ? "border-slate-600" : "border-slate-300"
                          }`}>
                            {refundAction === 'WALLET_CREDIT' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <input type="radio" name="refundAction" className="sr-only" checked={refundAction === 'WALLET_CREDIT'} onChange={() => { setRefundAction('WALLET_CREDIT'); setManualRefundAck(false); }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Wallet className={`w-3.5 h-3.5 flex-shrink-0 ${refundAction === 'WALLET_CREDIT' ? (isDark ? "text-emerald-400" : "text-emerald-600") : (isDark ? "text-slate-500" : "text-slate-400")}`} />
                              <span className={`text-sm font-semibold ${refundAction === 'WALLET_CREDIT' ? (isDark ? "text-emerald-300" : "text-emerald-700") : (isDark ? "text-slate-300" : "text-slate-700")}`}>
                                Credit to Wallet
                              </span>
                            </div>
                            <p className={`text-xs mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              Add ${paidAmount.toFixed(2)} to the customer's wallet balance for future rides.
                            </p>
                          </div>
                        </label>

                        {/* Option 3: Manual */}
                        <label className={`group flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                          refundAction === 'MANUAL_REFUND'
                            ? isDark ? "border-amber-500 bg-amber-950/40 ring-1 ring-amber-500/30" : "border-amber-500 bg-amber-50/80 ring-1 ring-amber-200"
                            : isDark ? "border-slate-700/80 hover:border-slate-600 bg-slate-800/40" : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}>
                          <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
                            refundAction === 'MANUAL_REFUND'
                              ? "border-amber-500 bg-amber-500"
                              : isDark ? "border-slate-600" : "border-slate-300"
                          }`}>
                            {refundAction === 'MANUAL_REFUND' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <input type="radio" name="refundAction" className="sr-only" checked={refundAction === 'MANUAL_REFUND'} onChange={() => setRefundAction('MANUAL_REFUND')} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <CheckCircle className={`w-3.5 h-3.5 flex-shrink-0 ${refundAction === 'MANUAL_REFUND' ? (isDark ? "text-amber-400" : "text-amber-600") : (isDark ? "text-slate-500" : "text-slate-400")}`} />
                              <span className={`text-sm font-semibold ${refundAction === 'MANUAL_REFUND' ? (isDark ? "text-amber-300" : "text-amber-700") : (isDark ? "text-slate-300" : "text-slate-700")}`}>
                                Already Refunded Manually
                              </span>
                            </div>
                            <p className={`text-xs mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              I've already refunded via Stripe dashboard or other means.
                            </p>
                            {refundAction === 'MANUAL_REFUND' && (
                              <label className={`flex items-center gap-2.5 mt-3 p-2.5 rounded-lg cursor-pointer ${
                                manualRefundAck
                                  ? isDark ? "bg-amber-900/30 ring-1 ring-amber-700/50" : "bg-amber-50 ring-1 ring-amber-300"
                                  : isDark ? "bg-slate-800 ring-1 ring-slate-700" : "bg-slate-50 ring-1 ring-slate-200"
                              }`}>
                                <input type="checkbox" checked={manualRefundAck} onChange={(e) => setManualRefundAck(e.target.checked)} className="w-4 h-4 rounded accent-amber-500" />
                                <span className={`text-xs font-medium ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                                  I confirm ${paidAmount.toFixed(2)} has been refunded
                                </span>
                              </label>
                            )}
                          </div>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {/* Reason */}
                <div>
                  <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Reason for cancellation
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Enter cancellation reason..."
                    className={`w-full rounded-xl border p-3 text-sm outline-none resize-none transition focus:ring-2 ${
                      isDark
                        ? "border-slate-700 bg-slate-800 text-slate-100 placeholder-slate-500 focus:ring-blue-500/30 focus:border-blue-500"
                        : "border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                    rows={2}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className={`px-6 py-4 flex items-center justify-end gap-3 border-t ${
                isDark ? "border-slate-700/80 bg-slate-800/40" : "border-slate-100 bg-slate-50/50"
              }`}>
                <button
                  onClick={() => { setShowCancelDialog(false); setRefundAction(null); setManualRefundAck(false); }}
                  disabled={cancelLoading}
                  className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                    isDark ? "text-slate-300 hover:bg-slate-700 ring-1 ring-slate-700" : "text-slate-600 hover:bg-slate-100 ring-1 ring-slate-200"
                  }`}
                >
                  Go Back
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading || !cancelReason.trim() || (isPaidJob && !refundAction) || (isPaidJob && refundAction === 'MANUAL_REFUND' && !manualRefundAck)}
                  className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition flex items-center gap-2 ${
                    cancelLoading || !cancelReason.trim() || (isPaidJob && !refundAction) || (isPaidJob && refundAction === 'MANUAL_REFUND' && !manualRefundAck)
                      ? "bg-red-400/60 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700 shadow-sm shadow-red-900/30"
                  }`}
                >
                  {cancelLoading ? (
                    <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Processing...</>
                  ) : isPaidJob && refundAction ? (
                    refundAction === 'STRIPE_REFUND' ? 'Cancel & Refund to Card'
                    : refundAction === 'WALLET_CREDIT' ? 'Cancel & Credit Wallet'
                    : 'Cancel & Confirm Refund'
                  ) : 'Cancel Job'}
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
