import { X } from "lucide-react";
import React from "react";

interface GridDispatchLayoutProps {
  dispatcherName?: string;
  companyName?: string;
  onLogout?: () => void;
  jobList: React.ReactNode;
  driverList: React.ReactNode;
  zoneList: React.ReactNode;
  map: React.ReactNode;
  jobCreation: React.ReactNode;
  showJobCreation: boolean;
  onCloseJobCreation: () => void;
}

const GridDispatchLayout: React.FC<GridDispatchLayoutProps> = ({
  dispatcherName,
  companyName,
  onLogout,
  jobList,
  driverList,
  zoneList,
  map,
  jobCreation,
  showJobCreation,
  onCloseJobCreation,
}) => {
  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm z-10">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            TaxiTime Dispatch Console
          </h1>
          <p className="text-xs text-slate-500">
            Monitor jobs, drivers, and zones in real time
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-700">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 border border-emerald-200">
            Dispatcher: {dispatcherName ?? "—"}
          </span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 border border-blue-200">
            {companyName ?? "—"}
          </span>
          <button
            className="rounded-md border border-slate-300 px-3 py-1 text-slate-700 transition hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="flex-1 overflow-hidden relative">
        <div className="grid grid-cols-2 grid-rows-2 h-full gap-2 p-2">
          {/* Top Left: Job Listing */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            {jobList}
          </div>

          {/* Top Right: Map */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            {map}
          </div>

          {/* Bottom Left: Driver Listing */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            {driverList}
          </div>

          {/* Bottom Right: Zone Listing */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            {zoneList}
          </div>
        </div>

        {/* Sliding Job Creation Panel - LEFT SIDE */}
        <div
          className={`fixed top-0 left-0 h-full w-[480px] bg-white shadow-2xl border-r border-slate-200 transform transition-transform duration-300 ease-in-out z-[1100] ${
            showJobCreation ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Create New Job
              </h2>
              <p className="text-xs text-slate-500">
                Fill in the details to create a new ride
              </p>
            </div>
            <button
              onClick={onCloseJobCreation}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
              aria-label="Close job creation panel"
            >
              <X size={20} />
            </button>
          </div>

          {/* Panel Content */}
          <div className="h-[calc(100%-64px)] overflow-auto">{jobCreation}</div>
        </div>

        {/* Overlay when panel is open - Only covers left side, allows map interaction */}
        {showJobCreation && (
          <div
            className="fixed inset-0 z-[1050] pointer-events-none"
            aria-label="Job creation overlay"
          >
            {/* Semi-transparent overlay on the left half only */}
            <div 
              className="absolute top-0 left-0 bottom-0 right-1/2 bg-black/10 pointer-events-auto"
              onClick={(e) => {
                // Only close if clicking directly on the overlay, not on the panel
                if (e.target === e.currentTarget) {
                  onCloseJobCreation();
                }
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default GridDispatchLayout;
