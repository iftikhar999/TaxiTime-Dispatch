/**
 * DriverMessageInbox
 *
 * Floating chat widget for dispatchers — a single entry point from any
 * dispatch view to see driver messages, open a conversation, and reply
 * live. Mounted once in App.tsx as a sibling of ResizableDispatchLayout
 * so it's reachable without disturbing the grid layout.
 *
 * Data flow:
 *   - On open: GET /api/messages/conversations (returns latest message +
 *     unread count per partner). Filter to partners whose role is DRIVER
 *     so we don't mix passenger conversations into the driver inbox.
 *   - Live: listens to `message:new` on the /dispatch socket namespace
 *     (connected by SocketProvider). Any incoming driver message updates
 *     the conversation list; if that driver's thread is currently open,
 *     the message is appended in real-time and marked read.
 *   - Reply: POST /api/messages with `receiverId = driverId`. Server
 *     fans out to the driver's socket room (`driver_${id}`).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Headset, MessageSquare, Send, X } from "lucide-react";
import api from "../../services/api";
import { useDispatchSocket } from "../../providers/SocketProvider";
import { useAuthStore } from "../../store/useAuthStore";

type Conversation = {
  partnerId: string;
  partner: { id: string; firstName?: string; lastName?: string; role?: string; avatar?: string | null } | null;
  lastMessage: { id: string; content: string; type?: string; createdAt: string; senderId: string };
  unreadCount: number;
};

type ChatAttachment = {
  // `file` covers PDFs, Word docs, etc. Image + audio get specialised
  // rendering; files get a generic download link.
  kind: 'image' | 'audio' | 'file';
  mime: string;
  base64: string;
  durationMs?: number;
  fileName?: string;
};

// Read a browser File / Blob as pure base64 (no "data:...," prefix).
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const r = String(reader.result || '');
      const idx = r.indexOf(',');
      resolve(idx >= 0 ? r.slice(idx + 1) : r);
    };
    reader.readAsDataURL(blob);
  });

type ChatMessage = {
  id: string;
  senderId: string;
  receiverId: string | null;
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[] | null;
};

const fullName = (p: Conversation["partner"]) => {
  if (!p) return "Driver";
  const name = `${p.firstName || ""} ${p.lastName || ""}`.trim();
  return name || "Driver";
};

const shortTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const DriverMessageInbox: React.FC = () => {
  const me = useAuthStore((s) => s.user);
  const { socket } = useDispatchSocket();

  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Lightbox for chat image attachments — click an image to enlarge, click
  // the backdrop or press Escape to close.
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // Dispatcher-side voice recording (MediaRecorder).
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // File picker that accepts image OR any document (pdf, docx, etc). Images
  // get flagged as kind='image' so the driver sees a thumbnail; everything
  // else is kind='file'.
  const docInputRef = useRef<HTMLInputElement>(null);
  const [bouncing, setBouncing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const openRef = useRef(false);
  // Focus the reply input whenever the dispatcher opens a driver thread, and
  // re-focus it after send so they can keep typing without re-clicking.
  const inputRef = useRef<HTMLInputElement>(null);

  const driverConversations = useMemo(
    () => conversations.filter((c) => c.partner?.role === "DRIVER"),
    [conversations],
  );
  const totalUnread = useMemo(
    () => driverConversations.reduce((n, c) => n + (c.unreadCount || 0), 0),
    [driverConversations],
  );

  // Lazily build a shared AudioContext on first use. Some browsers block
  // this until after a user gesture — if it throws we just skip the sound.
  const playChime = useCallback(() => {
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current!;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      // Two-note descending chime — "bing-bong" that reads as "new message"
      // rather than alarm. Short (<350ms) so it doesn't bleed over chatter.
      const tones: Array<[number, number]> = [
        [880, now],         // A5 at t=0
        [660, now + 0.12],  // E5 at t=120ms
      ];
      for (const [freq, startAt] of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + 0.24);
      }
    } catch {
      /* audio is nice-to-have, never block on it */
    }
  }, []);

  // Fire animation + chime when unread count climbs AND the panel is
  // closed. If the dispatcher already has the inbox open, extra noise is
  // distracting — they can see the message land live.
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const prev = prevUnreadRef.current;
    if (totalUnread > prev && !openRef.current) {
      playChime();
      setBouncing(true);
      const t = setTimeout(() => setBouncing(false), 900);
      return () => clearTimeout(t);
    }
    prevUnreadRef.current = totalUnread;
    return undefined;
  }, [totalUnread, playChime]);

  useEffect(() => {
    // Keep ref in sync *after* the comparison above runs.
    prevUnreadRef.current = totalUnread;
  }, [totalUnread]);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const data = await api.get<{ data: Conversation[] }>("/api/messages/conversations");
      setConversations(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      console.error("[DriverMessageInbox] Failed to load conversations", err);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const openThread = useCallback(async (partnerId: string) => {
    setActivePartnerId(partnerId);
    setLoadingThread(true);
    try {
      const data = await api.get<{ data: ChatMessage[] }>(
        `/api/messages/conversation/${partnerId}`,
      );
      setMessages(Array.isArray(data?.data) ? data.data : []);
      // After the server-side mark-as-read in GET /conversation, refresh
      // the conversation list so the unread badge clears immediately.
      loadConversations();
    } catch (err) {
      console.error("[DriverMessageInbox] Failed to load thread", err);
      setMessages([]);
    } finally {
      setLoadingThread(false);
      setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      }, 50);
    }
  }, [loadConversations]);

  // Load conversation list whenever the widget is opened.
  useEffect(() => {
    if (open) loadConversations();
  }, [open, loadConversations]);

  // Real-time incoming messages. The dispatch namespace receives:
  //   - per-dispatcher `.to('dispatcher_${id}')` messages (directed to me)
  //   - per-company `.to('dispatch_${companyId}')` broadcasts (team inbox)
  //   - un-scoped monitoring broadcast (every message)
  // We dedupe on id, filter to driver-originated traffic, and either
  // append to the open thread or refresh the list for a different driver.
  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (msg: any) => {
      if (!msg || !msg.id) return;
      const isForMe = msg.receiverId === me?.id;
      const senderRole =
        msg.users_messages_senderIdTousers?.role || msg.sender?.role || null;
      const otherPartyId = msg.senderId === me?.id ? msg.receiverId : msg.senderId;

      // Only surface driver-originated conversations in this inbox.
      if (senderRole && senderRole !== "DRIVER" && !isForMe) return;

      if (otherPartyId && activePartnerId && otherPartyId === activePartnerId) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [
            ...prev,
            {
              id: msg.id,
              senderId: msg.senderId,
              receiverId: msg.receiverId,
              content: msg.content,
              createdAt: msg.createdAt,
            },
          ];
        });
        setTimeout(() => {
          listRef.current?.scrollTo({
            top: listRef.current.scrollHeight,
            behavior: "smooth",
          });
        }, 50);
      }
      // Always refresh the list so unread counts + last message text stay
      // current, even if the thread for this driver isn't open.
      loadConversations();
    };
    socket.on("message:new", onNewMessage);
    return () => { socket.off("message:new", onNewMessage); };
  }, [socket, activePartnerId, me?.id, loadConversations]);

  const sendWith = useCallback(async (opts: { text?: string; attachments?: ChatAttachment[] }) => {
    const text = (opts.text ?? input).trim();
    const atts = opts.attachments;
    const hasAtts = Array.isArray(atts) && atts.length > 0;
    if ((!text && !hasAtts) || !activePartnerId || sending) return;
    setSending(true);
    try {
      const body: any = {
        receiverId: activePartnerId,
        content: text || (hasAtts
          ? (atts![0].kind === 'audio' ? '🎤 Voice note' : atts![0].kind === 'image' ? '📷 Photo' : '📎 File')
          : ''),
        messageType: hasAtts && atts![0].kind === 'image' ? 'IMAGE' : 'TEXT',
      };
      if (hasAtts) body.attachments = atts;
      const data = await api.post<{ data: ChatMessage }>("/api/messages", body);
      const msg = data?.data;
      if (msg) {
        // Backend echoes attachments back in the response, but surface them
        // locally even if it doesn't so the optimistic bubble renders.
        const enriched = hasAtts && !(msg as any).attachments
          ? { ...msg, attachments: atts }
          : msg;
        setMessages((prev) => [...prev, enriched as any]);
        if (!opts.text) setInput("");
        setTimeout(() => {
          listRef.current?.scrollTo({
            top: listRef.current!.scrollHeight,
            behavior: "smooth",
          });
          inputRef.current?.focus();
        }, 50);
      }
    } catch (err) {
      console.error("[DriverMessageInbox] Failed to send", err);
    } finally {
      setSending(false);
    }
  }, [input, activePartnerId, sending]);

  const send = useCallback(() => sendWith({}), [sendWith]);

  const activePartner = useMemo(
    () => driverConversations.find((c) => c.partnerId === activePartnerId)?.partner,
    [driverConversations, activePartnerId],
  );

  // Auto-focus the reply input when the dispatcher opens a driver thread.
  // setTimeout nudges it past the render tick so the input is actually
  // mounted before we try to call .focus().
  useEffect(() => {
    if (!activePartnerId) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [activePartnerId]);

  if (!me || (me.role !== "DISPATCHER" && me.role !== "OWNER" && me.role !== "COMPANY_ADMIN" && me.role !== "ADMIN" && me.role !== "SUPER_ADMIN")) {
    return null;
  }

  // Inline keyframes so this component is drop-in without touching any
  // shared CSS file. `bounce` = short attention-grabber on new-message
  // arrival. `pulse` = gentle continuous ring while unread > 0 and panel
  // is closed, so the button keeps drawing the eye even after the
  // bounce completes.
  const keyframes = `
    @keyframes dmi-bounce {
      0%   { transform: translateY(0)     scale(1);    }
      20%  { transform: translateY(-12px) scale(1.08); }
      40%  { transform: translateY(0)     scale(0.96); }
      60%  { transform: translateY(-6px)  scale(1.04); }
      80%  { transform: translateY(0)     scale(0.98); }
      100% { transform: translateY(0)     scale(1);    }
    }
    @keyframes dmi-pulse-ring {
      0%   { box-shadow: 0 0 0 0   rgba(239,68,68,0.6); }
      70%  { box-shadow: 0 0 0 16px rgba(239,68,68,0);  }
      100% { box-shadow: 0 0 0 0   rgba(239,68,68,0);   }
    }
  `;

  const pulsing = !open && totalUnread > 0;
  const launcherAnimation = bouncing
    ? "dmi-bounce 0.9s ease-out, dmi-pulse-ring 1.2s ease-out 0.2s infinite"
    : pulsing
      ? "dmi-pulse-ring 1.6s ease-out infinite"
      : undefined;

  return (
    <>
      <style>{keyframes}</style>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          border: "none",
          backgroundColor: "#2563eb",
          color: "white",
          cursor: "pointer",
          boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          animation: launcherAnimation,
          transformOrigin: "center",
        }}
        aria-label={open ? "Close driver messages" : `Open driver messages (${totalUnread} unread)`}
      >
        {open ? <X size={22} /> : <Headset size={22} />}
        {!open && totalUnread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: "#ef4444",
              color: "white",
              fontSize: 11,
              fontWeight: 700,
              padding: "0 6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 96,
            right: 24,
            width: 380,
            maxWidth: "calc(100vw - 48px)",
            height: 520,
            maxHeight: "calc(100vh - 140px)",
            backgroundColor: "#0f172a",
            color: "white",
            borderRadius: 16,
            boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 999,
            border: "1px solid #1e293b",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid #1e293b",
              display: "flex",
              alignItems: "center",
              gap: 10,
              backgroundColor: "#111827",
            }}
          >
            <MessageSquare size={18} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {activePartnerId ? fullName(activePartner) : "Driver Messages"}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                {activePartnerId ? "Real-time · Driver" : `${driverConversations.length} conversations`}
              </div>
            </div>
            {activePartnerId && (
              <button
                type="button"
                onClick={() => { setActivePartnerId(null); setMessages([]); }}
                style={{
                  background: "transparent",
                  border: "1px solid #334155",
                  color: "#cbd5e1",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                ← All
              </button>
            )}
          </div>

          {/* List view */}
          {!activePartnerId && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loadingConversations ? (
                <div style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>Loading…</div>
              ) : driverConversations.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  No driver messages yet. Drivers can start a chat from the app.
                </div>
              ) : (
                driverConversations.map((c) => {
                  const isMine = c.lastMessage.senderId === me.id;
                  return (
                    <button
                      key={c.partnerId}
                      type="button"
                      onClick={() => openThread(c.partnerId)}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        borderBottom: "1px solid #1e293b",
                        background: "transparent",
                        color: "white",
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: "#1e293b",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#60a5fa",
                        }}
                      >
                        {(c.partner?.firstName?.[0] || "D").toUpperCase()}
                      </div>
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{fullName(c.partner)}</span>
                          <span style={{ fontSize: 10, color: "#64748b" }}>{shortTime(c.lastMessage.createdAt)}</span>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: c.unreadCount > 0 && !isMine ? "#e2e8f0" : "#94a3b8",
                            fontWeight: c.unreadCount > 0 && !isMine ? 600 : 400,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {isMine ? "You: " : ""}{c.lastMessage.content}
                        </div>
                      </div>
                      {c.unreadCount > 0 && !isMine && (
                        <span
                          style={{
                            minWidth: 18,
                            height: 18,
                            borderRadius: 9,
                            backgroundColor: "#ef4444",
                            color: "white",
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "0 5px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {c.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Thread view */}
          {activePartnerId && (
            <>
              <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                {loadingThread ? (
                  <div style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>Loading…</div>
                ) : messages.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                    No messages yet with this driver.
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.senderId === me.id;
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          justifyContent: mine ? "flex-end" : "flex-start",
                          marginBottom: 6,
                        }}
                      >
                        <div
                          style={{
                            maxWidth: "78%",
                            padding: "8px 12px",
                            borderRadius: 12,
                            backgroundColor: mine ? "#2563eb" : "#1e293b",
                            color: "white",
                            fontSize: 13,
                            lineHeight: "18px",
                            borderBottomRightRadius: mine ? 4 : 12,
                            borderBottomLeftRadius: mine ? 12 : 4,
                          }}
                        >
                          {Array.isArray(m.attachments) && m.attachments.length > 0 && m.attachments.map((att, i) => {
                            if (att.kind === 'image') {
                              const src = `data:${att.mime};base64,${att.base64}`;
                              return (
                                <img
                                  key={`${m.id}-att-${i}`}
                                  src={src}
                                  alt={att.fileName || 'photo'}
                                  onClick={() => setLightboxSrc(src)}
                                  style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, display: 'block', marginBottom: 4, cursor: 'zoom-in' }}
                                  title="Click to enlarge"
                                />
                              );
                            }
                            if (att.kind === 'audio') {
                              return (
                                <audio
                                  key={`${m.id}-att-${i}`}
                                  controls
                                  src={`data:${att.mime};base64,${att.base64}`}
                                  style={{ maxWidth: 240, marginBottom: 4 }}
                                />
                              );
                            }
                            if (att.kind === 'file') {
                              const href = `data:${att.mime};base64,${att.base64}`;
                              return (
                                <a
                                  key={`${m.id}-att-${i}`}
                                  href={href}
                                  download={att.fileName || 'file'}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                    color: '#fff',
                                    fontSize: 12,
                                    textDecoration: 'none',
                                    marginBottom: 4,
                                  }}
                                >
                                  📎 {att.fileName || 'Download'}
                                </a>
                              );
                            }
                            return null;
                          })}
                          {m.content && !['🎤 Voice note', '📷 Photo'].includes(m.content) && (
                            <div>{m.content}</div>
                          )}
                          <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2, textAlign: "right" }}>
                            {shortTime(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Hidden file pickers — triggered by the 📎/📷 buttons below. */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const base64 = await blobToBase64(file);
                  await sendWith({
                    attachments: [{
                      kind: 'image',
                      mime: file.type || 'image/jpeg',
                      base64,
                      fileName: file.name,
                    }],
                  });
                }}
              />
              <input
                ref={docInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (file.size > 20 * 1024 * 1024) {
                    alert('File too large (max 20 MB)');
                    return;
                  }
                  const base64 = await blobToBase64(file);
                  const isImage = /^image\//.test(file.type);
                  await sendWith({
                    attachments: [{
                      kind: isImage ? 'image' : 'file',
                      mime: file.type || 'application/octet-stream',
                      base64,
                      fileName: file.name,
                    }],
                  });
                }}
              />

              <div
                style={{
                  padding: 8,
                  borderTop: "1px solid #1e293b",
                  display: "flex",
                  gap: 6,
                  alignItems: 'center',
                  backgroundColor: "#111827",
                }}
              >
                {/* Attach image */}
                <button
                  type="button"
                  title="Attach image"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || recording}
                  style={{
                    width: 32, height: 32, borderRadius: 16, border: 'none',
                    backgroundColor: '#1e293b', color: '#fbbf24', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}
                >📷</button>
                {/* Attach any file */}
                <button
                  type="button"
                  title="Attach file (PDF, doc, etc)"
                  onClick={() => docInputRef.current?.click()}
                  disabled={sending || recording}
                  style={{
                    width: 32, height: 32, borderRadius: 16, border: 'none',
                    backgroundColor: '#1e293b', color: '#fbbf24', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}
                >📎</button>
                {/* Voice note — tap to start, tap again to send. */}
                <button
                  type="button"
                  title={recording ? 'Stop and send' : 'Record voice note'}
                  onClick={async () => {
                    if (recording) {
                      const rec = recorderRef.current;
                      if (!rec) return;
                      const stopPromise = new Promise<Blob>((resolve) => {
                        rec.onstop = () => {
                          const blob = new Blob(recordedChunksRef.current, { type: rec.mimeType || 'audio/webm' });
                          recordedChunksRef.current = [];
                          resolve(blob);
                        };
                      });
                      rec.stop();
                      rec.stream.getTracks().forEach((t) => t.stop());
                      const blob = await stopPromise;
                      const durationMs = Date.now() - recordStartRef.current;
                      setRecording(false);
                      recorderRef.current = null;
                      const base64 = await blobToBase64(blob);
                      await sendWith({
                        attachments: [{
                          kind: 'audio',
                          mime: blob.type || 'audio/webm',
                          base64,
                          durationMs,
                          fileName: `voice-${Date.now()}.webm`,
                        }],
                      });
                    } else {
                      try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        const rec = new MediaRecorder(stream);
                        recorderRef.current = rec;
                        recordedChunksRef.current = [];
                        rec.ondataavailable = (e) => {
                          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
                        };
                        rec.start();
                        recordStartRef.current = Date.now();
                        setRecording(true);
                      } catch (err: any) {
                        alert('Could not access microphone: ' + (err?.message || err));
                      }
                    }
                  }}
                  disabled={sending}
                  style={{
                    width: 32, height: 32, borderRadius: 16, border: 'none',
                    backgroundColor: recording ? '#ef4444' : '#1e293b',
                    color: recording ? '#fff' : '#fbbf24',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}
                >{recording ? '⏹' : '🎤'}</button>

                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  autoFocus
                  disabled={recording}
                  placeholder={recording ? 'Recording…' : 'Reply to driver…'}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #1e293b",
                    backgroundColor: "#0f172a",
                    color: "white",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={!input.trim() || sending}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: input.trim() ? "#2563eb" : "#334155",
                    color: "white",
                    cursor: input.trim() ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Image lightbox — tap an image in the chat to enlarge. Backdrop or
          Esc closes. Rendered as a sibling to the panel so it covers the
          whole viewport. */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setLightboxSrc(null); }}
          tabIndex={-1}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxSrc}
            alt="Attachment preview"
            style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: 18,
              border: 'none',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: '#fff',
              fontSize: 20,
              cursor: 'pointer',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
};

export default DriverMessageInbox;
