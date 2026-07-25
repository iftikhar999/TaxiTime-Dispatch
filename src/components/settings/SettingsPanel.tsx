import React, { useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import V2FeatureToggle from "../admin/V2FeatureToggle";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const TABS = ["General", "V2 Features", "About"] as const;

type Tab = (typeof TABS)[number];

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("General");

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className={`settings-modal ${isDark ? "dark" : "light"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <div>
            <h2>Settings</h2>
            <p>Customize your Dispatch experience</p>
          </div>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {activeTab === "General" && (
            <div className="settings-section">
              <h4>Appearance</h4>
              <div className="settings-row">
                <span>Dark mode</span>
                <button onClick={toggleTheme}>
                  {isDark ? "Switch to Light" : "Switch to Dark"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "V2 Features" && (
            <div className="settings-section">
              <V2FeatureToggle />
            </div>
          )}

          {activeTab === "About" && (
            <div className="settings-section">
              <h4>TaxiTime Dispatch</h4>
              <p>V2 multi-service rollout controls for the Dispatch console.</p>
              <p className="muted">Changes apply instantly in this browser.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
