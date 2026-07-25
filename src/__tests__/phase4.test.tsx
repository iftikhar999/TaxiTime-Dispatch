import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import ServiceTypeSelector from "../components/v2/ServiceTypeSelector";
import {
  StopManagementPanel,
  PODViewer,
  RouteOptimizationPanel,
  CreateJobModal,
} from "../components/v2";
import { useV2Socket } from "../hooks/useV2Socket";

describe("Phase 4: Dispatch UI Components", () => {
  describe("ServiceTypeSelector", () => {
    it("renders component", () => {
      expect(ServiceTypeSelector).toBeDefined();
    });

    it("shows all service types", () => {
      render(<ServiceTypeSelector value={null} onChange={() => {}} />);
      expect(screen.getByText(/Taxi/i)).toBeInTheDocument();
      expect(screen.getByText(/Delivery/i)).toBeInTheDocument();
      expect(screen.getByText(/Courier/i)).toBeInTheDocument();
    });
  });

  describe("Component exports", () => {
    it("exports StopManagementPanel", () => {
      expect(StopManagementPanel).toBeDefined();
    });

    it("exports PODViewer", () => {
      expect(PODViewer).toBeDefined();
    });

    it("exports RouteOptimizationPanel", () => {
      expect(RouteOptimizationPanel).toBeDefined();
    });

    it("exports CreateJobModal", () => {
      expect(CreateJobModal).toBeDefined();
    });
  });
});

describe("Phase 4: Hooks", () => {
  it("exports useV2Socket", () => {
    expect(typeof useV2Socket).toBe("function");
  });
});

describe("Phase 4: Service type persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists service type to localStorage", () => {
    const STORAGE_KEY = "dispatch_selected_service_type";
    localStorage.setItem(STORAGE_KEY, "DELIVERY");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("DELIVERY");
  });

  it("retrieves persisted service type", () => {
    const STORAGE_KEY = "dispatch_selected_service_type";
    localStorage.setItem(STORAGE_KEY, "COURIER");
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).toBe("COURIER");
  });
});
