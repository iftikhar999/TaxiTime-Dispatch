import React from "react";
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

  // Helper functions to reduce ternary complexity
  const getStatusTextClass = () => {
    if (error) return "text-rose-500";
    if (loading) return "text-amber-500";
    return "";
  };

  const getStatusText = () => {
    if (error) return `Error: ${error}`;
    if (loading) return "Syncing...";
    return "Live updates";
  };

  return (
    <div className="flex h-full flex-col">
      <div 
        className={`flex items-center justify-between border-b px-2 py-1 text-[9px] sm:text-[10px] ${
          isDark 
            ? "border-slate-600 bg-slate-700/50 text-slate-400" 
            : "border-slate-200 bg-slate-50 text-slate-500"
        }`}
      >
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
          {connected ? "Connected" : "Disconnected"}
        </span>
        <span className={getStatusTextClass()}>
          {getStatusText()}
        </span>
      </div>
      <div className="flex-1">
        <DispatchMapGoogle />
      </div>
    </div>
  );
};

export default MapContainer;
