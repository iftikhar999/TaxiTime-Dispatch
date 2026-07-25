import React, { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import LoginForm from "./components/auth/LoginForm";
import DriverStatusPanel from "./components/drivers/DriverStatusPanel";
import JobBoard from "./components/jobs/JobBoard";
import JobComposerComplete from "./components/jobs/JobComposerComplete";
import ResizableDispatchLayout from "./components/layout/ResizableDispatchLayout";
import MapContainer from "./components/map/MapContainer";
import SocketConnectionBanner from "./components/common/SocketConnectionBanner";
import DriverMessageInbox from "./components/common/DriverMessageInbox";
import { useStateReconciliation } from "./hooks/useStateReconciliation";
import ZoneList from "./components/zones/ZoneList";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useDispatchController } from "./hooks/useDispatchController";
import { useEmergencyAlerts } from "./hooks/useEmergencyAlerts";
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
  // Self-healing reconciliation: silently re-pulls state from the server when
  // driver/job drift persists past the grace window. No user-facing popup.
  useStateReconciliation();

  // Mirror the Create-Job composer's open state onto the Zustand store so
  // the map (which doesn't receive this prop directly) can switch its
  // auto-fit target from "all zones" to "all drivers" while the composer is
  // mounted — gives the dispatcher visibility of the available fleet while
  // picking pickup / dropoff.
  useEffect(() => {
    useDispatchStore.getState().setJobComposerOpen(showJobCreation);
  }, [showJobCreation]);
  // Wave 2D — SOS / emergency alerts: socket listener + initial fetch.
  // Safe to run unconditionally; it no-ops when the socket isn't up.
  useEmergencyAlerts();

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
      // Preserve service type
      serviceType: jobData.serviceType || jobData.service_type || requirements.serviceType || "TAXI",
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
      // Extract stops
      stops: requirements.stops || jobData.stops || [],
    };
    
    console.log("[App] Enriched edit data:", enrichedJobData);
    setEditJobData(enrichedJobData);
    setIsEditMode(true);
    setShowJobCreation(true);
  };

  // Closing the Create/Edit Job panel causes a layout shift: the sliding
  // panel disappears and the JobBoard rows grow into the freed space. The
  // cursor — which was over the Create button — ends up hovering a newly
  // rendered row (typically the just-created job's Eye icon), firing a
  // phantom onMouseEnter that sets hoveredJobId and resurrects the P/D
  // markers on the map. We clear once synchronously, then again on the next
  // frames to stomp whatever layout-shift hover fires during the transition.
  const clearMapArtifactsHard = () => {
    selectJob(null);
    useDispatchStore.getState().clearJobDraft();
    useDispatchStore.getState().setHoveredJobId(null);
    // Open a 700ms hover-suppression window. While this window is open,
    // setHoveredJobId(non-null) is a no-op — so the post-submit layout
    // shift (cursor ending up on a freshly-rendered eye icon → onMouseMove
    // fires repeatedly) cannot repaint pickup pins via a phantom hover.
    // Past attempts used only the rAF stomp below, which fired twice and
    // could be defeated by continued cursor motion; an explicit time
    // window is bullet-proof.
    useDispatchStore.getState().setHoverSuppressedUntil(Date.now() + 700);
    const stomp = () => {
      const s = useDispatchStore.getState();
      if (s.hoveredJobId) s.setHoveredJobId(null);
      if (s.selectedJobId) s.selectJob(null);
    };
    requestAnimationFrame(() => { stomp(); requestAnimationFrame(stomp); });
    setTimeout(stomp, 300);
  };

  const handleJobCreated = () => {
    setShowJobCreation(false);
    setIsEditMode(false);
    setEditJobData(null);
    clearMapArtifactsHard();
  };

  const handleJobUpdated = () => {
    setShowJobCreation(false);
    setIsEditMode(false);
    setEditJobData(null);
    clearMapArtifactsHard();
  };

  const handleCloneJob = () => {
    // Switch from edit to create mode — keeps form data in component 
    // Use 'clone' key so component doesn't remount but knows it's now create mode
    setIsEditMode(false);
    // Don't clear editJobData yet — it would change the key and remount
    // The component will keep its current form state
  };

  const handleCloseJobCreation = () => {
    setShowJobCreation(false);
    setIsEditMode(false);
    setEditJobData(null);
    clearMapArtifactsHard();
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
    <ThemeProvider>
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

      {/* Socket Traffic Monitor - Hidden for cleaner UI */}
      {/* <SocketTrafficMonitor /> */}
      {/* StateReconciliationWarning removed — reconciliation now auto-heals
          silently via useStateReconciliation() above. */}
      <SocketConnectionBanner />

      <ResizableDispatchLayout
        dispatcherName={dispatcherName}
        companyName={companyName}
        onLogout={handleLogout}
        jobList={<JobBoard 
          onCreateJobClick={() => setShowJobCreation(true)} 
          onEditJob={handleEditJob}
        />}
        map={
          <MapContainer 
            showJobCreation={showJobCreation}
            editJobData={editJobData}
          />
        }
        driverList={<DriverStatusPanel />}
        zoneList={<ZoneList />}
        jobCreation={
          <JobComposerComplete 
            key={editJobData?.id || 'new'} // Force remount when editing different jobs
            onJobCreated={handleJobCreated}
            onJobUpdated={handleJobUpdated}
            onClone={handleCloneJob}
            editJobData={editJobData}
            isEditMode={isEditMode}
          />
        }
        showJobCreation={showJobCreation}
        isEditMode={isEditMode}
        onCloseJobCreation={handleCloseJobCreation}
      />
      {/* Floating driver-chat inbox — live messages from drivers, reply
          in real time. Mounted here so it overlays every dispatch view. */}
      <DriverMessageInbox />
    </ThemeProvider>
  );
};

export default App;
