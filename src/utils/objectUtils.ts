export type MergeMetadata = {
  lastUpdateAt?: string;
  lastUpdateSource?: string;
};

export function mergeDefined<T extends Record<string, any>>(
  previous: T | undefined,
  patch: Partial<T>,
  meta?: MergeMetadata
): T {
  const base: Record<string, any> = previous ? { ...previous } : {};

  Object.entries(patch).forEach(([key, value]) => {
    if (value !== undefined) {
      base[key] = value;
    }
  });

  if (meta?.lastUpdateAt) {
    base.lastUpdateAt = meta.lastUpdateAt;
  }
  if (meta?.lastUpdateSource) {
    base.lastUpdateSource = meta.lastUpdateSource;
  }

  return base as T;
}

export const nowIso = () => new Date().toISOString();
