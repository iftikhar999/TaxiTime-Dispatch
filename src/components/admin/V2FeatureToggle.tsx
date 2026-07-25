import React from "react";
import { useFeatureFlags } from "../../hooks/useFeatureFlags";
import "./V2FeatureToggle.css";

const FLAG_LABELS: Record<string, string> = {
  v2Jobs: "V2 Jobs API",
  v2Stops: "V2 Stops",
  v2POD: "V2 POD",
  v2RouteOptimization: "Route Optimization",
  v2Socket: "V2 Sockets",
};

const V2FeatureToggle: React.FC = () => {
  const { flags, setFlag, enableAllV2, disableAllV2, isV2Enabled } =
    useFeatureFlags();

  return (
    <div className="v2-toggle-card">
      <div className="v2-toggle-header">
        <div>
          <h3>V2 Feature Flags</h3>
          <p>Changes take effect immediately for this browser.</p>
        </div>
        <div className="v2-toggle-actions">
          <button onClick={enableAllV2}>Enable All</button>
          <button onClick={disableAllV2} className="danger">
            Disable All
          </button>
        </div>
      </div>

      <div className="v2-toggle-warning">
        ⚠️ Toggling flags impacts live API usage for this session.
      </div>

      <div className="v2-toggle-list">
        {(Object.keys(flags) as (keyof typeof flags)[]).map((key) => (
          <label key={key} className="v2-toggle-row">
            <div>
              <span className="label">{FLAG_LABELS[key] || key}</span>
              <span className="sub">
                Local-only flag. Persists in this browser (localStorage).
              </span>
            </div>
            <input
              type="checkbox"
              checked={Boolean(flags[key])}
              onChange={(e) => setFlag(key, e.target.checked)}
            />
          </label>
        ))}
      </div>

      <div className="v2-toggle-footer">
        Overall V2 status:{" "}
        <strong className={isV2Enabled() ? "on" : "off"}>
          {isV2Enabled() ? "Enabled" : "Disabled"}
        </strong>
      </div>
    </div>
  );
};

export default V2FeatureToggle;
