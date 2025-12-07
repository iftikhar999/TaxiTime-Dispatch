import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatchSocket } from "../providers/SocketProvider";
import type { DispatchVideoSession } from "../store/useDispatchStore";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

type VideoStreamState = {
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState | "idle";
  error: string | null;
  leaveStream: (reason?: string) => void;
  restart: () => void;
};

export function useJobVideoStream(
  session?: DispatchVideoSession | null
): VideoStreamState {
  const { socket } = useDispatchSocket();
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const inboundStreamRef = useRef<MediaStream | null>(null);
  const lastSessionRef = useRef<DispatchVideoSession | null>(null);
  const offerKeyRef = useRef<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<
    RTCPeerConnectionState | "idle"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);

  useEffect(() => {
    lastSessionRef.current = session ?? null;
  }, [session]);

  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.close();
      } catch (closeError) {
        console.warn("[video] Failed to close peer connection", closeError);
      }
    }
    peerConnectionRef.current = null;
    inboundStreamRef.current = null;
    setStream(null);
    setConnectionState("idle");
  }, []);

  const emitLeave = useCallback(
    (reason = "viewer_left") => {
      const current = lastSessionRef.current;
      if (!socket || !current?.jobId) {
        return;
      }
      socket.emit("dispatch:video:leave", {
        jobId: current.jobId,
        driverId: current.driverId,
        reason,
      });
    },
    [socket]
  );

  const leaveStream = useCallback(
    (reason = "viewer_left") => {
      emitLeave(reason);
      offerKeyRef.current = null;
      cleanup();
      setError(null);
    },
    [cleanup, emitLeave]
  );

  const restart = useCallback(() => {
    offerKeyRef.current = null;
    cleanup();
    setError(null);
    setRestartToken((token) => token + 1);
  }, [cleanup]);

  useEffect(() => {
    if (!socket || !session?.jobId) {
      return;
    }

    const handleDriverCandidate = (payload: any = {}) => {
      if (payload?.jobId !== session.jobId || !peerConnectionRef.current) {
        return;
      }
      if (!payload.candidate) {
        return;
      }
      peerConnectionRef.current
        .addIceCandidate(new RTCIceCandidate(payload.candidate))
        .catch((candidateError) =>
          console.error("[video] Failed to add driver ICE", candidateError)
        );
    };

    const handleVideoStopped = (payload: any = {}) => {
      if (payload?.jobId !== session.jobId) {
        return;
      }
      cleanup();
      setError("Driver ended the video stream");
    };

    socket.on("job:video:driver-candidate", handleDriverCandidate);
    socket.on("job:video:stopped", handleVideoStopped);

    return () => {
      socket.off("job:video:driver-candidate", handleDriverCandidate);
      socket.off("job:video:stopped", handleVideoStopped);
    };
  }, [socket, session?.jobId, cleanup]);

  useEffect(() => {
    if (!session) {
      cleanup();
      offerKeyRef.current = null;
    }
  }, [session, cleanup]);

  useEffect(() => {
    if (!socket || !session?.jobId || !session.offer) {
      return;
    }

    const signature = `${session.jobId}:${session.startedAt ?? ""}:${
      session.offer?.sdp ?? ""
    }:${restartToken}`;

    if (offerKeyRef.current === signature) {
      return;
    }

    offerKeyRef.current = signature;

    const startViewer = async () => {
      setError(null);
      setConnectionState("connecting");
      cleanup();

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setStream(event.streams[0]);
          return;
        }
        if (!inboundStreamRef.current) {
          inboundStreamRef.current = new MediaStream();
        }
        if (event.track) {
          inboundStreamRef.current.addTrack(event.track);
          setStream(inboundStreamRef.current);
        }
      };

      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
        if (pc.connectionState === "failed") {
          setError("Video connection failed");
        }
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate || !socket) {
          return;
        }
        socket.emit("dispatch:video:ice", {
          jobId: session.jobId,
          driverId: session.driverId,
          candidate: event.candidate.toJSON
            ? event.candidate.toJSON()
            : event.candidate,
        });
      };

      await pc.setRemoteDescription(
        new RTCSessionDescription(session.offer as RTCSessionDescriptionInit)
      );
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("dispatch:video:answer", {
        jobId: session.jobId,
        driverId: session.driverId,
        companyId: session.companyId,
        answer: {
          type: answer.type,
          sdp: answer.sdp,
        },
      });
    };

    startViewer().catch((startError) => {
      console.error("[video] Failed to start viewer", startError);
      setError(startError?.message || "Unable to start video stream");
      cleanup();
    });
  }, [
    socket,
    session?.jobId,
    session?.driverId,
    session?.offer,
    session?.startedAt,
    session?.companyId,
    restartToken,
    cleanup,
  ]);

  useEffect(() => {
    return () => {
      emitLeave("component_unmount");
      cleanup();
      offerKeyRef.current = null;
    };
  }, [emitLeave, cleanup]);

  return {
    stream,
    connectionState,
    error,
    leaveStream,
    restart,
  };
}
