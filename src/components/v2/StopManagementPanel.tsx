import React, { useState } from "react";
import { useV2Stops } from "../../hooks/useV2Stops";
import PODViewer from "./PODViewer";
import "./StopManagementPanel.css";

interface StopManagementPanelProps {
  jobId: string;
}

const STOP_STATUS_ICONS: Record<string, string> = {
  PENDING: "⏳",
  READY: "⏳",
  EN_ROUTE: "🚗",
  ARRIVED: "📍",
  PICKED_UP: "📦",
  IN_TRANSIT: "🚚",
  DELIVERED: "✅",
  COMPLETED: "✅",
  FAILED: "❌",
  CANCELLED: "⏭️",
};

const STOP_STATUS_COLORS: Record<string, string> = {
  PENDING: "#FFA500",
  READY: "#FFA500",
  EN_ROUTE: "#2196F3",
  ARRIVED: "#9C27B0",
  PICKED_UP: "#00BCD4",
  IN_TRANSIT: "#3F51B5",
  DELIVERED: "#4CAF50",
  COMPLETED: "#4CAF50",
  FAILED: "#F44336",
  CANCELLED: "#9E9E9E",
};

const StopManagementPanel: React.FC<StopManagementPanelProps> = ({ jobId }) => {
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [showPOD, setShowPOD] = useState(false);

  const {
    stops,
    progress,
    currentStop,
    loading,
    error,
    v2Available,
    arrive,
    complete,
    fail,
    skip,
  } = useV2Stops(jobId, { autoRefresh: true, refreshInterval: 5000 });

  if (!v2Available) {
    return (
      <div className="stop-panel-unavailable">V2 API required for stop management</div>
    );
  }

  if (loading && stops.length === 0) {
    return <div className="stop-panel-loading">Loading stops...</div>;
  }

  if (error) {
    return <div className="stop-panel-error">Error loading stops: {error.message}</div>;
  }

  const selectedStop = stops.find((s) => s.id === selectedStopId);

  return (
    <div className="stop-management-panel">
      <div className="stop-progress-header">
        <h3>Delivery Progress</h3>
        {progress && (
          <div className="progress-stats">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress.percentComplete ?? 0}%` }}
              />
            </div>
            <span className="progress-text">
              {progress.completed}/{progress.total} stops completed
            </span>
          </div>
        )}
      </div>

      <div className="stops-timeline">
        {stops.map((stop, index) => {
          const isCurrent = currentStop?.id === stop.id;
          const isSelected = selectedStopId === stop.id;
          const status = stop.status?.toUpperCase?.() || "PENDING";

          return (
            <div
              key={stop.id}
              className={`stop-item ${isCurrent ? "current" : ""} ${isSelected ? "selected" : ""}`}
              onClick={() => setSelectedStopId(stop.id)}
            >
              {index > 0 && (
                <div
                  className="stop-connector"
                  style={{ backgroundColor: status === "DELIVERED" || status === "COMPLETED" ? "#4CAF50" : "#ddd" }}
                />
              )}
              <div
                className="stop-marker"
                style={{
                  backgroundColor: STOP_STATUS_COLORS[status] || "#999",
                  borderColor: isCurrent ? "#000" : "transparent",
                }}
              >
                {stop.sequence}
              </div>
              <div className="stop-info">
                <div className="stop-address">{stop.address}</div>
                <div className="stop-meta">
                  <span
                    className="stop-status"
                    style={{ color: STOP_STATUS_COLORS[status] || "#666" }}
                  >
                    {STOP_STATUS_ICONS[status] || "⏳"} {status}
                  </span>
                  {stop.contactName && <span className="stop-contact">{stop.contactName}</span>}
                  {stop.proofRequired && <span className="pod-required">📋 POD</span>}
                </div>
              </div>
              {isCurrent && (
                <div className="stop-actions">
                  {["PENDING", "READY"].includes(status) && (
                    <button onClick={() => arrive(stop.id)} title="Mark Arrived">
                      📍
                    </button>
                  )}
                  {["ARRIVED", "PICKED_UP", "IN_TRANSIT", "EN_ROUTE"].includes(status) && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedStopId(stop.id);
                          setShowPOD(true);
                        }}
                        title="Capture/View POD"
                      >
                        📸
                      </button>
                      <button onClick={() => complete(stop.id)} title="Complete">
                        ✅
                      </button>
                      <button onClick={() => fail(stop.id, "Failed")} title="Fail">
                        ❌
                      </button>
                    </>
                  )}
                  {!["DELIVERED", "COMPLETED", "FAILED", "CANCELLED"].includes(status) && (
                    <button onClick={() => skip(stop.id, "Skipped")} title="Skip">
                      ⏭️
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showPOD && selectedStop && (
        <PODViewer jobId={jobId} stopId={selectedStop.id} onClose={() => setShowPOD(false)} />
      )}
    </div>
  );
};

export default StopManagementPanel;
