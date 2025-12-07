import classNames from "classnames";
import { MapPin } from "lucide-react";
import React, { useMemo, useRef } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useDispatchStore } from "../../store/useDispatchStore";

const ZoneList: React.FC = () => {
  const { isDark } = useTheme();
  const zones = useDispatchStore((state) => state.zones);
  const drivers = useDispatchStore((state) => state.drivers);
  const loading = useDispatchStore((state) => state.loading);
  const focusZone = useDispatchStore((state) => state.focusZone);
  const setHoveredZoneId = useDispatchStore((state) => state.setHoveredZoneId);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const activeDrivers = React.useMemo(
    () => drivers.filter((driver) => driver.status !== "OFFLINE"),
    [drivers]
  );

  // Calculate drivers per zone
  const zoneDriverCount = useMemo(() => {
    const counts: Record<string, number> = {};
    activeDrivers.forEach((driver) => {
      if (driver.zoneId) {
        counts[driver.zoneId] = (counts[driver.zoneId] || 0) + 1;
      }
    });
    return counts;
  }, [activeDrivers]);

  // Get drivers for a specific zone
  const getZoneDrivers = (zoneId: string) => {
    return activeDrivers.filter((d) => d.zoneId === zoneId);
  };

  return (
    <div className={classNames(
      "flex h-full flex-col overflow-hidden",
      isDark ? "bg-slate-800" : "bg-white"
    )}>
      {/* Header - Compact */}
      <div className={classNames(
        "border-b px-2 py-1.5",
        isDark ? "bg-slate-700/50 border-slate-600" : "bg-slate-50 border-slate-200"
      )}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={classNames(
              "text-[10px] sm:text-xs font-medium",
              isDark ? "text-slate-200" : "text-slate-700"
            )}>
              Zone Management
            </h2>
            <p className={classNames(
              "text-[8px] sm:text-[9px]",
              isDark ? "text-slate-500" : "text-slate-400"
            )}>Zones with active drivers</p>
          </div>
          <span className={classNames(
            "rounded-full border px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[10px] font-normal",
            isDark 
              ? "border-slate-600 bg-slate-700 text-slate-300" 
              : "border-slate-200 bg-slate-100 text-slate-600"
          )}>
            {zones.length} Zones
          </span>
        </div>
      </div>

      {/* Zone List */}
      <div className={classNames(
        "flex-1 overflow-auto",
        isDark ? "bg-slate-800" : "bg-white"
      )}>
        {loading && (
          <div className={classNames(
            "flex items-center justify-center py-4 text-[10px] sm:text-xs",
            isDark ? "text-slate-400" : "text-slate-500"
          )}>
            Loading zones...
          </div>
        )}

        {!loading && zones.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className={classNames(
              "rounded-full p-2 mb-2",
              isDark ? "bg-slate-700" : "bg-slate-100"
            )}>
              <MapPin size={16} className={isDark ? "text-slate-500" : "text-slate-400"} />
            </div>
            <p className={classNames(
              "text-[10px] sm:text-xs font-medium",
              isDark ? "text-slate-300" : "text-slate-600"
            )}>
              No zones defined
            </p>
          </div>
        )}

        {zones.map((zone) => {
          const driversInZone = getZoneDrivers(zone.id);
          const availableDrivers = driversInZone.filter(
            (d) => d.status === "AVAILABLE"
          ).length;
          const busyDrivers = driversInZone.filter(
            (d) => d.status === "BUSY"
          ).length;
          const awayDrivers = driversInZone.filter(
            (d) => d.status === "AWAY"
          ).length;

          return (
            <div
              key={zone.id}
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) {
                  clearTimeout(hoverTimeoutRef.current);
                }
                setHoveredZoneId(zone.id);
              }}
              onMouseLeave={() => {
                hoverTimeoutRef.current = setTimeout(() => {
                  setHoveredZoneId(null);
                }, 4000);
              }}
              className={classNames(
                "border-b px-2 py-1.5 hover:border-l-2 hover:border-l-blue-500 transition-all duration-150 cursor-pointer",
                isDark 
                  ? "border-slate-700 hover:bg-slate-700/50" 
                  : "border-slate-100 hover:bg-slate-50"
              )}
              onClick={() => {
                console.log('🎯 Focusing on zone:', zone.id, zone.name);
                focusZone(zone.id);
              }}
              title="Click to focus this zone on map"
            >
              {/* Zone Row - Compact single line */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className={classNames(
                    "w-1.5 h-1.5 rounded-full flex-shrink-0",
                    driversInZone.length > 0 ? "bg-blue-500" : "bg-slate-400"
                  )} />
                  <span className={classNames(
                    "text-[9px] sm:text-[10px] font-medium truncate",
                    isDark ? "text-slate-200" : "text-slate-700"
                  )}>
                    {zone.name}
                  </span>
                </div>
                
                {/* Driver counts inline */}
                <div className="flex items-center gap-1 text-[8px] sm:text-[9px] flex-shrink-0">
                  <span className={classNames(
                    "flex items-center gap-0.5",
                    isDark ? "text-slate-400" : "text-slate-500"
                  )}>
                    {zoneDriverCount[zone.id] || 0}
                  </span>
                  {availableDrivers > 0 && (
                    <span className="flex items-center gap-0.5 text-emerald-500">
                      •{availableDrivers}
                    </span>
                  )}
                  {zone.queue && zone.queue.length > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-500">
                      q{zone.queue.length}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ZoneList;
