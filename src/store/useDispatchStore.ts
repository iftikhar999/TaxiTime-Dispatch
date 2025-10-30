import { create } from "zustand";

export type JobStatus =
  | "UNASSIGNED"
  | "OFFERED"
  | "ASSIGNED"
  | "REJECTED"
  | "NOSHOW"
  | "RECALLED"
  | "ACTIVE"
  | "FINISHED"
  | "CANCELLED";

export interface DispatchJob {
  id: string;
  reference: string;
  pickupAddress: string;
  dropoffAddress: string;
  status: JobStatus;
  requestedAt: string;
  riderName?: string;
  riderPhone?: string;
  riderEmail?: string;
  paymentMethod?: string;
  driverId?: string;
  tariffName?: string;
  tariffId?: string;
  fareEstimate?: number;
  notes?: string;
  rawStatus?: string;
  // Customer information
  customerId?: string;
  // Job requirements
  passengers?: number;
  bags?: number;
  wheelchairs?: number;
  vehiclesNeeded?: number;
  // Location coordinates
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  // Fare breakdown
  currency?: string;
  baseFare?: number;
  distanceFare?: number;
  waitingFare?: number;
  estimatedDistance?: number;
  // Scheduling
  scheduledAt?: string;
  scheduledFor?: string;
  isScheduled?: boolean;
  pickupLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  dropoffLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  routePath?: Array<{ lat: number; lng: number }>;
  driverTrail?: Array<{
    latitude: number;
    longitude: number;
    heading?: number;
    timestamp?: string | null;
  }>;
  // Full objects from backend for comprehensive data access
  requirements?: {
    passengers?: number;
    bags?: number;
    wheelchairs?: number;
    vehiclesNeeded?: number;
    notes?: string;
    tariffId?: string;
    currency?: string;
    fareBreakdown?: {
      base?: number;
      distance?: number;
      waiting?: number;
    };
    passengerName?: string;
    passengerPhone?: string;
    passengerEmail?: string;
  };
  customer?: {
    id: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
  };
}

export interface DispatchDriver {
  id: string;
  name: string;
  vehicle: string | {
    id?: string;
    plateNumber?: string;
    make?: string;
    model?: string;
    type?: string;
    typeName?: string;
    icon?: string | null; // Vehicle type icon from database
    displayName?: string;
  };
  vehicleType?: string; // Added vehicle type for icon mapping
  phone?: string;
  status: "AVAILABLE" | "BUSY" | "ROGER" | "AWAY" | "OFFLINE";
  zoneId?: string;
  zoneName?: string | null;
  queuePosition?: number | null;
  lastUpdate?: string;
  locationUpdatedAt?: string; // ✅ Real-time location update timestamp
  currentJobId?: string;
  position?: {
    latitude: number;
    longitude: number;
    heading?: number;
  };
  speedKmh?: number | null;
  distanceKm?: number | null;
  email?: string;
  rating?: number;
  // ✨ NEW: App state tracking (foreground/background)
  appState?: 'ACTIVE' | 'BACKGROUND' | 'INACTIVE';
  isMinimized?: boolean;
  isForeground?: boolean;
  appStateUpdatedAt?: string;
}

export interface DispatchZone {
  id: string;
  name: string;
  description?: string | null;
  polygon?: Array<{ lat: number; lng: number }>;
  queue?: string[];
}

export interface JobCounters {
  unassigned: number;
  offered: number;
  assigned: number;
  active: number;
  finished: number;
  cancelled: number;
  noShow: number;
  rejected: number;
  recalled: number;
}

export interface JobDraftLocation {
  address: string;
  latitude: number;
  longitude: number;
}

export interface JobDraft {
  pickup?: JobDraftLocation;
  dropoff?: JobDraftLocation;
  routePath?: Array<{ lat: number; lng: number }>;
}

