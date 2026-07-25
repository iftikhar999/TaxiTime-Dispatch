import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { checkV2Availability, refreshV2Availability } from "../services/v2/apiClient";

type ContextValue = {
  v2Available: boolean;
  actualV2Available: boolean;
  loading: boolean;
  error: any;
  refresh: () => Promise<void>;
  forceV1: boolean;
  setForceV1: (val: boolean) => void;
};

const V2ApiContext = createContext<ContextValue | undefined>(undefined);

export const V2ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [v2Available, setV2Available] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [forceV1, setForceV1] = useState(false);

  const checkAvailability = useCallback(async () => {
    try {
      setLoading(true);
      const available = await checkV2Availability();
      setV2Available(available);
      setError(null);
    } catch (err: any) {
      setError(err);
      setV2Available(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAvailability();
    const interval = setInterval(checkAvailability, 60000);
    return () => clearInterval(interval);
  }, [checkAvailability]);

  const refresh = useCallback(async () => {
    await refreshV2Availability();
    await checkAvailability();
  }, [checkAvailability]);

  const value: ContextValue = {
    v2Available: forceV1 ? false : v2Available,
    actualV2Available: v2Available,
    loading,
    error,
    refresh,
    forceV1,
    setForceV1,
  };

  return <V2ApiContext.Provider value={value}>{children}</V2ApiContext.Provider>;
};

export const useV2Api = () => {
  const context = useContext(V2ApiContext);
  if (!context) throw new Error("useV2Api must be used within a V2ApiProvider");
  return context;
};

export default V2ApiContext;
