import { useState, useEffect, useCallback } from "react";
import * as stopService from "../services/v2/stopService";
import * as podService from "../services/v2/podService";
import { checkV2Availability } from "../services/v2/apiClient";

export const useV2Stops = (jobId: string | null, options: any = {}) => {
  const { enabled = true, autoRefresh = false, refreshInterval = 10000 } = options;

  const [stops, setStops] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [currentStop, setCurrentStop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [v2Available, setV2Available] = useState(false);

  const fetchStops = useCallback(async () => {
    if (!enabled || !jobId) return;
    try {
      setLoading(true);
      setError(null);
      const isV2 = await checkV2Availability();
      setV2Available(isV2);
      if (!isV2) {
        setError(new Error("V2 API required for stop management"));
        return;
      }
      const data = await stopService.getStopsByJobId(jobId);
      setStops((data as any).stops || []);
      setProgress((data as any).progress || null);
      try {
        const next = await stopService.getNextStop(jobId);
        setCurrentStop(next);
      } catch {
        setCurrentStop(null);
      }
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [jobId, enabled]);

  useEffect(() => {
    fetchStops();
  }, [fetchStops]);

  useEffect(() => {
    if (autoRefresh && enabled && jobId) {
      const interval = setInterval(fetchStops, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, fetchStops, enabled, jobId]);

  const updateStatus = useCallback(
    async (stopId: string, status: string, metadata?: Record<string, any>) => {
      const result = await stopService.updateStopStatus(jobId as string, stopId, status, metadata);
      await fetchStops();
      return result;
    },
    [jobId, fetchStops]
  );

  const arrive = useCallback(
    async (stopId: string) => {
      const result = await stopService.arriveAtStop(jobId as string, stopId);
      await fetchStops();
      return result;
    },
    [jobId, fetchStops]
  );

  const complete = useCallback(
    async (stopId: string) => {
      const result = await stopService.completeStop(jobId as string, stopId);
      await fetchStops();
      return result;
    },
    [jobId, fetchStops]
  );

  const fail = useCallback(
    async (stopId: string, reason?: string) => {
      const result = await stopService.failStop(jobId as string, stopId, reason);
      await fetchStops();
      return result;
    },
    [jobId, fetchStops]
  );

  const skip = useCallback(
    async (stopId: string, reason?: string) => {
      const result = await stopService.skipStop(jobId as string, stopId, reason);
      await fetchStops();
      return result;
    },
    [jobId, fetchStops]
  );

  return {
    stops,
    progress,
    currentStop,
    loading,
    error,
    v2Available,
    refetch: fetchStops,
    updateStatus,
    arrive,
    complete,
    fail,
    skip,
  };
};

export const useV2Pod = (jobId: string | null, stopId: string | null, options: any = {}) => {
  const { enabled = true } = options;
  const [proofs, setProofs] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const fetchPod = useCallback(async () => {
    if (!enabled || !jobId || !stopId) return;
    try {
      setLoading(true);
      setError(null);
      const [proofsData, reqData] = await Promise.all([
        podService.getProofsByStop(jobId, stopId),
        podService.getProofRequirements(jobId, stopId),
      ]);
      setProofs(proofsData || []);
      setRequirements(reqData);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [jobId, stopId, enabled]);

  useEffect(() => {
    fetchPod();
  }, [fetchPod]);

  const captureSignature = useCallback(
    async (signatureData: string, recipientName?: string) => {
      const result = await podService.captureSignature(jobId as string, stopId as string, signatureData, recipientName);
      await fetchPod();
      return result;
    },
    [jobId, stopId, fetchPod]
  );

  const capturePhoto = useCallback(
    async (photoUrl: string, notes?: string) => {
      const result = await podService.capturePhoto(jobId as string, stopId as string, photoUrl, notes);
      await fetchPod();
      return result;
    },
    [jobId, stopId, fetchPod]
  );

  const verifyPin = useCallback(
    async (pincode: string) => {
      const result = await podService.verifyPin(jobId as string, stopId as string, pincode);
      await fetchPod();
      return result;
    },
    [jobId, stopId, fetchPod]
  );

  const isPodComplete = useCallback(() => {
    if (!requirements?.required) return true;
    if (!proofs.length) return false;
    switch (requirements.type) {
      case "SIGNATURE":
        return proofs.some((p) => p.type === "SIGNATURE" && p.verified);
      case "PHOTO":
        return proofs.some((p) => p.type === "PHOTO" && p.verified);
      case "PIN":
        return proofs.some((p) => p.type === "PIN" && p.verified);
      case "BOTH":
        return (
          proofs.some((p) => p.type === "SIGNATURE" && p.verified) &&
          proofs.some((p) => p.type === "PHOTO" && p.verified)
        );
      default:
        return proofs.some((p) => p.verified);
    }
  }, [requirements, proofs]);

  return {
    proofs,
    requirements,
    loading,
    error,
    refetch: fetchPod,
    captureSignature,
    capturePhoto,
    verifyPin,
    isPodComplete: isPodComplete(),
  };
};

export default useV2Stops;
