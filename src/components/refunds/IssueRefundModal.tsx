import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { X, DollarSign } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import {
  createRefund,
  type RefundReason,
} from "../../services/refundService";
import type { DispatchJob } from "../../store/useDispatchStore";

interface IssueRefundModalProps {
  job: DispatchJob | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: (job: DispatchJob) => void;
}

const REASONS: { value: RefundReason; label: string }[] = [
  { value: "duplicate", label: "Duplicate charge" },
  { value: "fraudulent", label: "Fraudulent" },
  { value: "requested_by_customer", label: "Requested by customer" },
  { value: "other", label: "Other (see notes)" },
];

const resolvePaidAmount = (job: DispatchJob | null): number => {
  if (!job) return 0;
  const candidates = [job.totalCharged, job.chargedAmount, job.actualFare, job.finalAmount, job.fareEstimate];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};

const resolvePaymentId = (job: DispatchJob | null): string | null => {
  if (!job) return null;
  if (job.paymentIntentId) return job.paymentIntentId;
  const paid = job.transactions?.find((t) => t.status === "SUCCEEDED" || t.status === "PAID");
  return paid?.id || paid?.transactionId || null;
};

const IssueRefundModal: React.FC<IssueRefundModalProps> = ({ job, open, onClose, onSuccess }) => {
  const { isDark } = useTheme();
  const defaultAmount = useMemo(() => resolvePaidAmount(job), [job]);
  const [amount, setAmount] = useState<string>(defaultAmount.toFixed(2));
  const [reason, setReason] = useState<RefundReason>("requested_by_customer");
  const [reasonText, setReasonText] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAmount(defaultAmount.toFixed(2));
    setReason("requested_by_customer");
    setReasonText("");
  }, [defaultAmount, open]);

  if (!open || !job) return null;

  const paymentId = resolvePaymentId(job);
  const currency = (job.currency || "USD").toUpperCase();

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (amt > defaultAmount + 0.001) {
      toast.error(`Refund cannot exceed paid amount (${defaultAmount.toFixed(2)})`);
      return;
    }
    if (reason === "other" && !reasonText.trim()) {
      toast.error("Please enter a reason");
      return;
    }
    setSubmitting(true);
    try {
      await createRefund({
        paymentId: paymentId || undefined,
        jobId: job.id,
        amount: amt,
        reason,
        reasonText: reasonText.trim() || undefined,
        currency,
      });
      toast.success(`Refund of ${currency} ${amt.toFixed(2)} issued`);
      onSuccess?.(job);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to issue refund");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-xl shadow-2xl border ${
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
            <DollarSign className="w-5 h-5 text-emerald-500" />
            <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              Issue Refund
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className={`rounded p-1 ${
              isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div
            className={`rounded p-3 text-xs ${
              isDark ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-700"
            }`}
          >
            <div className="flex justify-between mb-1">
              <span>Job</span>
              <span className="font-mono">{job.reference || job.id.slice(-6)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span>Paid amount</span>
              <span className="font-semibold">
                {currency} {defaultAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Payment ID</span>
              <span className="font-mono truncate ml-2">{paymentId || "—"}</span>
            </div>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              Amount ({currency})
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={defaultAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`w-full rounded border px-2 py-1.5 text-sm outline-none ${
                isDark
                  ? "border-slate-700 bg-slate-800 text-white"
                  : "border-slate-300 bg-white text-slate-800"
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as RefundReason)}
              className={`w-full rounded border px-2 py-1.5 text-sm outline-none ${
                isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-800"
              }`}
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              Notes {reason === "other" && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Optional additional notes visible in audit log"
              rows={3}
              className={`w-full rounded border px-2 py-1.5 text-sm outline-none ${
                isDark
                  ? "border-slate-700 bg-slate-800 text-white placeholder-slate-500"
                  : "border-slate-300 bg-white text-slate-800 placeholder-slate-400"
              }`}
            />
          </div>
        </div>

        <div
          className={`flex items-center justify-end gap-2 border-t px-4 py-3 ${
            isDark ? "border-slate-700 bg-slate-800" : "border-slate-100 bg-slate-50"
          }`}
        >
          <button
            onClick={onClose}
            disabled={submitting}
            className={`rounded px-3 py-1.5 text-sm ${
              isDark ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || defaultAmount <= 0}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Issuing…" : "Issue refund"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IssueRefundModal;
