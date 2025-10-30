import React from "react";

interface DispatchLayoutProps {
  leftColumn: React.ReactNode;
  rightColumn: React.ReactNode;
  bottomLeft?: React.ReactNode;
  bottomRight?: React.ReactNode;
  dispatcherName?: string;
  companyName?: string;
  onLogout?: () => void;
}

const DispatchLayout: React.FC<DispatchLayoutProps> = ({
  leftColumn,
  rightColumn,
  bottomLeft,
  bottomRight,
  dispatcherName,
  companyName,
  onLogout,
}) => (
  <div className="flex h-full flex-col bg-slate-50">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
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

    <main className="flex flex-1 overflow-hidden">
      <section className="flex w-[420px] flex-col border-r border-slate-200 bg-white">
        {leftColumn}
        {bottomLeft ? (
          <div className="border-t border-slate-200">{bottomLeft}</div>
        ) : null}
      </section>
      <section className="flex flex-1 flex-col bg-slate-50">
        {rightColumn}
        {bottomRight ? (
          <div className="border-t border-slate-200">{bottomRight}</div>
        ) : null}
      </section>
    </main>
  </div>
);

export default DispatchLayout;