interface DispatchState {
  jobs: DispatchJob[];
  drivers: DispatchDriver[];
  zones: DispatchZone[];
  selectedJobId: string | null;
  selectedStatus: JobStatus;
  jobCounters: JobCounters;
  tariffs: any[];
  vehicleTypes: any[];
  activeCustomers: any[];
  dispatcher: {
    id: string;
    name: string;
    email?: string;
    companyId?: string | null;
  } | null;
  loading: boolean;
  error: string | null;
  jobDraft: JobDraft | null;
  selectionTimerId: NodeJS.Timeout | null;
  focusedDriverId: string | null;
  focusedZoneId: string | null;
  mapFocusCoords: { lat: number; lng: number; zoom?: number } | null;
  hoveredJobId: string | null;
  hoveredDriverId: string | null;
  hoveredZoneId: string | null;
  setJobs: (jobs: DispatchJob[]) => void;
  setDrivers: (drivers: DispatchDriver[]) => void;
  setZones: (zones: DispatchZone[]) => void;
  setTariffs: (tariffs: any[]) => void;
  setVehicleTypes: (vehicleTypes: any[]) => void;
  setJobCounters: (counters: Partial<JobCounters>) => void;
  setDispatcher: (dispatcher: DispatchState["dispatcher"]) => void;
  setActiveCustomers: (customers: any[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (message: string | null) => void;
  selectJob: (id: string | null) => void;
  setSelectedStatus: (status: JobStatus) => void;
  focusDriver: (driverId: string | null) => void;
  focusZone: (zoneId: string | null) => void;
  focusMapCoords: (coords: { lat: number; lng: number; zoom?: number } | null) => void;
  focusAllZones: () => void;
  setHoveredJobId: (jobId: string | null) => void;
  setHoveredDriverId: (driverId: string | null) => void;
  setHoveredZoneId: (zoneId: string | null) => void;
  upsertDriver: (driver: DispatchDriver) => void;
  removeDriver: (driverId: string) => void;
  updateDriverLocation: (
    driverId: string,
    position: DispatchDriver["position"],
    locationUpdatedAt?: string
  ) => void;
  updateJob: (job: DispatchJob) => void;
  createJob: (payload: any) => Promise<void>;
  assignDriver: (
    jobId: string,
    driverId: string,
    status?: string
  ) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  unassignJob: (jobId: string, reason?: string) => Promise<void>;
  editJob: (jobId: string, payload: any) => Promise<void>;
  updateJobDraft: (draft: Partial<JobDraft>) => void;
  clearJobDraft: () => void;
}

export const useDispatchStore = create<DispatchState>((set, get) => ({
  jobs: [],
  drivers: [],
  zones: [],
  selectedJobId: null,
  selectionTimerId: null,
  selectedStatus: "UNASSIGNED",
  jobCounters: {
    unassigned: 0,
    offered: 0,
    assigned: 0,
    active: 0,
    finished: 0,
    cancelled: 0,
    noShow: 0,
    rejected: 0,
    recalled: 0,
  },
  tariffs: [],
  vehicleTypes: [],
  activeCustomers: [],
  dispatcher: null,
  loading: false,
  error: null,
  jobDraft: null,
  focusedDriverId: null,
  focusedZoneId: null,
  mapFocusCoords: null,
  hoveredJobId: null,
  hoveredDriverId: null,
  hoveredZoneId: null,
  setJobs: (jobs) => {
    console.log("🔍 [Store] setJobs called with:", {
      totalJobs: jobs.length,
      byStatus: jobs.reduce((acc: any, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {}),
      jobs: jobs.map((j: any) => ({
        id: j.id,
        reference: j.reference,
        status: j.status,
        rawStatus: j.rawStatus,
      })),
    });
    set({ jobs });
  },
  setDrivers: (drivers) => set({ drivers }),
  setZones: (zones) => set({ zones }),
  setTariffs: (tariffs) => set({ tariffs }),
  setVehicleTypes: (vehicleTypes) => set({ vehicleTypes }),
  setJobCounters: (counters) =>
    set((state) => ({
      jobCounters: { ...state.jobCounters, ...counters },
    })),
  setDispatcher: (dispatcher) => set({ dispatcher }),
  setActiveCustomers: (activeCustomers) => set({ activeCustomers }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  selectJob: (selectedJobId) => {
    console.log('🏪 Store selectJob called:', selectedJobId);
    const state = get();
    // Clear existing timer if any
    if (state.selectionTimerId) {
      clearTimeout(state.selectionTimerId);
    }
    
    // If selecting a job (not clearing), set auto-clear timer for 4 seconds and return to all zones
    let newTimerId = null;
    if (selectedJobId) {
      newTimerId = setTimeout(() => {
        console.log('⏰ Auto-clearing selectedJobId after 4 seconds and returning to all zones');
        set({ 
          selectedJobId: null, 
          selectionTimerId: null,
          focusedZoneId: null,
          focusedDriverId: null,
          mapFocusCoords: null
        });
      }, 4000); // Clear after 4 seconds
    }
    
    set({ selectedJobId, selectionTimerId: newTimerId });
    console.log('✅ selectedJobId set:', selectedJobId);
  },
  setSelectedStatus: (selectedStatus) => set({ selectedStatus }),
  focusDriver: (focusedDriverId) => {
    console.log('🏪 Store focusDriver called:', focusedDriverId);
    // When focusing a driver, also set map coordinates
    if (focusedDriverId) {
      const driver = get().drivers.find(d => d.id === focusedDriverId);
      console.log('👤 Driver found:', driver);
      if (driver?.position) {
        console.log('📍 Driver position:', driver.position);
        set({ 
          focusedDriverId, 
          mapFocusCoords: { 
            lat: driver.position.latitude, 
            lng: driver.position.longitude, 
            zoom: 16 
          } 
        });
        console.log('✅ mapFocusCoords set');
        
        // Clear focus and coords after 5 seconds, return to all zones
        setTimeout(() => {
          console.log('⏰ Clearing driver focus and returning to all zones after 5 seconds');
          set({ 
            mapFocusCoords: null,
            focusedDriverId: null,
            focusedZoneId: null
          });
        }, 5000);
      } else {
        console.log('⚠️ Driver has no position, only setting focusedDriverId');
        set({ focusedDriverId });
      }
    } else {
      set({ focusedDriverId });
    }
  },
  focusZone: (focusedZoneId) => {
    console.log('🏪 Store focusZone called:', focusedZoneId);
    
    if (focusedZoneId) {
      set({ focusedZoneId });
      
      // Clear focus and return to all zones after 5 seconds
      setTimeout(() => {
        console.log('⏰ Clearing zone focus and returning to all zones after 5 seconds');
        set({ 
          focusedZoneId: null,
          focusedDriverId: null,
          mapFocusCoords: null
        });
      }, 5000);
    } else {
      set({ focusedZoneId });
    }
  },
  focusMapCoords: (mapFocusCoords) => set({ mapFocusCoords }),
  focusAllZones: () => set({ focusedZoneId: null, focusedDriverId: null, mapFocusCoords: null }),
  setHoveredJobId: (hoveredJobId) => set({ hoveredJobId }),
  setHoveredDriverId: (hoveredDriverId) => set({ hoveredDriverId }),
  setHoveredZoneId: (hoveredZoneId) => set({ hoveredZoneId }),
  upsertDriver: (driver) =>
    set((state) => {
      const existingIndex = state.drivers.findIndex((d) => d.id === driver.id);
      if (existingIndex === -1) {
        return { drivers: [...state.drivers, driver] };
      }
      const updated = [...state.drivers];
      updated[existingIndex] = { ...updated[existingIndex], ...driver };
      return { drivers: updated };
    }),
  removeDriver: (driverId) =>
    set((state) => ({
      drivers: state.drivers.filter((driver) => driver.id !== driverId),
    })),
  updateDriverLocation: (driverId, position, locationUpdatedAt) =>
    set((state) => ({
      drivers: state.drivers.map((driver) =>
        driver.id === driverId 
          ? { ...driver, position, ...(locationUpdatedAt ? { locationUpdatedAt } : {}) } 
          : driver
      ),
    })),
  updateJob: (job) =>
    set((state) => {
      const existingIndex = state.jobs.findIndex((j) => j.id === job.id);
      if (existingIndex === -1) {
        return { jobs: [...state.jobs, job] };
      }
      const updated = [...state.jobs];
      updated[existingIndex] = { ...updated[existingIndex], ...job };
      return { jobs: updated };
    }),
  createJob: async (payload: any) => {
    try {
      set({ loading: true, error: null });
      // API call will be handled by JobComposerComplete component
      // This is just a placeholder for store integration
    } catch (error) {
      set({ error: "Failed to create job" });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  assignDriver: async (jobId: string, driverId: string, status?: string) => {
    try {
      set({ loading: true, error: null });
      const { assignDriverToJob } = await import("../services/jobService");
      await assignDriverToJob(jobId, driverId, status);
    } catch (error) {
      set({ error: "Failed to assign driver" });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  cancelJob: async (jobId: string) => {
    try {
      set({ loading: true, error: null });
      const { cancelJob: cancelJobAPI } = await import(
        "../services/jobService"
      );
      await cancelJobAPI(jobId, "Cancelled by dispatcher");

      // Update job status in store
      set((state) => ({
        jobs: state.jobs.map((job) =>
          job.id === jobId ? { ...job, status: "CANCELLED" } : job
        ),
      }));
    } catch (error) {
      set({ error: "Failed to cancel job" });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  updateJobDraft: (draft) =>
    set((state) => {
      const currentDraft = state.jobDraft || {};
      const nextDraft = {
        ...currentDraft,
        ...draft,
      };
      if (draft.routePath !== undefined) {
        nextDraft.routePath = draft.routePath;
      }
      if (draft.pickup !== undefined) {
        nextDraft.pickup = draft.pickup;
      }
      if (draft.dropoff !== undefined) {
        nextDraft.dropoff = draft.dropoff;
      }
      return { jobDraft: nextDraft };
    }),
  clearJobDraft: () => set({ jobDraft: null }),
  unassignJob: async (jobId: string, reason?: string) => {
    try {
      set({ loading: true, error: null });
      const { unassignJob: unassignJobAPI } = await import(
        "../services/jobService"
      );
      await unassignJobAPI(jobId, reason);

      console.log(
        `[Store] unassignJob: Moving job ${jobId} back to UNASSIGNED`
      );

      // Update job in store - set status back to UNASSIGNED and remove driver
      set((state) => ({
        jobs: state.jobs.map((job) =>
          job.id === jobId
            ? {
                ...job,
                driverId: undefined,
                status: "UNASSIGNED",
                rawStatus: "UNASSIGNED",
              }
            : job
        ),
      }));
    } catch (error) {
      set({ error: "Failed to unassign job" });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  editJob: async (jobId: string, payload: any) => {
    set({ loading: true, error: null });
    try {
      const { updateJob } = await import("../services/jobService");
      
      // Transform payload to match UpdateJobPayload interface
      const updatePayload: any = {
        customerId: payload.customerId,
        passengerName: payload.passengerName,
        phone: payload.phone,
        email: payload.email,
        notes: payload.notes,
        instructions: payload.instructions,
        tariffId: payload.tariffId,
        passengers: payload.passengers,
        bags: payload.bags,
        wheelchairs: payload.wheelchairs,
        vehiclesNeeded: payload.vehiclesNeeded,
        paymentMethod: payload.paymentMethod,
        scheduledFor: payload.scheduledFor,
        validationCode: payload.validationCode,
        currency: payload.currency,
        vehicleType: payload.vehicleType,
        recalculateFare: true,
        // Driver assignment
        driverAssignment: payload.driverAssignment,
        driverId: payload.driverId,
      };
      
      // Add pickup if coordinates are provided
      if (payload.pickupLat && payload.pickupLng && payload.pickupAddress) {
        updatePayload.pickup = {
          address: payload.pickupAddress,
          latitude: payload.pickupLat,
          longitude: payload.pickupLng,
        };
      }
      
      // Add dropoff if coordinates are provided
      if (payload.dropoffLat && payload.dropoffLng && payload.dropoffAddress) {
        updatePayload.dropoff = {
          address: payload.dropoffAddress,
          latitude: payload.dropoffLat,
          longitude: payload.dropoffLng,
        };
      }
      
      await updateJob(jobId, updatePayload);
      set({ loading: false });
    } catch (error: any) {
      console.error("Failed to edit job:", error);
      set({ error: "Failed to edit job" });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
}));
