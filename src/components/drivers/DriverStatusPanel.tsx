import classNames from "classnames";
import { Navigation, Phone } from "lucide-react";
import React, { useRef } from "react";
import { useDispatchStore } from "../../store/useDispatchStore";

const driverStatusClass = {
  AVAILABLE: "bg-green-50 text-green-700 border-green-300", // ✅ Green
  AWAY: "bg-orange-50 text-orange-700 border-orange-300", // 🟠 Orange
  BUSY: "bg-red-50 text-red-700 border-red-300", // 🔴 Red
  ROGER: "bg-blue-50 text-blue-700 border-blue-300", // 🔵 Blue
  ON_THE_WAY: "bg-blue-50 text-blue-700 border-blue-300", // 🔵 Blue
  ARRIVED: "bg-red-100 text-red-600 border-red-200", // 🔴 Light Red
  OFFLINE: "bg-slate-100 text-slate-600 border-slate-300", // ⚪ Grey
};

const formatRelativeTime = (iso?: string) => {
  if (!iso) {
    return "—";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) {
    return parsed.toLocaleTimeString();
  }
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) {
    return `${diffSeconds || 1}s ago`;
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) {
    return `${diffDays}d ago`;
  }
  return parsed.toLocaleDateString();
};

const formatCoordinate = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(4);
};

