import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "../contexts/ThemeContext";
import SettingsPanel from "../components/settings/SettingsPanel";
import MigrationStatusWidget from "../components/admin/MigrationStatusWidget";
import { JobComposerV2Extras } from "../components/jobs/JobComposerComplete";
import { featureFlagService } from "../services/featureFlagService";

vi.mock("../components/v2/StopManagementPanel", () => ({
  default: () => <div data-testid="stop-panel">StopPanel</div>,
}));

vi.mock("../components/v2/PODViewer", () => ({
  default: ({ stopId }: { stopId?: string }) => (
    <div data-testid="pod-viewer">POD {stopId}</div>
  ),
}));

vi.mock("../services/v2/apiClient", () => ({
  checkV2Availability: vi.fn(() => Promise.resolve(true)),
}));

describe("Phase 6: SettingsPanel", () => {
  it("renders V2FeatureToggle in V2 tab", () => {
    render(
      <ThemeProvider>
        <SettingsPanel isOpen={true} onClose={() => {}} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText(/V2 Features/i));
    expect(screen.getByText(/V2 Feature Flags/i)).toBeInTheDocument();
  });
});

describe("Phase 6: MigrationStatusWidget", () => {
  beforeEach(() => {
    featureFlagService.disableAll();
  });

  it("shows progress based on enabled flags", async () => {
    featureFlagService.set("v2Jobs", true);
    featureFlagService.set("v2Stops", true);
    render(<MigrationStatusWidget />);
    expect(await screen.findByText(/2\/5 features enabled/)).toBeInTheDocument();
  });
});

describe("Phase 6: JobComposerV2Extras", () => {
  beforeEach(() => {
    featureFlagService.disableAll();
  });

  it("renders stop panel when v2Stops enabled", () => {
    featureFlagService.enableAll();
    render(<JobComposerV2Extras jobId="job-1" stopId="stop-1" />);
    expect(screen.getByTestId("stop-panel")).toBeInTheDocument();
  });

  it("shows fallback when flags disabled", () => {
    render(<JobComposerV2Extras jobId="job-1" />);
    expect(screen.getByText(/stop management is disabled/i)).toBeInTheDocument();
  });

  it("renders POD viewer when enabled and stopId provided", () => {
    featureFlagService.enableAll();
    render(<JobComposerV2Extras jobId="job-2" stopId="stop-123" />);
    expect(screen.getByTestId("pod-viewer")).toHaveTextContent("stop-123");
  });

  it("shows POD note when enabled but no stop selected", () => {
    featureFlagService.enableAll();
    render(<JobComposerV2Extras jobId="job-3" />);
    expect(screen.getByText(/POD viewer requires/i)).toBeInTheDocument();
  });
});
