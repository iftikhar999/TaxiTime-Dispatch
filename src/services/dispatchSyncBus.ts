// Shared channel between useDispatchController (which owns the fetchers)
// and useStateReconciliation (which detects driver/job drift). Lets the
// reconciliation hook silently re-pull authoritative state from the server
// instead of asking the user to click a "refresh" button — the driver status
// and job state should feel 100% real-time.

type RefetchFn = () => Promise<void>;

let registered: RefetchFn | null = null;
let inFlight: Promise<void> | null = null;
let lastRunAt = 0;

// Minimum gap between silent re-pulls so a persistent mismatch (e.g. a stuck
// driver record on the server) doesn't hammer the API every 30s.
const MIN_INTERVAL_MS = 15_000;

export const registerDispatchRefetch = (fn: RefetchFn): (() => void) => {
  registered = fn;
  return () => {
    if (registered === fn) registered = null;
  };
};

export const triggerDispatchAutoHeal = async (reason: string): Promise<boolean> => {
  if (!registered) return false;
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) return false;
  if (inFlight) return false;
  lastRunAt = now;
  console.log(`[DispatchAutoHeal] Silently re-syncing: ${reason}`);
  inFlight = registered()
    .catch((err) => {
      console.warn("[DispatchAutoHeal] Silent re-sync failed", err);
    })
    .finally(() => {
      inFlight = null;
    });
  await inFlight;
  return true;
};
