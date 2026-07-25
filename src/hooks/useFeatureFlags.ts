import { useEffect, useState, useCallback } from "react";
import {
  featureFlagService,
  FeatureFlags,
} from "../services/featureFlagService";

export const useFeatureFlags = () => {
  const [flags, setFlags] = useState<FeatureFlags>(featureFlagService.get());

  useEffect(() => {
    const unsubscribe = featureFlagService.subscribe((next) => setFlags(next));
    return () => unsubscribe();
  }, []);

  const setFlag = useCallback(<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]) => {
    featureFlagService.set(key, value);
  }, []);

  const enableAllV2 = useCallback(() => featureFlagService.enableAll(), []);
  const disableAllV2 = useCallback(() => featureFlagService.disableAll(), []);

  const isV2Enabled = useCallback(
    () =>
      flags.v2Jobs &&
      flags.v2Stops &&
      flags.v2POD &&
      flags.v2RouteOptimization &&
      flags.v2Socket,
    [flags]
  );

  return {
    flags,
    setFlag,
    enableAllV2,
    disableAllV2,
    isV2Enabled,
  };
};

export default useFeatureFlags;
