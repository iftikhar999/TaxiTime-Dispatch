import React, { useEffect, useRef, useState } from "react";
import { useDispatchSocket } from "../../providers/SocketProvider";

interface SocketMessage {
  id: string;
  timestamp: Date;
  event: string;
  data: any;
  type: "incoming" | "outgoing";
  processed: boolean;
}

export const SocketTrafficMonitor: React.FC = () => {
  const [messages, setMessages] = useState<SocketMessage[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [filter, setFilter] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [driverEvents, setDriverEvents] = useState(0);
  const [statusChanges, setStatusChanges] = useState(0);
  const { socket } = useDispatchSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageCounter = useRef(0);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!isPaused) {
      scrollToBottom();
    }
  }, [messages, isPaused]);

  // Clear messages
  const clearMessages = () => {
    setMessages([]);
    messageCounter.current = 0;
    setDriverEvents(0);
    setStatusChanges(0);
  };

  // Add message to list with enhanced driver status information
  const addMessage = (
    event: string,
    data: any,
    type: "incoming" | "outgoing"
  ) => {
    if (isPaused) return;

    // Track driver events
    if (event.includes("driver")) {
      setDriverEvents((prev) => prev + 1);
      if (event.includes("status")) {
        setStatusChanges((prev) => prev + 1);
      }
    }

    // Extract driver status information if available
    let enhancedData = data;
    if (event.includes("driver") && data && typeof data === "object") {
      if (data.driverId || data.driver_id) {
        enhancedData = {
          ...data,
          __driverInfo: `Driver ${data.driverId || data.driver_id}${
            data.status ? ` → ${data.status}` : ""
          }${data.vehicleType ? ` (${data.vehicleType})` : ""}`,
        };
      }
    }

    const message: SocketMessage = {
      id: `${Date.now()}-${++messageCounter.current}`,
      timestamp: new Date(),
      event,
      data: enhancedData,
      type,
      processed: true,
    };

    setMessages((prev) => {
      const updated = [message, ...prev].slice(0, 100); // Keep last 100 messages
      return updated;
    });
  };

  useEffect(() => {
    if (!socket) return;

    // List of events to monitor
    const eventsToMonitor = [
      "driverOnline",
      "driverOffline",
      "driverLocationUpdate",
      "driver:status:update",
      "driver:status:updated",
      "driver:zone:changed",
      "meter:started",
      "meter:update",
      "meter:stopped",
      "meter:telemetry",
      "job_completed",
      "job:completed",
      "ride_created",
      "ride_updated",
      "zone_queue_updated",
      "payment:collected",
      "connect",
      "disconnect",
      "connect_error",
      "reconnect",
      "reconnecting",
    ];

    // Monitor incoming events
    const handlers: Array<[string, (...args: any[]) => void]> = [];

    eventsToMonitor.forEach((event) => {
      const handler = (...args: any[]) => {
        addMessage(event, args.length === 1 ? args[0] : args, "incoming");
      };
      socket.on(event, handler);
      handlers.push([event, handler]);
    });

    // Monitor outgoing events by wrapping emit (safer approach)
    const originalEmit = socket.emit.bind(socket);
    const wrappedEmit = (event: string, ...args: any[]) => {
      addMessage(event, args.length === 1 ? args[0] : args, "outgoing");
      return originalEmit(event, ...args);
    };

    // Only wrap if not already wrapped
    if (!(socket as any).__wrapped) {
      socket.emit = wrappedEmit;
      (socket as any).__wrapped = true;
    }

    // Cleanup
    return () => {
      handlers.forEach(([event, handler]) => {
        socket.off(event, handler);
      });
      // Restore original emit only if we wrapped it
      if ((socket as any).__wrapped) {
        socket.emit = originalEmit;
        delete (socket as any).__wrapped;
      }
    };
  }, [socket, isPaused]);

  // Filter messages
  const filteredMessages = filter
    ? messages.filter(
        (msg) =>
          msg.event.toLowerCase().includes(filter.toLowerCase()) ||
          JSON.stringify(msg.data).toLowerCase().includes(filter.toLowerCase())
      )
    : messages;

  const formatData = (data: any): string => {
    try {
      if (typeof data === "string") return data;
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const getEventColor = (event: string, type: "incoming" | "outgoing") => {
    if (type === "outgoing") return "text-blue-600";

    if (event.includes("driver")) return "text-green-600";
    if (event.includes("job") || event.includes("meter"))
      return "text-orange-600";
    if (event.includes("zone")) return "text-purple-600";
    if (event.includes("connect") || event.includes("disconnect"))
      return "text-red-600";
    return "text-gray-600";
  };

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <span
              className={`transform transition-transform ${
                isExpanded ? "rotate-90" : ""
              }`}
            >
              ▶
            </span>
            Socket Traffic Monitor
          </button>

          {socket?.connected ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              Disconnected
            </span>
          )}

          <span className="text-xs text-gray-500">
            {messages.length} messages
          </span>

          <span className="text-xs text-blue-600 font-medium">
            {driverEvents} driver events
          </span>

          <span className="text-xs text-green-600 font-medium">
            {statusChanges} status changes
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-2 py-1 text-xs rounded ${
              isPaused
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
            }`}
          >
            {isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>

          <button
            onClick={() => {
              // Force refresh drivers from database with cache-busting
              localStorage.setItem("dispatch_force_refresh", "true");
              window.location.reload();
            }}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            title="Force refresh driver data from database"
          >
            🔄 Force Refresh
          </button>

          <button
            onClick={() => {
              // Force clear all drivers by setting localStorage flag and refreshing
              localStorage.setItem("dispatch_force_clear", "true");
              window.location.reload();
            }}
            className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
            title="Clear all drivers from dispatch portal"
          >
            🧹 Clear Drivers
          </button>

          <button
            onClick={clearMessages}
            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4">
          {/* Filter */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Filter events (e.g., driver, job, status)..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Messages */}
          <div className="bg-gray-900 text-white rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs">
            {filteredMessages.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                {isPaused ? "Monitoring paused" : "No socket events yet..."}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredMessages.map((msg) => (
                  <div key={msg.id} className="border-b border-gray-700 pb-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-400">
                        {msg.timestamp.toLocaleTimeString()}
                      </span>
                      <span
                        className={`font-semibold ${getEventColor(
                          msg.event,
                          msg.type
                        )}`}
                      >
                        {msg.type === "outgoing" ? "→" : "←"} {msg.event}
                      </span>
                      {msg.type === "outgoing" && (
                        <span className="text-xs bg-blue-600 text-white px-1 rounded">
                          OUT
                        </span>
                      )}
                    </div>
                    <pre className="text-gray-300 text-xs whitespace-pre-wrap break-words">
                      {formatData(msg.data)}
                    </pre>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SocketTrafficMonitor;
