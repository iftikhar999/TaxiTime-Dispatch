import { create } from "zustand";
import type { Emergency, EmergencyStatus } from "../services/emergencyService";

interface EmergencyState {
  emergencies: Emergency[];
  loading: boolean;
  error: string | null;
  setEmergencies: (list: Emergency[]) => void;
  upsertEmergency: (e: Emergency) => void;
  updateEmergencyStatus: (id: string, patch: Partial<Emergency>) => void;
  setLoading: (l: boolean) => void;
  setError: (msg: string | null) => void;
  activeCount: () => number;
  byStatus: (status: EmergencyStatus | "ALL") => Emergency[];
}

export const useEmergencyStore = create<EmergencyState>((set, get) => ({
  emergencies: [],
  loading: false,
  error: null,
  setEmergencies: (list) => set({ emergencies: list }),
  upsertEmergency: (e) =>
    set((state) => {
      const idx = state.emergencies.findIndex((x) => x.id === e.id);
      if (idx === -1) return { emergencies: [e, ...state.emergencies] };
      const next = [...state.emergencies];
      next[idx] = { ...next[idx], ...e };
      return { emergencies: next };
    }),
  updateEmergencyStatus: (id, patch) =>
    set((state) => ({
      emergencies: state.emergencies.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  activeCount: () => get().emergencies.filter((e) => e.status === "ACTIVE").length,
  byStatus: (status) => {
    if (status === "ALL") return get().emergencies;
    return get().emergencies.filter((e) => e.status === status);
  },
}));
