import React from "react";
import { SERVICE_TYPES } from "../../services/v2/jobService";

const SERVICE_TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; color: string; description?: string }
> = {
  // Three first-class platform services. Keep these labels in sync
  // with super-admin Platform Services + owner panel + passenger app.
  TAXI:     { label: "Taxi",    icon: "🚕", color: "#FFD700", description: "Passenger ride bookings" },
  DELIVERY: { label: "Food",    icon: "🍔", color: "#F59E0B", description: "Restaurant & grocery orders" },
  COURIER:  { label: "Courier", icon: "📦", color: "#2196F3", description: "Parcel & multi-stop deliveries" },
};

interface SelectorProps {
  value: string | null;
  onChange: (val: string | null) => void;
  disabled?: boolean;
  showAll?: boolean;
  allowedTypes?: string[];
  variant?: "buttons" | "dropdown" | "tabs";
}

export const ServiceTypeSelector: React.FC<SelectorProps> = ({
  value,
  onChange,
  disabled = false,
  showAll = true,
  allowedTypes = Object.keys(SERVICE_TYPES),
  variant = "buttons",
}) => {
  const types = showAll ? ["ALL", ...allowedTypes] : allowedTypes;

  if (variant === "dropdown") {
    return (
      <select
        value={value || "ALL"}
        onChange={(e) => onChange(e.target.value === "ALL" ? null : e.target.value)}
        disabled={disabled}
        className="service-type-dropdown"
        style={{ padding: "8px 12px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "14px" }}
      >
        {showAll && <option value="ALL">All Services</option>}
        {allowedTypes.map((type) => (
          <option key={type} value={type}>
            {SERVICE_TYPE_CONFIG[type]?.icon} {SERVICE_TYPE_CONFIG[type]?.label || type}
          </option>
        ))}
      </select>
    );
  }

  if (variant === "tabs") {
    return (
      <div className="service-type-tabs flex items-center gap-0.5">
        {types.map((type) => {
          const config = SERVICE_TYPE_CONFIG[type] || {};
          const isSelected = (type === "ALL" && !value) || value === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type === "ALL" ? null : type)}
              disabled={disabled}
              className="flex items-center gap-1 rounded-md transition-all duration-150"
              style={{
                padding: "3px 8px",
                border: "none",
                background: isSelected ? `${config.color || '#333'}15` : "none",
                cursor: disabled ? "not-allowed" : "pointer",
                borderBottom: isSelected ? `2px solid ${config.color || '#333'}` : "2px solid transparent",
                color: isSelected ? config.color || "#333" : "#999",
                fontSize: "10px",
                fontWeight: isSelected ? 700 : 500,
                lineHeight: "1.2",
              }}
            >
              <span style={{ fontSize: "11px" }}>{config.icon || "📋"}</span>
              <span>{config.label || type}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="service-type-selector flex gap-2">
      {types.map((type) => {
        const config = SERVICE_TYPE_CONFIG[type] || {};
        const isSelected = (type === "ALL" && !value) || value === type;
        return (
          <button
            key={type}
            onClick={() => onChange(type === "ALL" ? null : type)}
            disabled={disabled}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              border: isSelected ? `2px solid ${config.color || "#333"}` : "1px solid #ddd",
              background: isSelected ? `${config.color || "#333"}20` : "#fff",
              cursor: disabled ? "not-allowed" : "pointer",
              minWidth: "80px",
            }}
          >
            <div style={{ fontSize: "20px" }}>{config.icon || "📋"}</div>
            <div style={{ fontSize: "12px", marginTop: 4 }}>{config.label || type}</div>
          </button>
        );
      })}
    </div>
  );
};

export const ServiceTypeBadge: React.FC<{ serviceType: string; size?: "small" | "medium" | "large" }> = ({
  serviceType,
  size = "medium",
}) => {
  const config = SERVICE_TYPE_CONFIG[serviceType] || { label: serviceType, icon: "📋", color: "#999" };
  const sizes: Record<string, { fontSize: string; padding: string }> = {
    small: { fontSize: "10px", padding: "2px 6px" },
    medium: { fontSize: "12px", padding: "4px 8px" },
    large: { fontSize: "14px", padding: "6px 12px" },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        backgroundColor: `${config.color}20`,
        color: config.color,
        borderRadius: "4px",
        fontWeight: "bold",
        ...sizes[size],
      }}
    >
      {config.icon} {config.label}
    </span>
  );
};

export default ServiceTypeSelector;
