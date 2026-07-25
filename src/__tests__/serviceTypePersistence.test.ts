import { describe, it, expect, beforeEach, vi } from "vitest";
import { useDispatchStore } from "../store/useDispatchStore";

const mockLocalStorage = () => {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => Object.keys(store).forEach((k) => delete store[k]),
  });
  return store;
};

describe("Dispatch service type persistence", () => {
  beforeEach(() => {
    mockLocalStorage();
    useDispatchStore.setState({ selectedServiceType: "TAXI" });
  });

  it("persists selected service type to localStorage", () => {
    const setSelectedServiceType = useDispatchStore.getState().setSelectedServiceType;
    setSelectedServiceType("DELIVERY");
    expect(useDispatchStore.getState().selectedServiceType).toBe("DELIVERY");
    expect(localStorage.getItem("dispatch_service_type")).toBe("DELIVERY");
  });

  it("clears service type when set to null", () => {
    const setSelectedServiceType = useDispatchStore.getState().setSelectedServiceType;
    setSelectedServiceType(null);
    expect(useDispatchStore.getState().selectedServiceType).toBeNull();
    expect(localStorage.getItem("dispatch_service_type")).toBeNull();
  });
});
