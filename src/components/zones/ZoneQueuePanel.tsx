import React, { useMemo, useState } from "react";
import { useDispatchStore } from "../../store/useDispatchStore";
import { getDriverStatusColor } from "../../utils/driverStatusColors";
import {
    getVehicleDisplayName,
    getVehicleIconUrl,
    getVehicleTypeColor,
} from "../../utils/vehicleIcons";

const ZoneQueuePanel: React.FC = () => {
  const zones = useDispatchStore((state) => state.zones);
  const drivers = useDispatchStore((state) => state.drivers);
  const [search, setSearch] = useState("");

  const zonesWithDrivers = useMemo(() => {
    // Use server-provided zone data instead of client-side detection
    return zones
      .filter((zone) => zone.name.toLowerCase().includes(search.toLowerCase()))
      .map((zone) => {
        // Filter drivers by their zone ID (from backend)
        const driversInZone = drivers.filter((driver) => {
          // Match by zone ID (primary) or zone name (fallback)
          return driver.zoneId === zone.id || driver.zoneName === zone.name;
        });

        // Sort by queue position if available
        driversInZone.sort((a, b) => {
          // Use queuePosition from backend if available
          const posA = a.queuePosition ?? Number.MAX_SAFE_INTEGER;
          const posB = b.queuePosition ?? Number.MAX_SAFE_INTEGER;
          
          if (posA !== posB) {
            return posA - posB;
          }
          
          // Fallback to last update time
          return (a.lastUpdate ?? "").localeCompare(b.lastUpdate ?? "");
        });

        return {
          zone,
          drivers: driversInZone,
        };
      })
      .filter((entry) => entry.drivers.length > 0);
  }, [zones, drivers, search]);

  return (
    <div className="flex h-64 flex-col bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Zone Queue</h3>
          <p className="text-xs text-slate-600">
            FIFO ordering ensures fair dispatching inside each zone
          </p>
        </div>
        <button className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 shadow-sm transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700">
          Manage Zones
        </button>
      </header>
      <div className="flex-1 overflow-auto px-4 py-3">
        <div className="mb-2">
          <input
            type="text"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            placeholder="Search zones..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-2">Zone Name</th>
              <th className="pb-2">Drivers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {zonesWithDrivers.map(({ zone, drivers: zoneDrivers }) => (
              <tr key={zone.id} className="hover:bg-slate-50">
                <td className="py-3">
                  <p className="font-medium text-slate-900">{zone.name}</p>
                  {zone.description ? (
                    <p className="text-[11px] text-slate-600">
                      {zone.description}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-slate-500 mt-1">
                    {zoneDrivers.length} in queue
                  </p>
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    {zoneDrivers.map((driver, index) => (
                      <div
                        key={driver.id}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-sm"
                      >
                        {/* Vehicle Icon */}
                        <div className="flex-shrink-0">
                          <img
                            src={getVehicleIconUrl(driver.vehicleType)}
                            alt={getVehicleDisplayName(driver.vehicleType)}
                            className="w-6 h-4 object-contain"
                            style={{
                              filter: `hue-rotate(0deg) brightness(1.2)`,
                            }}
                            onError={(e) => {
                              // Fallback to colored circle if SVG fails to load
                              const target = e.currentTarget;
                              target.style.display = "none";
                              const fallback = document.createElement("div");
                              fallback.className =
                                "w-3 h-3 rounded-full flex-shrink-0";
                              fallback.style.backgroundColor =
                                getVehicleTypeColor(driver.vehicleType);
                              target.parentNode?.insertBefore(fallback, target);
                            }}
                          />
                        </div>

                        {/* Driver Info */}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {/* Queue Position Badge */}
                          <span className="inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-[10px] w-5 h-5 flex-shrink-0">
                            {driver.queuePosition ?? index + 1}
                          </span>

                          {/* Driver Name with Status Color Background */}
                          <div
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md flex-1 min-w-0"
                            style={{
                              backgroundColor: `${getDriverStatusColor(driver.status)}20`,
                              borderLeft: `3px solid ${getDriverStatusColor(driver.status)}`,
                            }}
                          >
                            <span className="text-slate-900 font-medium truncate">
                              {driver.name}
                            </span>
                            
                            {/* Status Badge */}
                            <span 
                              className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{
                                backgroundColor: getDriverStatusColor(driver.status),
                                color: 'white',
                              }}
                            >
                              {driver.status}
                            </span>
                          </div>
                        </div>

                        {/* Vehicle Number */}
                        <span className="text-slate-500 text-[10px] font-mono">
                          {driver.vehicle}
                        </span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {zonesWithDrivers.length === 0 && (
              <tr>
                <td
                  colSpan={2}
                  className="py-6 text-center text-sm text-slate-600"
                >
                  No drivers currently positioned inside configured zones.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ZoneQueuePanel;
