export type FeatureFlags = {
  v2Jobs: boolean;
  v2Stops: boolean;
  v2POD: boolean;
  v2RouteOptimization: boolean;
  v2Socket: boolean;
};

const STORAGE_KEY = "taxitime_dispatch_feature_flags_v2";

const DEFAULT_FLAGS: FeatureFlags = {
  v2Jobs: false,
  v2Stops: false,
  v2POD: false,
  v2RouteOptimization: false,
  v2Socket: false,
};

const parseEnvFlag = (key: string): boolean | undefined => {
  const value =
    (import.meta as any)?.env?.[`VITE_FEATURE_V2_${key.toUpperCase()}`];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return undefined;
};

class FeatureFlagService {
  private flags: FeatureFlags;
  private subscribers: Set<(flags: FeatureFlags) => void> = new Set();

  constructor() {
    this.flags = this.loadFlags();
  }

  private loadFlags(): FeatureFlags {
    let stored: FeatureFlags | null = null;
    try {
      const raw =
        typeof localStorage !== "undefined"
          ? localStorage.getItem(STORAGE_KEY)
          : null;
      if (raw) {
        stored = JSON.parse(raw);
      }
    } catch (err) {
      console.warn("[featureFlagService] failed to parse stored flags", err);
    }

    const merged: FeatureFlags = {
      ...DEFAULT_FLAGS,
      ...stored,
    };

    // Apply environment overrides when present
    (Object.keys(merged) as (keyof FeatureFlags)[]).forEach((key) => {
      const envVal = parseEnvFlag(key);
      if (envVal !== undefined) {
        merged[key] = envVal;
      }
    });

    return merged;
  }

  private persist() {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.flags));
      }
    } catch (err) {
      console.warn("[featureFlagService] failed to persist flags", err);
    }
  }

  private notify() {
    for (const fn of this.subscribers) {
      fn({ ...this.flags });
    }
  }

  get(): FeatureFlags {
    return { ...this.flags };
  }

  set<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]) {
    this.flags = { ...this.flags, [key]: value };
    this.persist();
    this.notify();
  }

  enableAll() {
    this.flags = {
      v2Jobs: true,
      v2Stops: true,
      v2POD: true,
      v2RouteOptimization: true,
      v2Socket: true,
    };
    this.persist();
    this.notify();
  }

  disableAll() {
    this.flags = {
      v2Jobs: false,
      v2Stops: false,
      v2POD: false,
      v2RouteOptimization: false,
      v2Socket: false,
    };
    this.persist();
    this.notify();
  }

  subscribe(fn: (flags: FeatureFlags) => void) {
    this.subscribers.add(fn);
    // Immediately emit current state
    fn({ ...this.flags });
    return () => this.subscribers.delete(fn);
  }
}

export const featureFlagService = new FeatureFlagService();

export default featureFlagService;
