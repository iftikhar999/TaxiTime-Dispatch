import {
    Bell,
    GripHorizontal,
    Moon,
    RotateCcw,
    Sun,
    X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import GridLayout, { Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useTheme } from "../../contexts/ThemeContext";
import { usePanelLayout } from "../../hooks/usePanelLayout";
import { useDispatchStore } from "../../store/useDispatchStore";

interface ResizableDispatchLayoutProps {
  dispatcherName?: string;
  companyName?: string;
  onLogout?: () => void;
  jobList: React.ReactNode;
  driverList: React.ReactNode;
  zoneList: React.ReactNode;
  map: React.ReactNode;
  jobCreation: React.ReactNode;
  showJobCreation: boolean;
  onCloseJobCreation: () => void;
}

const ResizableDispatchLayout: React.FC<ResizableDispatchLayoutProps> = ({
  dispatcherName,
  companyName,
  onLogout,
  jobList,
  driverList,
  zoneList,
  map,
  jobCreation,
  showJobCreation,
  onCloseJobCreation,
}) => {
  // Theme
  const { theme, toggleTheme, isDark } = useTheme();

  // Panel layout
  const { layout, saveLayout, resetLayout } = usePanelLayout();

  // Container dimensions
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [containerHeight, setContainerHeight] = useState(800);

  // Notification state from store
  const notifications = useDispatchStore((state) => state.notifications);
  const unreadCount = useDispatchStore(
    (state) => state.unreadNotificationCount
  );
  const markNotificationsAsRead = useDispatchStore(
    (state) => state.markNotificationsAsRead
  );
  const setSelectedStatus = useDispatchStore(
    (state) => state.setSelectedStatus
  );
  const selectJob = useDispatchStore((state) => state.selectJob);

  // Notification dropdown state
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Draggable modal state
  const [position, setPosition] = useState({ x: 100, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Measure container size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerWidth(rect.width - 16); // Account for padding
        setContainerHeight(rect.height - 16);
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(e.target as Node)
      ) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle notification click - navigate to job
  const handleNotificationClick = (notification: any) => {
    if (notification.type === "NOSHOW") {
      setSelectedStatus("NOSHOW");
    } else if (notification.type === "RECALLED") {
      setSelectedStatus("UNASSIGNED");
    }
    selectJob(notification.jobId);
    setShowNotifications(false);
  };

  // Toggle notifications and mark as read when opening
  const handleNotificationToggle = () => {
    if (!showNotifications) {
      setTimeout(() => markNotificationsAsRead(), 500);
    }
    setShowNotifications(!showNotifications);
  };

  // Handle layout change
  const handleLayoutChange = (newLayout: Layout[]) => {
    saveLayout(newLayout);
  };

  // Handle mouse down on header to start dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  }, []);

  // Handle mouse move while dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        const maxX = window.innerWidth - 420;
        const maxY = window.innerHeight - 100;

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Reset position when modal opens
  useEffect(() => {
    if (showJobCreation) {
      setPosition({ x: 100, y: 80 });
    }
  }, [showJobCreation]);

  // Calculate row height based on container height
  const rowHeight = Math.max(20, (containerHeight - 22 * 10) / 22); // 22 total rows

  return (
    <div
      className={`flex h-screen flex-col transition-colors duration-300 ${
        isDark ? "bg-gray-900" : "bg-slate-100"
      }`}
    >
      {/* Header */}
      <header
        className={`flex flex-wrap items-center justify-between border-b px-3 md:px-4 lg:px-6 py-2 shadow-sm z-10 gap-2 transition-colors duration-300 ${
          isDark
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-slate-200"
        }`}
      >
        <div className="flex-shrink-0">
          <h1
            className={`text-base lg:text-lg font-semibold tracking-tight ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            TaxiTime Dispatch Console
          </h1>
          <p
            className={`text-[10px] lg:text-xs hidden sm:block ${
              isDark ? "text-gray-400" : "text-slate-500"
            }`}
          >
            Monitor jobs, drivers, and zones in real time
          </p>
        </div>
        <div
          className={`flex items-center gap-2 lg:gap-3 text-[10px] lg:text-xs flex-wrap ${
            isDark ? "text-gray-300" : "text-slate-700"
          }`}
        >
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className={`rounded-full p-1.5 lg:p-2 transition ${
              isDark
                ? "text-yellow-400 hover:bg-gray-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? (
              <Sun size={18} className="lg:w-5 lg:h-5" />
            ) : (
              <Moon size={18} className="lg:w-5 lg:h-5" />
            )}
          </button>

          {/* Reset Layout */}
          <button
            onClick={resetLayout}
            className={`rounded-full p-1.5 lg:p-2 transition ${
              isDark
                ? "text-gray-400 hover:bg-gray-700 hover:text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title="Reset Panel Layout"
          >
            <RotateCcw size={16} className="lg:w-[18px] lg:h-[18px]" />
          </button>

          {/* Notification Bell */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={handleNotificationToggle}
              className={`relative rounded-full p-1.5 lg:p-2 transition ${
                isDark
                  ? "text-gray-400 hover:bg-gray-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              title="Notifications"
            >
              <Bell size={18} className="lg:w-5 lg:h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 lg:h-5 lg:w-5 items-center justify-center rounded-full bg-red-500 text-[9px] lg:text-[10px] font-bold text-white animate-pulse">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
              <div
                className={`absolute right-0 mt-2 w-72 lg:w-80 max-h-80 lg:max-h-96 overflow-y-auto rounded-lg border shadow-xl z-50 ${
                  isDark
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-slate-200"
                }`}
              >
                <div
                  className={`flex items-center justify-between border-b px-3 lg:px-4 py-2 ${
                    isDark
                      ? "border-gray-700 bg-gray-750"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <span
                    className={`font-semibold text-sm ${
                      isDark ? "text-white" : "text-slate-800"
                    }`}
                  >
                    Notifications
                  </span>
                  {notifications.length > 0 && (
                    <span
                      className={`text-xs ${
                        isDark ? "text-gray-400" : "text-slate-500"
                      }`}
                    >
                      {notifications.length} alerts
                    </span>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div
                    className={`px-4 py-6 lg:py-8 text-center ${
                      isDark ? "text-gray-400" : "text-slate-500"
                    }`}
                  >
                    <Bell
                      size={28}
                      className={`mx-auto mb-2 ${
                        isDark ? "text-gray-600" : "text-slate-300"
                      }`}
                    />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  <div
                    className={`divide-y ${
                      isDark ? "divide-gray-700" : "divide-slate-100"
                    }`}
                  >
                    {notifications.map((notif) => (
                      <button
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`w-full text-left px-3 lg:px-4 py-2.5 lg:py-3 transition ${
                          isDark
                            ? `hover:bg-gray-700 ${
                                !notif.read ? "bg-blue-900/20" : ""
                              }`
                            : `hover:bg-slate-50 ${
                                !notif.read ? "bg-blue-50/50" : ""
                              }`
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`flex-shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                              notif.type === "NOSHOW"
                                ? "bg-orange-500"
                                : notif.type === "RECALLED"
                                ? "bg-purple-500"
                                : "bg-blue-500"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] lg:text-xs font-bold uppercase ${
                                  notif.type === "NOSHOW"
                                    ? "text-orange-600"
                                    : notif.type === "RECALLED"
                                    ? "text-purple-600"
                                    : "text-blue-600"
                                }`}
                              >
                                {notif.type === "NOSHOW"
                                  ? "🚫 No-Show"
                                  : notif.type === "RECALLED"
                                  ? "🔄 Recalled"
                                  : "📢 Alert"}
                              </span>
                              <span
                                className={`text-[9px] lg:text-[10px] ${
                                  isDark ? "text-gray-500" : "text-slate-400"
                                }`}
                              >
                                {new Date(notif.timestamp).toLocaleTimeString(
                                  "en-US",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </span>
                            </div>
                            <p
                              className={`text-xs lg:text-sm truncate ${
                                isDark ? "text-gray-300" : "text-slate-700"
                              }`}
                            >
                              {notif.message}
                            </p>
                            <p
                              className={`text-[10px] lg:text-xs ${
                                isDark ? "text-gray-500" : "text-slate-500"
                              }`}
                            >
                              Job: {notif.jobReference}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <span
            className={`rounded-full px-2 lg:px-3 py-0.5 lg:py-1 text-[10px] lg:text-xs truncate max-w-[120px] lg:max-w-none ${
              isDark
                ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            }`}
          >
            Dispatcher: {dispatcherName ?? "—"}
          </span>
          <span
            className={`rounded-full px-2 lg:px-3 py-0.5 lg:py-1 text-[10px] lg:text-xs hidden md:inline-block ${
              isDark
                ? "bg-blue-900/50 text-blue-300 border border-blue-700"
                : "bg-blue-50 text-blue-700 border border-blue-200"
            }`}
          >
            {companyName ?? "—"}
          </span>
          <button
            className={`rounded-md border px-2 lg:px-3 py-0.5 lg:py-1 text-[10px] lg:text-xs transition ${
              isDark
                ? "border-gray-600 text-gray-300 hover:border-blue-500 hover:text-blue-400 hover:bg-blue-900/30"
                : "border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50"
            }`}
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Grid Layout - Resizable */}
      <main ref={containerRef} className="flex-1 overflow-hidden relative p-1 sm:p-1.5 lg:p-2">
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={rowHeight}
          width={containerWidth}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".panel-drag-handle"
          margin={[4, 4]}
          containerPadding={[0, 0]}
          isResizable={true}
          isDraggable={true}
          useCSSTransforms={true}
        >
          {/* Jobs Panel */}
          <div
            key="jobs"
            className={`rounded-md shadow-sm border overflow-hidden flex flex-col ${
              isDark
                ? "bg-slate-800 border-slate-700"
                : "bg-white border-slate-200"
            }`}
          >
            <div
              className={`panel-drag-handle flex items-center gap-1.5 px-2 py-1 border-b cursor-move select-none ${
                isDark
                  ? "bg-slate-700/50 border-slate-600"
                  : "bg-slate-100 border-slate-200"
              }`}
            >
              <GripHorizontal
                size={12}
                className={isDark ? "text-slate-500" : "text-slate-400"}
              />
              <span
                className={`text-[10px] sm:text-xs font-medium ${
                  isDark ? "text-slate-300" : "text-slate-600"
                }`}
              >
                Jobs
              </span>
            </div>
            <div className="flex-1 overflow-hidden">{jobList}</div>
          </div>

          {/* Map Panel */}
          <div
            key="map"
            className={`rounded-md shadow-sm border overflow-hidden flex flex-col ${
              isDark
                ? "bg-slate-800 border-slate-700"
                : "bg-white border-slate-200"
            }`}
          >
            <div
              className={`panel-drag-handle flex items-center gap-1.5 px-2 py-1 border-b cursor-move select-none ${
                isDark
                  ? "bg-slate-700/50 border-slate-600"
                  : "bg-slate-100 border-slate-200"
              }`}
            >
              <GripHorizontal
                size={12}
                className={isDark ? "text-slate-500" : "text-slate-400"}
              />
              <span
                className={`text-[10px] sm:text-xs font-medium ${
                  isDark ? "text-slate-300" : "text-slate-600"
                }`}
              >
                Map
              </span>
            </div>
            <div className="flex-1 overflow-hidden">{map}</div>
          </div>

          {/* Drivers Panel */}
          <div
            key="drivers"
            className={`rounded-md shadow-sm border overflow-hidden flex flex-col ${
              isDark
                ? "bg-slate-800 border-slate-700"
                : "bg-white border-slate-200"
            }`}
          >
            <div
              className={`panel-drag-handle flex items-center gap-1.5 px-2 py-1 border-b cursor-move select-none ${
                isDark
                  ? "bg-slate-700/50 border-slate-600"
                  : "bg-slate-100 border-slate-200"
              }`}
            >
              <GripHorizontal
                size={12}
                className={isDark ? "text-slate-500" : "text-slate-400"}
              />
              <span
                className={`text-[10px] sm:text-xs font-medium ${
                  isDark ? "text-slate-300" : "text-slate-600"
                }`}
              >
                Drivers
              </span>
            </div>
            <div className="flex-1 overflow-hidden">{driverList}</div>
          </div>

          {/* Zones Panel */}
          <div
            key="zones"
            className={`rounded-md shadow-sm border overflow-hidden flex flex-col ${
              isDark
                ? "bg-slate-800 border-slate-700"
                : "bg-white border-slate-200"
            }`}
          >
            <div
              className={`panel-drag-handle flex items-center gap-1.5 px-2 py-1 border-b cursor-move select-none ${
                isDark
                  ? "bg-slate-700/50 border-slate-600"
                  : "bg-slate-100 border-slate-200"
              }`}
            >
              <GripHorizontal
                size={12}
                className={isDark ? "text-slate-500" : "text-slate-400"}
              />
              <span
                className={`text-[10px] sm:text-xs font-medium ${
                  isDark ? "text-gray-300" : "text-slate-600"
                }`}
              >
                Zones
              </span>
            </div>
            <div className="flex-1 overflow-hidden">{zoneList}</div>
          </div>
        </GridLayout>

        {/* Floating Draggable Job Creation Modal */}
        {showJobCreation && (
          <div
            ref={modalRef}
            style={{
              position: "fixed",
              left: position.x,
              top: position.y,
              zIndex: 1100,
            }}
            className={`w-[340px] lg:w-[400px] max-h-[80vh] lg:max-h-[85vh] rounded-xl shadow-2xl border flex flex-col overflow-hidden ${
              isDark
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-slate-200"
            }`}
          >
            {/* Draggable Header */}
            <div
              onMouseDown={handleMouseDown}
              className={`flex items-center justify-between border-b bg-gradient-to-r from-blue-600 to-blue-700 px-3 lg:px-4 py-2 cursor-move select-none ${
                isDragging ? "cursor-grabbing" : "cursor-grab"
              }`}
            >
              <div className="flex items-center gap-2">
                <GripHorizontal
                  size={14}
                  className="text-blue-200 lg:w-4 lg:h-4"
                />
                <div>
                  <h2 className="text-sm lg:text-base font-semibold text-white">
                    Create New Job
                  </h2>
                </div>
              </div>
              <button
                onClick={onCloseJobCreation}
                className="rounded-lg p-1 lg:p-1.5 text-blue-200 transition hover:bg-blue-500 hover:text-white"
                aria-label="Close job creation panel"
              >
                <X size={16} className="lg:w-[18px] lg:h-[18px]" />
              </button>
            </div>

            {/* Panel Content - Scrollable */}
            <div className="flex-1 overflow-auto max-h-[calc(80vh-48px)] lg:max-h-[calc(85vh-52px)]">
              {jobCreation}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ResizableDispatchLayout;
