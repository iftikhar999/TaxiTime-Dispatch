import classNames from "classnames";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { useJobVideoStream } from "../../hooks/useJobVideoStream";
import type { DispatchJob, DispatchVideoSession } from "../../store/useDispatchStore";

interface DriverVideoPanelProps {
  job: DispatchJob;
  session: DispatchVideoSession;
}

const STATUS_LABELS: Record<string, string> = {
  connected: "Live",
  connecting: "Connecting",
  disconnected: "Disconnected",
  failed: "Failed",
  idle: "Idle",
};

const DriverVideoPanel: React.FC<DriverVideoPanelProps> = ({ job, session }) => {
  const { isDark } = useTheme();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { stream, connectionState, error, leaveStream, restart } =
    useJobVideoStream(session);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (stream) {
      videoElement.srcObject = stream;
      setIsVideoReady(false);
      
      const handleCanPlay = () => {
        setIsVideoReady(true);
      };
      
      const handleLoadedData = () => {
        setIsVideoReady(true);
        videoElement.play().catch(() => {
          // Ignore autoplay errors
        });
      };

      videoElement.addEventListener('canplay', handleCanPlay);
      videoElement.addEventListener('loadeddata', handleLoadedData);
      
      // Try to play immediately
      videoElement.play().catch(() => {
        // Ignore autoplay errors, dispatcher can manually start playback
      });

      return () => {
        videoElement.removeEventListener('canplay', handleCanPlay);
        videoElement.removeEventListener('loadeddata', handleLoadedData);
      };
    } else {
      videoElement.srcObject = null;
      setIsVideoReady(false);
    }
  }, [stream]);

  const getStatusBadgeClass = () => {
    const isLive = connectionState === "connected";
    if (isLive) {
      return isDark ? "bg-emerald-900/50 text-emerald-300" : "bg-emerald-100 text-emerald-800";
    }
    return isDark ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-600";
  };

  const statusBadge = useMemo(() => {
    if (!session) {
      return null;
    }
    const label = STATUS_LABELS[connectionState] || connectionState;
    return (
      <span
        className={classNames(
          "rounded px-2 py-0.5 text-xs font-semibold",
          getStatusBadgeClass()
        )}
      >
        {label}
      </span>
    );
  }, [connectionState, session, isDark]);

  const renderLoadingState = () => {
    if (connectionState === "connecting") {
      return (
        <>
          <div className="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500" />
          <span>Connecting to driver...</span>
        </>
      );
    }
    if (connectionState === "connected" && !isVideoReady) {
      return (
        <>
          <div className="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-500" />
          <span>Loading video...</span>
        </>
      );
    }
    return <span>Waiting for video stream…</span>;
  };

  return (
    <section className={classNames(
      "rounded-lg border p-4 shadow-sm",
      isDark 
        ? "border-slate-700 bg-slate-800" 
        : "border-slate-200 bg-white"
    )}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={classNames(
            "text-sm font-semibold",
            isDark ? "text-slate-200" : "text-slate-800"
          )}>Live Driver Video</p>
          <p className={classNames(
            "text-xs",
            isDark ? "text-slate-400" : "text-slate-500"
          )}>
            {job.driverId ? `Driver ID ${job.driverId}` : "Unassigned driver"} · Viewers:{" "}
            {session.viewerCount ?? 0}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge}
          <button
            type="button"
            className={classNames(
              "rounded border px-3 py-1 text-xs font-medium transition",
              isDark 
                ? "border-slate-600 text-slate-300 hover:bg-slate-700" 
                : "border-slate-200 text-slate-600 hover:bg-slate-100"
            )}
            onClick={() => restart()}
          >
            Reconnect
          </button>
          <button
            type="button"
            className={classNames(
              "rounded border px-3 py-1 text-xs font-medium transition",
              isDark 
                ? "border-rose-800 text-rose-400 hover:bg-rose-900/50" 
                : "border-rose-200 text-rose-600 hover:bg-rose-50"
            )}
            onClick={() => leaveStream("manual_stop")}
          >
            Stop
          </button>
        </div>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
        {/* Always render video element but hide if no stream or not ready */}
        <video
          ref={videoRef}
          className={classNames(
            "h-full w-full object-cover transition-opacity duration-300",
            stream && isVideoReady ? "opacity-100" : "opacity-0"
          )}
          autoPlay
          playsInline
          muted
        />
        {/* Show loading/waiting state overlay */}
        {(!stream || !isVideoReady) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-slate-400">
            {renderLoadingState()}
          </div>
        )}
        {connectionState === "connected" && isVideoReady && (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold uppercase text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            Live
          </span>
        )}
      </div>
      {error && (
        <p className={classNames(
          "mt-2 text-xs",
          isDark ? "text-rose-400" : "text-rose-600"
        )}>
          {error}
        </p>
      )}
    </section>
  );
};

export default DriverVideoPanel;
