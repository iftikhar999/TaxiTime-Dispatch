import { Bell, GripHorizontal, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatchStore } from "../../store/useDispatchStore";

interface GridDispatchLayoutProps {
  dispatcherName?: string;
  companyName?: string;
  onLogout?: () => void;
  jobList: React.ReactNode;
  driverList: React.ReactNode;
  zoneList: React.ReactNode;
  map: React.ReactNode;
  jobCreation: React.ReactNode;
  showJobCreation: boolean;
  isEditMode?: boolean;
  onCloseJobCreation: () => void;
}

const GridDispatchLayout: React.FC<GridDispatchLayoutProps> = ({
  dispatcherName,
  companyName,
  onLogout,
  jobList,
  driverList,
  zoneList,
  map,
  jobCreation,
  showJobCreation,
  isEditMode = false,
  onCloseJobCreation,
}) => {
  // Notification state from store
  const notifications = useDispatchStore((state) => state.notifications);
  const unreadCount = useDispatchStore((state) => state.unreadNotificationCount);
  const markNotificationsAsRead = useDispatchStore((state) => state.markNotificationsAsRead);
  const setSelectedStatus = useDispatchStore((state) => state.setSelectedStatus);
  const selectJob = useDispatchStore((state) => state.selectJob);
  
  // Notification dropdown state
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  
  // Draggable modal state
  const [position, setPosition] = useState({ x: 100, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Handle notification click - navigate to job
  const handleNotificationClick = (notification: any) => {
    // Navigate to the appropriate tab based on notification type
    if (notification.type === 'NOSHOW') {
      setSelectedStatus('NOSHOW');
    } else if (notification.type === 'RECALLED') {
      setSelectedStatus('UNASSIGNED');
    }
    // Select the job
    selectJob(notification.jobId);
    // Close dropdown
    setShowNotifications(false);
  };
  
  // Toggle notifications and mark as read when opening
  const handleNotificationToggle = () => {
    if (!showNotifications) {
      // Opening - mark as read after a small delay so user sees the unread state
      setTimeout(() => markNotificationsAsRead(), 500);
    }
    setShowNotifications(!showNotifications);
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
        
        // Keep modal within viewport bounds
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
  return (
    <div className="flex h-screen flex-col bg-slate-100">
      {/* Header - Responsive */}
      <header className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-3 md:px-4 lg:px-6 py-2 shadow-sm z-10 gap-2">
        <div className="flex-shrink-0">
          <h1 className="text-base lg:text-lg font-semibold tracking-tight text-slate-900">
            TaxiTime Dispatch Console
          </h1>
          <p className="text-[10px] lg:text-xs text-slate-500 hidden sm:block">
            Monitor jobs, drivers, and zones in real time
          </p>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-[10px] lg:text-xs text-slate-700 flex-wrap">
          {/* Notification Bell */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={handleNotificationToggle}
              className="relative rounded-full p-1.5 lg:p-2 text-slate-600 hover:bg-slate-100 transition"
              title="Notifications"
            >
              <Bell size={18} className="lg:w-5 lg:h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 lg:h-5 lg:w-5 items-center justify-center rounded-full bg-red-500 text-[9px] lg:text-[10px] font-bold text-white animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            
            {/* Notification Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 lg:w-80 max-h-80 lg:max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl z-50">
                <div className="flex items-center justify-between border-b border-slate-200 px-3 lg:px-4 py-2 bg-slate-50">
                  <span className="font-semibold text-slate-800 text-sm">Notifications</span>
                  {notifications.length > 0 && (
                    <span className="text-xs text-slate-500">{notifications.length} alerts</span>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 lg:py-8 text-center text-slate-500">
                    <Bell size={28} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {notifications.map((notif) => (
                      <button
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`w-full text-left px-3 lg:px-4 py-2.5 lg:py-3 hover:bg-slate-50 transition ${
                          !notif.read ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`flex-shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                            notif.type === 'NOSHOW' ? 'bg-orange-500' :
                            notif.type === 'RECALLED' ? 'bg-purple-500' :
                            'bg-blue-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] lg:text-xs font-bold uppercase ${
                                notif.type === 'NOSHOW' ? 'text-orange-600' :
                                notif.type === 'RECALLED' ? 'text-purple-600' :
                                'text-blue-600'
                              }`}>
                                {notif.type === 'NOSHOW' ? '🚫 No-Show' : 
                                 notif.type === 'RECALLED' ? '🔄 Recalled' :
                                 '📢 Alert'}
                              </span>
                              <span className="text-[9px] lg:text-[10px] text-slate-400">
                                {new Date(notif.timestamp).toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <p className="text-xs lg:text-sm text-slate-700 truncate">{notif.message}</p>
                            <p className="text-[10px] lg:text-xs text-slate-500">Job: {notif.jobReference}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <span className="rounded-full bg-emerald-50 px-2 lg:px-3 py-0.5 lg:py-1 text-emerald-700 border border-emerald-200 text-[10px] lg:text-xs truncate max-w-[120px] lg:max-w-none">
            Dispatcher: {dispatcherName ?? "—"}
          </span>
          <span className="rounded-full bg-blue-50 px-2 lg:px-3 py-0.5 lg:py-1 text-blue-700 border border-blue-200 text-[10px] lg:text-xs hidden md:inline-block">
            {companyName ?? "—"}
          </span>
          <button
            className="rounded-md border border-slate-300 px-2 lg:px-3 py-0.5 lg:py-1 text-slate-700 transition hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50 text-[10px] lg:text-xs"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Grid Layout - Responsive with viewport-based sizing */}
      <main className="flex-1 overflow-hidden relative">
        <div className="grid h-full gap-1.5 lg:gap-2 p-1.5 lg:p-2"
          style={{
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gridTemplateRows: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
          }}
        >
          {/* Top Left: Job Listing - Takes slightly more vertical space */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden min-h-0">
            {jobList}
          </div>

          {/* Top Right: Map */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden min-h-0">
            {map}
          </div>

          {/* Bottom Left: Driver Listing */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden min-h-0">
            {driverList}
          </div>

          {/* Bottom Right: Zone Listing */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden min-h-0">
            {zoneList}
          </div>
        </div>

        {/* Floating Draggable Job Creation Modal - Responsive */}
        {showJobCreation && (
          <div
            ref={modalRef}
            style={{
              position: "fixed",
              left: position.x,
              top: position.y,
              zIndex: 1100,
            }}
            className="w-[340px] lg:w-[400px] max-h-[80vh] lg:max-h-[85vh] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Draggable Header */}
            <div
              onMouseDown={handleMouseDown}
              className={`flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700 px-3 lg:px-4 py-2 cursor-move select-none ${
                isDragging ? "cursor-grabbing" : "cursor-grab"
              }`}
            >
              <div className="flex items-center gap-2">
                <GripHorizontal size={14} className="text-blue-200 lg:w-4 lg:h-4" />
                <div>
                  <h2 className="text-sm lg:text-base font-semibold text-white">
                    {isEditMode ? 'Update Job' : 'Create New Job'}
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

export default GridDispatchLayout;
