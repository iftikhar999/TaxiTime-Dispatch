import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Search, X, DollarSign } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { listRefunds, type Refund } from "../../services/refundService";

interface RefundListViewProps {
  open: boolean;
  onClose: () => void;
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "bg-amber-500", text: "text-white" },
  PROCESSING: { bg: "bg-blue-500", text: "text-white" },
  SUCCEEDED: { bg: "bg-emerald-500", text: "text-white" },
  FAILED: { bg: "bg-red-500", text: "text-white" },
  CANCELLED: { bg: "bg-slate-500", text: "text-white" },
};

const fmt = (iso?: string) => {
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

const RefundListView: React.FC<RefundListViewProps> = ({ open, onClose }) => {
  const { isDark } = useTheme();
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listRefunds({
        companyId: companyId || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setRefunds(res.refunds);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to load refunds");
      toast.error("Failed to load refunds");
    } finally {
      setLoading(false);
    }
  }, [companyId, status, dateFrom, dateTo]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return refunds;
    const q = searchQuery.toLowerCase();
    return refunds.filter(
      (r) =>
        r.paymentId?.toLowerCase().includes(q) ||
        r.jobReference?.toLowerCase().includes(q) ||
        r.companyName?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q) ||
        r.requestedByName?.toLowerCase().includes(q)
    );
  }, [refunds, searchQuery]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={`w-full max-w-6xl rounded-xl shadow-2xl border overflow-hidden max-h-[90vh] flex flex-col ${
          isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between border-b px-4 py-3 ${
            isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Refunds</h2>
            <span
              className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              {filtered.length} shown
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={load}
              className={`rounded p-1.5 ${
                isDark ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-200"
              }`}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className={`rounded p-1.5 ${
                isDark ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div
          className={`flex flex-wrap gap-2 border-b px-4 py-2 ${
            isDark ? "border-slate-700 bg-slate-900" : "border-slate-100 bg-white"
          }`}
        >
          <div className="relative">
            <Search
              size={12}
              className={`absolute left-2 top-1/2 -translate-y-1/2 ${
                isDark ? "text-slate-500" : "text-slate-400"
              }`}
            />
            <input
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`rounded border pl-7 pr-2 py-1 text-xs outline-none ${
                isDark
                  ? "border-slate-700 bg-slate-800 text-white placeholder-slate-500"
                  : "border-slate-300 bg-white text-slate-800 placeholder-slate-400"
              }`}
            />
          </div>

          <input
            type="text"
            placeholder="Company ID"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className={`rounded border px-2 py-1 text-xs outline-none w-36 ${
              isDark
                ? "border-slate-700 bg-slate-800 text-white"
                : "border-slate-300 bg-white text-slate-800"
            }`}
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`rounded border px-2 py-1 text-xs outline-none ${
              isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-800"
            }`}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={`rounded border px-2 py-1 text-xs outline-none ${
              isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-800"
            }`}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`rounded border px-2 py-1 text-xs outline-none ${
              isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-800"
            }`}
          />

          <button
            onClick={() => {
              setCompanyId("");
              setStatus("");
              setDateFrom("");
              setDateTo("");
              setSearchQuery("");
            }}
            className={`rounded px-2 py-1 text-xs ${
              isDark ? "bg-slate-700 text-slate-200 hover:bg-slate-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Clear
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {error && (
            <p className="p-4 text-sm text-red-500">{error}</p>
          )}
          {!error && filtered.length === 0 && !loading && (
            <p className={`p-8 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              No refunds found.
            </p>
          )}
          {filtered.length > 0 && (
            <table className="w-full text-xs">
              <thead
                className={`sticky top-0 ${
                  isDark ? "bg-slate-800 text-slate-400" : "bg-slate-50 text-slate-600"
                }`}
              >
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Payment</th>
                  <th className="px-3 py-2 text-left font-semibold">Job</th>
                  <th className="px-3 py-2 text-left font-semibold">Company</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold">Reason</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Requested By</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const ss = statusStyles[r.status as string] || statusStyles.PENDING;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b ${
                        isDark
                          ? "border-slate-700 hover:bg-slate-800"
                          : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <td className={`px-3 py-2 font-mono text-[11px] ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        {r.paymentId?.slice(-10) || "—"}
                      </td>
                      <td className={`px-3 py-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        {r.jobReference || r.jobId?.slice(-6) || "—"}
                      </td>
                      <td className={`px-3 py-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        {r.companyName || r.companyId?.slice(-6) || "—"}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                        {r.currency || "$"} {Number(r.amount || 0).toFixed(2)}
                      </td>
                      <td className={`px-3 py-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        <span className="font-medium">{r.reason}</span>
                        {r.reasonText && (
                          <div className={`text-[10px] italic mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                            {r.reasonText}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${ss.bg} ${ss.text}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className={`px-3 py-2 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        {fmt(r.createdAt)}
                      </td>
                      <td className={`px-3 py-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        {r.requestedByName || r.requestedBy?.slice(-6) || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default RefundListView;