const DriverStatusPanel: React.FC = () => {
  const drivers = useDispatchStore((state) => state.drivers);
  const focusDriver = useDispatchStore((state) => state.focusDriver);
  const setHoveredDriverId = useDispatchStore((state) => state.setHoveredDriverId);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [zoneFilter, setZoneFilter] = React.useState<string | null>(null);
  const [, setTick] = React.useState(0); // ✅ Force re-render every second for live timestamp

  // ✅ Update timestamp display every second (makes it count up continuously)
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000); // Update every 1 second

    return () => clearInterval(interval);
  }, []);
  
  const activeDrivers = React.useMemo(
    () => drivers.filter((driver) => driver.status !== "OFFLINE"),
    [drivers]
  );
  
  const filteredDrivers = React.useMemo(
    () => {
      if (!zoneFilter) return activeDrivers;
      if (zoneFilter === "NO_ZONE") {
        return activeDrivers.filter((driver) => !driver.zoneName && !driver.zoneId);
      }
      return activeDrivers.filter((driver) => driver.zoneId === zoneFilter || driver.zoneName === zoneFilter);
    },
    [activeDrivers, zoneFilter]
  );
  
  const uniqueZones = React.useMemo(() => {
    const zones = new Map<string, string>();
    drivers.forEach((driver) => {
      if (driver.zoneId && driver.zoneName) {
        zones.set(driver.zoneId, driver.zoneName);
      }
    });
    return Array.from(zones.entries()).map(([id, name]) => ({ id, name }));
  }, [drivers]);

  const driversByStatus = drivers.reduce<Record<string, number>>(
    (acc, driver) => {
      acc[driver.status] = (acc[driver.status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="border-b border-slate-200 px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Driver Status
            </h2>
            <p className="text-xs text-slate-600">
              Live view of fleet availability
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <span>Available {driversByStatus.AVAILABLE ?? 0}</span>
            <span>On Ride {driversByStatus.BUSY ?? 0}</span>
            <span>Away {driversByStatus.AWAY ?? 0}</span>
            <span>Offline {driversByStatus.OFFLINE ?? 0}</span>
          </div>
        </div>
        
        {/* Zone Filter */}
        {uniqueZones.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-medium text-slate-600 uppercase tracking-wide">Zone:</span>
            <button
              onClick={() => setZoneFilter(null)}
              className={classNames(
                "rounded-full px-2 py-1 text-[10px] font-medium transition",
                !zoneFilter
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              All ({activeDrivers.length})
            </button>
            {uniqueZones.map((zone) => {
              const driversInZone = activeDrivers.filter(d => d.zoneId === zone.id).length;
              return (
                <button
                  key={zone.id}
                  onClick={() => setZoneFilter(zone.id)}
                  className={classNames(
                    "rounded-full px-2 py-1 text-[10px] font-medium transition",
                    zoneFilter === zone.id
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {zone.name} ({driversInZone})
                </button>
              );
            })}
            <button
              onClick={() => setZoneFilter("NO_ZONE")}
              className={classNames(
                "rounded-full px-2 py-1 text-[10px] font-medium transition",
                zoneFilter === "NO_ZONE"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              No Zone ({activeDrivers.filter(d => !d.zoneId).length})
            </button>
          </div>
        )}
      </header>
      <div className="flex-1 overflow-auto px-4 py-3">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-2">Driver</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">App State</th>
              <th className="pb-2">Current Job</th>
              <th className="pb-2">Zone / Queue</th>
              <th className="pb-2">Location</th>
              <th className="pb-2 text-right">Contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredDrivers.map((driver) => (
              <tr 
                key={driver.id} 
                className="align-top hover:bg-slate-50"
                onMouseEnter={() => {
                  if (hoverTimeoutRef.current) {
                    clearTimeout(hoverTimeoutRef.current);
                  }
                  setHoveredDriverId(driver.id);
                }}
                onMouseLeave={() => {
                  hoverTimeoutRef.current = setTimeout(() => {
                    setHoveredDriverId(null);
                  }, 4000);
                }}
              >
                <td className="py-3">
                  <p className="font-medium text-slate-900">{driver.name}</p>
                  <p className="text-[11px] text-slate-500">{driver.vehicle}</p>
                </td>
                <td className="py-3">
                  <span
                    className={classNames(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-1 font-medium",
                      driverStatusClass[driver.status]
                    )}
                  >
                    <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
                    {driver.status.toLowerCase()}
                  </span>
                </td>
                {/* ✨ NEW: App State Indicator */}
                <td className="py-3">
                  {driver.appState === 'ACTIVE' || driver.isForeground ? (
                    <div className="inline-flex items-center gap-1 rounded-md bg-green-50 border border-green-200 px-2 py-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[11px] font-medium text-green-700">On Dashboard</span>
                    </div>
                  ) : driver.appState === 'BACKGROUND' || driver.isMinimized ? (
                    <div className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                      <span className="text-[11px] font-medium text-amber-700">Minimized</span>
                    </div>
                  ) : driver.appState === 'INACTIVE' ? (
                    <div className="inline-flex items-center gap-1 rounded-md bg-red-50 border border-red-200 px-2 py-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                      <span className="text-[11px] font-medium text-red-700">App Closed</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500">—</span>
                  )}
                </td>
                <td className="py-3">
                  <p className="text-[11px] text-slate-600">
                    {driver.currentJobId
                      ? driver.currentJobId
                      : "No active job"}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Last update {formatRelativeTime(driver.lastUpdate)}
                  </p>
                </td>
                <td className="py-3">
                  {driver.zoneName || driver.zoneId ? (
                    <div className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-1">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-600">
                        <Navigation className="h-2.5 w-2.5 text-white" />
                      </span>
                      <div>
                        <p className="text-[11px] font-semibold text-blue-900">
                          {driver.zoneName ?? driver.zoneId}
                        </p>
                        {driver.queuePosition && (
                          <p className="text-[9px] text-blue-700">
                            Queue #{driver.queuePosition}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] text-slate-500">
                      <span className="inline-block h-1 w-1 rounded-full bg-slate-400" />
                      No Zone
                    </span>
                  )}
                </td>
                <td className="py-3">
                  {driver.position ? (
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-600">
                        Lat {formatCoordinate(driver.position.latitude)} · Lon{" "}
                        {formatCoordinate(driver.position.longitude)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {driver.speedKmh !== null && driver.speedKmh !== undefined
                          ? `${Math.round(driver.speedKmh)} km/h`
                          : "Speed N/A"}
                        {driver.distanceKm !== null &&
                        driver.distanceKm !== undefined
                          ? ` · ${driver.distanceKm.toFixed(1)} km away`
                          : ""}
                        {driver.locationUpdatedAt && (
                          <span className="text-[10px] text-blue-600 font-medium">
                            {" · 📍 "}
                            {formatRelativeTime(driver.locationUpdatedAt)}
                          </span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">No signal</p>
                  )}
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="rounded-md border border-slate-300 p-1.5 text-slate-600 shadow-sm transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700">
                      <Phone size={14} />
                    </button>
                    {driver.position ? (
                      <button 
                        onClick={() => {
                          console.log('🎯 Focusing on driver:', driver.id, driver.name, driver.position);
                          focusDriver(driver.id);
                        }}
                        className="rounded-md border border-slate-300 p-1.5 text-slate-600 shadow-sm transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
                        title="Focus driver on map (5 sec)"
                      >
                        <Navigation size={14} />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {filteredDrivers.length === 0 && activeDrivers.length > 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="py-6 text-center text-sm text-slate-500"
                >
                  No drivers in selected zone.
                </td>
              </tr>
            )}
            {activeDrivers.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="py-6 text-center text-sm text-slate-500"
                >
                  No drivers are currently online.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DriverStatusPanel;
