import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { featureFlagService } from "../services/featureFlagService";
import { useFeatureFlags } from "../hooks/useFeatureFlags";

const STORAGE_KEY = "taxitime_dispatch_feature_flags_v2";

describe("Phase 5: feature flag service", () => {
  beforeEach(() => {
    localStorage.clear();
    featureFlagService.disableAll();
  });

  it("persists flags to localStorage", () => {
    featureFlagService.set("v2Jobs", true);
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored || "{}");
    expect(parsed.v2Jobs).toBe(true);
  });

  it("loads stored flags on new instance", () => {
    featureFlagService.set("v2Stops", true);
    const fresh = new (featureFlagService.constructor as any)();
    expect(fresh.get().v2Stops).toBe(true);
  });

  it("enables all flags", () => {
    featureFlagService.enableAll();
    const flags = featureFlagService.get();
    expect(Object.values(flags).every(Boolean)).toBe(true);
  });

  it("disables all flags", () => {
    featureFlagService.enableAll();
    featureFlagService.disableAll();
    const flags = featureFlagService.get();
    expect(Object.values(flags).every((v) => v === false)).toBe(true);
  });

  it("notifies subscribers on change", () => {
    let notified: any = null;
    const unsub = featureFlagService.subscribe((f) => {
      notified = f;
    });
    featureFlagService.set("v2POD", true);
    expect(notified?.v2POD).toBe(true);
    unsub();
  });
});

describe("Phase 5: useFeatureFlags hook", () => {
  beforeEach(() => {
    localStorage.clear();
    featureFlagService.disableAll();
  });

  it("returns current flags", () => {
    featureFlagService.set("v2Jobs", true);
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.flags.v2Jobs).toBe(true);
  });

  it("updates when service changes", () => {
    const { result } = renderHook(() => useFeatureFlags());
    act(() => featureFlagService.set("v2Stops", true));
    expect(result.current.flags.v2Stops).toBe(true);
  });

  it("enableAllV2 sets all flags", () => {
    const { result } = renderHook(() => useFeatureFlags());
    act(() => result.current.enableAllV2());
    expect(Object.values(result.current.flags).every(Boolean)).toBe(true);
  });

  it("disableAllV2 clears all flags", () => {
    const { result } = renderHook(() => useFeatureFlags());
    act(() => result.current.enableAllV2());
    act(() => result.current.disableAllV2());
    expect(Object.values(result.current.flags).every((v) => v === false)).toBe(
      true
    );
  });

  it("isV2Enabled returns true only when all flags on", () => {
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.isV2Enabled()).toBe(false);
    act(() => result.current.enableAllV2());
    expect(result.current.isV2Enabled()).toBe(true);
  });

  it("setFlag updates a single flag", () => {
    const { result } = renderHook(() => useFeatureFlags());
    act(() => result.current.setFlag("v2RouteOptimization", true));
    expect(result.current.flags.v2RouteOptimization).toBe(true);
  });
});
