import React from "react";
import { Activity, Signal, SignalZero, Wifi, WifiOff } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { useDispatchSocket } from "../../providers/SocketProvider";
import { useDispatchStore } from "../../store/useDispatchStore";
import DispatchMapGoogle from "./DispatchMapGoogleSimple";

interface MapContainerProps {
  showJobCreation: boolean;
  editJobData: any;
}

const MapContainer: React.FC<MapContainerProps> = ({ showJobCreation, editJobData }) => {
  const { isDark } = useTheme();
  const { connected } = useDispatchSocket();
  const loading = useDispatchStore((state) => state.loading);
  const error = useDispatchStore((state) => state.error);
  const drivers = useDispatchStore((state) => state.drivers);
  const jobs = useDispatchStore((state) => state.jobs);

  const activeDrivers = drivers.filter((d: any) => d.status === "AVAILABLE" || d.status === "BUSY" || d.status === "ON_THE_WAY").length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Map Status Bar */}
      <div 
        className={`flex items-center justify-between px-2.5 py-1 text-[10px] ${
          isDark 
            ? "bg-slate-800/60 text-slate-400" 
            : "bg-white text-slate-500"
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <span className="flex items-center gap-1">
            {connected ? (
              <Wifi size={10} className="text-emerald-500" />
            ) : (
              <WifiOff size={10} className="text-red-400" />
            )}
            <span className={connected ? "text-emerald-500 font-medium" : "text-red-400 font-medium"}>
              {connected ? "Connected" : "Disconnected"}
            </span>
          </span>

          {/* Live Indicator */}
          {connected && !error && !loading && (
            <span className="flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-emerald-500">Live</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Stats */}
          <span className={isDark ? "text-slate-500" : "text-slate-400"}>
            {activeDrivers} driver{activeDrivers !== 1 ? "s" : ""} online
          </span>

          {/* Error / Loading */}
          {error && <span className="text-rose-400 font-medium">⚠ {error}</span>}
          {loading && !error && <span className="text-amber-400">Syncing...</span>}
        </div>
      </div>
      <div className="flex-1">
        <DispatchMapGoogle />
      </div>
    </div>
  );
};

export default MapContainer;
