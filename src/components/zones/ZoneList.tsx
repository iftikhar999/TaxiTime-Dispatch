import { Clock, MapPin, Users } from "lucide-react";
import React, { useMemo, useRef } from "react";
import { useDispatchStore } from "../../store/useDispatchStore";

const ZoneList: React.FC = () => {
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Zone Management
            </h2>
            <p className="text-xs text-slate-500">Zones with active drivers</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700">
              {zones.length} Zones
            </span>
          </div>
        </div>
      </div>

      {/* Zone List */}
      <div className="flex-1 overflow-auto bg-slate-50">
        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-slate-600">
            Loading zones...
          </div>
        )}

        {!loading && zones.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-slate-100 p-4 mb-3">
              <MapPin size={32} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">
              No zones defined
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Create zones to organize your drivers
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
              className="border-b border-slate-200 bg-white px-3 py-2 hover:bg-slate-50 hover:translate-x-0.5 hover:border-l-4 hover:border-l-blue-500 transition-all duration-200 cursor-pointer"
              onClick={() => {
                console.log('🎯 Focusing on zone:', zone.id, zone.name);
                focusZone(zone.id);
              }}
              title="Click to focus this zone on map"
            >
              {/* Zone Header - Compact */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="rounded-full bg-blue-100 p-1">
                    <MapPin size={12} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-semibold text-slate-900 truncate">
                      {zone.name}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-medium text-slate-600 shrink-0">
                  <Users size={10} />
                  {zoneDriverCount[zone.id] || 0}
                  {zone.queue && zone.queue.length > 0 && (
                    <>
                      <span className="text-slate-300">|</span>
                      <Clock size={10} className="text-amber-600" />
                      <span className="text-amber-700">{zone.queue.length}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Driver Status Summary - Compact */}
              <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                  <span className="text-slate-600">{availableDrivers}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
                  <span className="text-slate-600">{busyDrivers}</span>
                </div>
                {awayDrivers > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-orange-500"></div>
                    <span className="text-slate-600">{awayDrivers}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ZoneList;
