import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual<any>("react");
  return {
    ...actual,
    useState: (init: any) => [init, vi.fn()],
    useEffect: vi.fn(),
    useCallback: (cb: any) => cb,
    useRef: (val: any) => ({ current: val }),
  };
});

vi.mock("../services/v2/apiClient", () => ({
  checkV2Availability: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../services/v2/jobService", () => ({
  getJobs: vi.fn(() => Promise.resolve({ data: { jobs: [], total: 0 }, version: "v2" })),
  getJobById: vi.fn(() => Promise.resolve({ data: {}, version: "v2" })),
  createJob: vi.fn(() => Promise.resolve({ data: {}, version: "v2" })),
  updateJobStatus: vi.fn(() => Promise.resolve({ data: {}, version: "v2" })),
  assignDriver: vi.fn(() => Promise.resolve({ data: {}, version: "v2" })),
  cancelJob: vi.fn(() => Promise.resolve({ data: {}, version: "v2" })),
}));

vi.mock("../services/v2/stopService", () => ({
  getStopsByJobId: vi.fn(() => Promise.resolve({ stops: [], progress: null })),
  getNextStop: vi.fn(() => Promise.resolve(null)),
  updateStopStatus: vi.fn(() => Promise.resolve({})),
  arriveAtStop: vi.fn(() => Promise.resolve({})),
  completeStop: vi.fn(() => Promise.resolve({})),
  failStop: vi.fn(() => Promise.resolve({})),
  skipStop: vi.fn(() => Promise.resolve({})),
}));

vi.mock("../services/v2/podService", () => ({
  getProofsByStop: vi.fn(() => Promise.resolve([])),
  getProofRequirements: vi.fn(() => Promise.resolve({ required: false })),
  captureSignature: vi.fn(() => Promise.resolve({})),
  capturePhoto: vi.fn(() => Promise.resolve({})),
  verifyPin: vi.fn(() => Promise.resolve({})),
}));

describe("useV2Jobs hook exports", () => {
  let useV2Jobs: any;
  let useV2Job: any;

  beforeAll(async () => {
    const mod = await import("../hooks/useV2Jobs");
    useV2Jobs = mod.useV2Jobs;
    useV2Job = mod.useV2Job;
  });

  it("should export useV2Jobs", () => {
    expect(typeof useV2Jobs).toBe("function");
  });

  it("should export useV2Job", () => {
    expect(typeof useV2Job).toBe("function");
  });
});

describe("useV2Stops hook exports", () => {
  let useV2Stops: any;
  let useV2Pod: any;

  beforeAll(async () => {
    const mod = await import("../hooks/useV2Stops");
    useV2Stops = mod.useV2Stops;
    useV2Pod = mod.useV2Pod;
  });

  it("should export useV2Stops", () => {
    expect(typeof useV2Stops).toBe("function");
  });

  it("should export useV2Pod", () => {
    expect(typeof useV2Pod).toBe("function");
  });
});
