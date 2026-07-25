import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import JobBoard from "../components/jobs/JobBoard";
import { ThemeProvider } from "../contexts/ThemeContext";
import { useDispatchStore } from "../store/useDispatchStore";

const mockFetchJobs = vi.fn();
const mockFetchJobCounters = vi.fn();

vi.mock("../hooks/useDispatchController", () => ({
  useDispatchController: () => ({
    fetchJobs: mockFetchJobs,
    fetchJobCounters: mockFetchJobCounters,
  }),
}));

describe("JobBoard V2 integration", () => {
  beforeEach(() => {
    mockFetchJobs.mockReset();
    mockFetchJobCounters.mockReset();
    useDispatchStore.setState((state) => ({
      ...state,
      jobs: [
        {
          id: "job1",
          reference: "REF1",
          status: "UNASSIGNED",
          requestedAt: new Date().toISOString(),
          pickupAddress: "A",
          dropoffAddress: "B",
          serviceType: "TAXI",
        } as any,
      ],
      selectedServiceType: "TAXI",
      setSelectedServiceType: vi.fn(),
    }));
  });

  afterEach(() => {
    useDispatchStore.setState((state) => ({
      ...state,
      selectedServiceType: "TAXI",
    }));
  });

  it("renders service type selector", () => {
    render(
      <ThemeProvider>
        <JobBoard />
      </ThemeProvider>
    );
    expect(screen.getAllByRole("button", { name: /Taxi/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Delivery/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Courier/i }).length).toBeGreaterThan(0);
  });

  it("changes service type and triggers fetch", () => {
    const setSelectedServiceType = vi.fn();
    useDispatchStore.setState((state) => ({ ...state, setSelectedServiceType }));

    render(
      <ThemeProvider>
        <JobBoard />
      </ThemeProvider>
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Delivery/i })[0]);
    expect(setSelectedServiceType).toHaveBeenCalledWith("DELIVERY");
    expect(mockFetchJobs).toHaveBeenCalled();
  });
});
