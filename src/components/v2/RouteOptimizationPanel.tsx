import React, { useState } from "react";
import * as routeService from "../../services/v2/routeService";
import "./RouteOptimizationPanel.css";

interface RouteOptimizationPanelProps {
  jobId: string;
  onOptimized?: () => void;
}

const RouteOptimizationPanel: React.FC<RouteOptimizationPanelProps> = ({
  jobId,
  onOptimized,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [algorithm, setAlgorithm] = useState("NEAREST_NEIGHBOR");

  const handleOptimize = async () => {
    setLoading(true);
    setError(null);
    try {
      const optimized = await routeService.optimizeRoute(jobId, { algorithm });
      setResult(optimized);
      onOptimized?.();
    } catch (err: any) {
      setError(err.message || "Optimization failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReoptimize = async () => {
    setLoading(true);
    setError(null);
    try {
      const optimized = await routeService.reoptimizeRoute(jobId);
      setResult(optimized);
      onOptimized?.();
    } catch (err: any) {
      setError(err.message || "Re-optimization failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="route-optimization-panel">
      <h4>🗺️ Route Optimization</h4>
      <div className="optimization-controls">
        <select
          value={algorithm}
          onChange={(e) => setAlgorithm(e.target.value)}
          disabled={loading}
        >
          <option value="NEAREST_NEIGHBOR">Nearest Neighbor</option>
          <option value="GOOGLE_OPTIMIZE">Google Optimize</option>
        </select>
        <button onClick={handleOptimize} disabled={loading} className="btn-optimize">
          {loading ? "⏳ Optimizing..." : "🚀 Optimize"}
        </button>
        <button onClick={handleReoptimize} disabled={loading} className="btn-reoptimize">
          🔄 Re-optimize
        </button>
      </div>
      {error && <div className="optimization-error">⚠️ {error}</div>}
      {result && (
        <div className="optimization-result">
          <div className="result-stat">
            <span className="label">Algorithm:</span>
            <span className="value">{result.algorithm}</span>
          </div>
          <div className="result-stat">
            <span className="label">Total Distance:</span>
            <span className="value">
              {result.totalDistanceKm ? result.totalDistanceKm.toFixed(2) : "--"} km
            </span>
          </div>
          {result.savedDistanceKm > 0 && (
            <div className="result-stat saved">
              <span className="label">Saved:</span>
              <span className="value">
                🎉 {result.savedDistanceKm.toFixed(2)} km
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RouteOptimizationPanel;
