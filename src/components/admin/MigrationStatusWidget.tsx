import React, { useEffect, useMemo, useState } from "react";
import { useFeatureFlags } from "../../hooks/useFeatureFlags";
import { checkV2Availability } from "../../services/v2/apiClient";
import "./MigrationStatusWidget.css";

const statusColors: Record<string, string> = {
  online: "#16a34a",
  offline: "#dc2626",
  checking: "#f59e0b",
};

const MigrationStatusWidget: React.FC = () => {
  const { flags } = useFeatureFlags();
  const [status, setStatus] = useState<"checking" | "online" | "offline">(
    "checking"
  );

  useEffect(() => {
    let mounted = true;
    checkV2Availability()
      .then((online) => mounted && setStatus(online ? "online" : "offline"))
      .catch(() => mounted && setStatus("offline"));
    return () => {
      mounted = false;
    };
  }, []);

  const enabledCount = useMemo(
    () => Object.values(flags).filter(Boolean).length,
    [flags]
  );
  const total = Object.keys(flags).length || 1;
  const progressPct = Math.round((enabledCount / total) * 100);

  return (
    <div className="migration-widget">
      <div className="header">
        <div>
          <h4>V2 Migration</h4>
          <p>Track rollout readiness</p>
        </div>
        <div
          className="status-pill"
          style={{ backgroundColor: `${statusColors[status]}20`, color: statusColors[status] }}
        >
          {status === "checking" ? "Checking" : status === "online" ? "Online" : "Offline"}
        </div>
      </div>

      <div className="progress">
        <div className="bar">
          <div className="fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="progress-text">
          {enabledCount}/{total} features enabled ({progressPct}%)
        </div>
      </div>

      <div className="flag-list">
        {(Object.keys(flags) as (keyof typeof flags)[]).map((key) => (
          <div key={key} className="flag-row">
            <span className="name">{key}</span>
            <span className={flags[key] ? "on" : "off"}>
              {flags[key] ? "Enabled" : "Disabled"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MigrationStatusWidget;
