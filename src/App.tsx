import React, { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import LoginForm from "./components/auth/LoginForm";
import DriverStatusPanel from "./components/drivers/DriverStatusPanel";
import JobBoard from "./components/jobs/JobBoard";
import JobComposerComplete from "./components/jobs/JobComposerComplete";
import GridDispatchLayout from "./components/layout/GridDispatchLayout";
import DispatchMapGoogle from "./components/map/DispatchMapGoogleSimple";
import SocketTrafficMonitor from "./components/monitoring/SocketTrafficMonitor";
import ZoneList from "./components/zones/ZoneList";
import { useDispatchController } from "./hooks/useDispatchController";
import { useDispatchSocket } from "./providers/SocketProvider";
import { authService } from "./services/authService";
import { useAuthStore } from "./store/useAuthStore";
import { useDispatchStore } from "./store/useDispatchStore";

const App: React.FC = () => {
  // ALL HOOKS MUST BE AT THE TOP - BEFORE ANY CONDITIONAL LOGIC
  const connected = useDispatchSocket().connected;
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const hydrate = useAuthStore((state) => state.hydrate);
  const logout = useAuthStore((state) => state.logout);
  const hydrated = useAuthStore((state) => state.hydrated);
  const dispatcher = useDispatchStore((state) => state.dispatcher);
  const loading = useDispatchStore((state) => state.loading);
  const error = useDispatchStore((state) => state.error);
  const selectJob = useDispatchStore((state) => state.selectJob);

  // State for sliding job creation panel - MOVED TO TOP
  const [showJobCreation, setShowJobCreation] = useState(false);
  const [editJobData, setEditJobData] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  useDispatchController();

  useEffect(() => {
    console.log("[App] Hydrating auth store");
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    console.log("[App] Auth state changed", {
      hydrated,
      hasUser: !!user,
      hasToken: !!token,
      role: user?.role,
    });
  }, [hydrated, user, token]);

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.warn("Dispatch logout error", error);
    } finally {
      logout();
    }
  };

  const handleEditJob = (jobId: string, jobData: any) => {
    console.log("[App] Edit job called with data:", jobData);
    
    // Extract data from requirements JSON field if it exists
    const requirements = jobData.requirements || {};
    
    const enrichedJobData = {
      ...jobData,
      // Extract passenger info from requirements
      passengerName: requirements.passengerName || jobData.riderName || jobData.passengerName,
      phone: requirements.passengerPhone || jobData.riderPhone || jobData.phone,
      email: jobData.email || jobData.riderEmail,
      // Extract job requirements
      passengers: requirements.passengers || 1,
      bags: requirements.bags || 0,
      wheelchairs: requirements.wheelchairs || 0,
      vehiclesNeeded: requirements.vehiclesNeeded || 1,
      // Extract other fields
      tariffId: requirements.tariffId || jobData.tariffId,
      validationCode: requirements.validationCode || jobData.validationCode,
      notes: requirements.notes || jobData.notes || jobData.instructions,
      currency: requirements.currency || jobData.currency,
      fareBreakdown: requirements.fareBreakdown,
      baseFare: requirements.fareBreakdown?.base,
      distanceFare: requirements.fareBreakdown?.distance,
      waitingFare: requirements.fareBreakdown?.waiting,
    };
    
    console.log("[App] Enriched edit data:", enrichedJobData);
    setEditJobData(enrichedJobData);
    setIsEditMode(true);
    setShowJobCreation(true);
  };

  const handleJobCreated = () => {
    setShowJobCreation(false);
    setIsEditMode(false);
    setEditJobData(null);
  };

  const handleJobUpdated = () => {
    setShowJobCreation(false);
    setIsEditMode(false);
    setEditJobData(null);
    // Clear selected job from map
    selectJob(null);
  };

  const handleCloseJobCreation = () => {
    setShowJobCreation(false);
    setIsEditMode(false);
    setEditJobData(null);
    // Clear selected job from map
    selectJob(null);
  };

  if (!hydrated) {
    console.log("[App] Rendering loading state - not hydrated yet");
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
        <div className="rounded-md border border-slate-300 bg-white px-6 py-4 text-sm shadow-lg">
          Initialising dispatcher console…
        </div>
      </div>
    );
  }

  if (!user || !token) {
    console.log("[App] Rendering login form - no user or token");
    return <LoginForm />;
  }

  if (user.role !== "DISPATCHER") {
    console.log("[App] Rendering access restricted - user is not dispatcher");
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-slate-900">
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-8 py-6 text-center shadow-lg">
          <h1 className="text-xl font-semibold text-rose-900">
            Access restricted
          </h1>
          <p className="mt-2 text-sm text-rose-700">
            This console is only available to dispatcher accounts. Please sign
            out and use dispatcher credentials.
          </p>
          <button
            className="mt-4 rounded-md border border-rose-400 bg-white px-4 py-2 text-sm text-rose-700 hover:bg-rose-100 transition"
            onClick={logout}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const dispatcherName =
    dispatcher?.name ||
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.email;
  const companyName = dispatcher?.companyId ?? user.companyId ?? "Company";

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "#fff",
            color: "#1e293b",
            border: "1px solid #e2e8f0",
          },
          success: {
            iconTheme: {
              primary: "#10b981",
              secondary: "#fff",
            },
          },
          error: {
            iconTheme: {
              primary: "#ef4444",
              secondary: "#fff",
            },
          },
        }}
      />

      {/* Socket Traffic Monitor - Real-time socket event monitoring */}
      <SocketTrafficMonitor />

      <GridDispatchLayout
        dispatcherName={dispatcherName}
        companyName={companyName}
        onLogout={handleLogout}
        jobList={<JobBoard 
          onCreateJobClick={() => setShowJobCreation(true)} 
          onEditJob={handleEditJob}
        />}
        map={
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              <span>Socket: {connected ? "Connected" : "Disconnected"}</span>
              <span
                className={
                  error ? "text-rose-600" : loading ? "text-amber-600" : ""
                }
              >
                {error
                  ? `Error: ${error}`
                  : loading
                  ? "Syncing..."
                  : "Live updates"}
              </span>
            </div>
            <div className="flex-1">
              <DispatchMapGoogle 
                showJobCreation={showJobCreation}
                editJobData={editJobData}
              />
            </div>
          </div>
        }
        driverList={<DriverStatusPanel />}
        zoneList={<ZoneList />}
        jobCreation={
          <JobComposerComplete 
            key={editJobData?.id || 'new'} // Force remount when editing different jobs
            onJobCreated={handleJobCreated}
            onJobUpdated={handleJobUpdated}
            editJobData={editJobData}
            isEditMode={isEditMode}
          />
        }
        showJobCreation={showJobCreation}
        onCloseJobCreation={handleCloseJobCreation}
      />
    </>
  );
};

export default App;
