import {
    Circle,
    GoogleMap,
    LoadScript,
    Marker,
    Polygon,
    Polyline,
    TrafficLayer,
} from '@react-google-maps/api';
import api from '../../services/api';
import classNames from 'classnames';
import { Minus, Navigation, Plus, Settings, Target } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { getRoute, getRouteWithAlternatives } from '../../services/routingService';
import { useDispatchStore } from '../../store/useDispatchStore';
import { getVehicleSvgDataUrl, normalizeDriverStatus } from '../../utils/vehicleIcons';

// Google Maps API libraries (valid libraries only)
const libraries: ("geometry" | "drawing" | "places" | "visualization")[] = [
  "geometry", "places"
];

interface AdvancedMapState {
  showTraffic: boolean;
  showHeatmap: boolean;
  showClusters: boolean;
  showStreetView: boolean;
  viewMode: 'normal' | 'satellite' | 'hybrid' | 'terrain';
  heatmapData: 'demand' | 'revenue' | 'time';
}

// Marker interfaces removed - zones only

// 🚗 Memoized driver marker.
// Re-renders only when the specific driver's position / status / icon-affecting
// fields change — NOT when unrelated drivers in the list update. This stops the
// whole marker layer from flickering every 5 seconds on driver:location:update.
interface DriverMarkerProps {
  driver: any;
  isFocused: boolean;
}

const DriverMarker: React.FC<DriverMarkerProps> = React.memo(({ driver, isFocused }) => {
  const plateNumber = typeof driver.vehicle === 'string'
    ? driver.vehicle
    : driver.vehicle?.plateNumber || '';

  const vehicleType = driver.vehicleType ||
    (typeof driver.vehicle === 'object' ? driver.vehicle?.type : undefined) ||
    'car';

  // Data URL is stable as long as (status, plate, vehicleType) are stable,
  // so useMemo keeps the same string ref across location ticks.
  const vehicleIconUrl = useMemo(
    () => getVehicleSvgDataUrl(driver.status, plateNumber, vehicleType),
    [driver.status, plateNumber, vehicleType]
  );

  const icon = useMemo(() => {
    if (typeof window === 'undefined' || !(window as any).google?.maps) return undefined;
    return {
      url: vehicleIconUrl,
      scaledSize: new google.maps.Size(isFocused ? 72 : 60, isFocused ? 36 : 30),
      anchor: new google.maps.Point(isFocused ? 36 : 30, isFocused ? 18 : 15),
    };
  }, [vehicleIconUrl, isFocused]);

  if (!driver.position) return null;

  return (
    <Marker
      position={{
        lat: driver.position.latitude,
        lng: driver.position.longitude,
      }}
      icon={icon}
      title={`${driver.name}\n${plateNumber || 'N/A'}\nStatus: ${normalizeDriverStatus(driver.status)}`}
    />
  );
}, (prev, next) => {
  // Custom equality — re-render only when fields that affect the marker change.
  const p = prev.driver;
  const n = next.driver;
  return (
    prev.isFocused === next.isFocused &&
    p.id === n.id &&
    p.status === n.status &&
    p.name === n.name &&
    p.vehicleType === n.vehicleType &&
    (typeof p.vehicle === 'string' ? p.vehicle : p.vehicle?.plateNumber) ===
      (typeof n.vehicle === 'string' ? n.vehicle : n.vehicle?.plateNumber) &&
    p.position?.latitude === n.position?.latitude &&
    p.position?.longitude === n.position?.longitude
  );
});
DriverMarker.displayName = 'DriverMarker';

// 📱 Control Panel Component - Responsive with Dark Mode
const ControlPanel: React.FC<{
  mapState: AdvancedMapState;
  setMapState: React.Dispatch<React.SetStateAction<AdvancedMapState>>;
  onRecenterMap: () => void;
  isDark: boolean;
}> = ({ mapState, setMapState, onRecenterMap, isDark }) => (
  <div className={classNames(
    "absolute top-2 sm:top-3 right-2 sm:right-3 rounded-md shadow-lg p-2 sm:p-3 space-y-1.5 sm:space-y-2 z-10",
    isDark ? "bg-slate-800 border border-slate-700" : "bg-white"
  )}>
    <h3 className={classNames(
      "text-[9px] sm:text-[10px] md:text-xs font-medium flex items-center gap-1 sm:gap-1.5",
      isDark ? "text-slate-200" : "text-gray-800"
    )}>
      <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
      Map Controls
    </h3>
    
    <div className="space-y-1 sm:space-y-1.5">
      <label className={classNames(
        "flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[9px] md:text-[10px] cursor-pointer",
        isDark ? "text-slate-300" : "text-gray-700"
      )}>
        <input
          type="checkbox"
          checked={mapState.showTraffic}
          onChange={(e) => setMapState(prev => ({ ...prev, showTraffic: e.target.checked }))}
          className={classNames(
            "rounded w-3 h-3 sm:w-3.5 sm:h-3.5",
            isDark ? "bg-slate-700 border-slate-600" : ""
          )}
        />
        <Navigation className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
        Traffic Layer
      </label>

      <label className={classNames(
        "flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[9px] md:text-[10px] cursor-pointer",
        isDark ? "text-slate-300" : "text-gray-700"
      )}>
        <input
          type="checkbox"
          checked={mapState.showHeatmap}
          onChange={(e) => setMapState(prev => ({ ...prev, showHeatmap: e.target.checked }))}
          className={classNames(
            "rounded w-3 h-3 sm:w-3.5 sm:h-3.5",
            isDark ? "bg-slate-700 border-slate-600" : ""
          )}
        />
        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 inline-block">🔥</span>
        Customer Demand
      </label>

      {/* Divider */}
      <div className={classNames("border-t my-1 sm:my-1.5", isDark ? "border-slate-700" : "border-gray-200")}></div>
      
      {/* Recenter Button */}
      <button
        onClick={onRecenterMap}
        className={classNames(
          "w-full flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[9px] md:text-[10px] px-1.5 sm:px-2 py-1 sm:py-1.5 rounded transition-colors duration-200 font-medium",
          isDark 
            ? "bg-blue-600 hover:bg-blue-500 text-white" 
            : "bg-blue-50 hover:bg-blue-100 text-blue-700"
        )}
        title="Reset view to show all zones"
      >
        <Target className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
        <span>Show All Zones</span>
      </button>
    </div>
  </div>
);

const DispatchMapGoogle: React.FC = () => {
  const { isDark } = useTheme();
  const {
    drivers,
    jobs,
    zones,
    jobDraft,
    updateJobDraft,
    focusedZoneId,
    hoveredZoneId,
    hoveredJobId,
    selectedJobId,
    focusedDriverId,
    focusZone,
    focusDriver,
    mapPickMode,
    setMapPickMode,
    setMapPickResult,
    jobComposerOpen,
  } = useDispatchStore();

  // Enhanced map state
  const [mapState, setMapState] = useState<AdvancedMapState>({
    showTraffic: false,
    showHeatmap: false,
    showClusters: true,
    showStreetView: false,
    viewMode: 'normal',
    heatmapData: 'demand',
  });

  // Map instance
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);

  // Demand heatmap — bucketed live-customer density from the backend. Only
  // fetched while the toggle is on; polled so hotspots stay current. We keep
  // the raw buckets and convert to weighted google.maps.LatLng once loaded.
  const [heatmapBuckets, setHeatmapBuckets] = useState<Array<{ lat: number; lng: number; weight: number }>>([]);
  useEffect(() => {
    if (!mapState.showHeatmap) { setHeatmapBuckets([]); return; }
    let active = true;
    const load = async () => {
      try {
        const res = await api.get<any>('/api/dispatch/demand-heatmap');
        if (active) setHeatmapBuckets(Array.isArray(res?.points) ? res.points : []);
      } catch { /* non-fatal */ }
    };
    load();
    const t = setInterval(load, 15000);
    return () => { active = false; clearInterval(t); };
  }, [mapState.showHeatmap]);

  // Google removed HeatmapLayer (Maps JS API v3.65), so we render the demand
  // as overlapping warm circles — one per density bucket, radius + colour
  // scaled by how many customers are in that ~500 m cell. Overlap creates the
  // "warm blob" hotspot effect without any deprecated API.
  const maxWeight = useMemo(
    () => heatmapBuckets.reduce((m, b) => Math.max(m, b.weight), 1),
    [heatmapBuckets]
  );
  const heatColor = (w: number) => {
    const t = Math.min(w / Math.max(maxWeight, 1), 1); // 0..1
    return t > 0.66 ? '#ef4444' : t > 0.33 ? '#f97316' : '#facc15'; // red / orange / yellow
  };
  // NOTE: dispatcher geolocation (`dispatcherLocation`) is declared further
  // below in the file; referenced from both the initial fit (handleMapLoad)
  // and the driver-re-fit effect so the initial bounds include the
  // dispatcher's own position alongside the drivers.
  const [directionsRoute, setDirectionsRoute] = useState<Array<{ lat: number; lng: number }> | null>(null);
  const [alternativeRoutes, setAlternativeRoutes] = useState<Array<{ path: Array<{ lat: number; lng: number }>; distance: number; duration: number }>>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const prevJobMarkersRef = useRef<any>(null);
  const lastFetchedRouteKeyRef = useRef<string>('');

  // Aggressively clear map state when jobDraft is cleared (e.g. after job create/update)
  const prevJobDraftRef = useRef<any>(jobDraft);
  useEffect(() => {
    if (prevJobDraftRef.current && !jobDraft) {
      // jobDraft went from truthy → null → nuke every rendering path that
      // could keep a pickup/dropoff pin alive: the inline route state AND
      // any hovered/selected job markers that might otherwise inherit the
      // just-cleared composer's coordinates. Without this, the P/D pins the
      // dispatcher placed during composing sometimes stick around because a
      // same-tick hoveredJobId update kept jobMarkersAndRoute truthy.
      setDirectionsRoute(null);
      setAlternativeRoutes([]);
      setSelectedRouteIndex(0);
      lastFetchedRouteKeyRef.current = '';
      const store = useDispatchStore.getState();
      if (store.hoveredJobId) store.setHoveredJobId(null);
      if (store.selectedJobId) store.selectJob(null);
    }
    prevJobDraftRef.current = jobDraft;
  }, [jobDraft]);


  // 📍 Dispatcher's own location via browser Geolocation
  const [dispatcherLocation, setDispatcherLocation] = useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (pos) => setDispatcherLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn('Dispatcher geolocation error:', err.message),
      { enableHighAccuracy: false, timeout: 10000 }
    );
    // Watch for updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setDispatcherLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 }
    );
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);
  const googleMaps =
    typeof window !== "undefined" ? (window as any)?.google?.maps : null;

  // 🌙 Dark mode map styles
  const darkMapStyles: google.maps.MapTypeStyle[] = [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
    { featureType: "poi.business", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
    { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
    { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
    { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
  ];

  const lightMapStyles: google.maps.MapTypeStyle[] = [
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  ];

  // 🗺️ Map Configuration with Enhanced Options
  const mapOptions: google.maps.MapOptions = useMemo(() => ({
    disableDefaultUI: false,
    // While the dispatcher is in "pick on map" mode we disable POI click
    // interception — otherwise clicking a labelled place fires a placeIcon
    // event instead of the generic `click`, and the address never lands on
    // the form. Also swap to a crosshair cursor so the affordance is obvious.
    clickableIcons: !mapPickMode,
    scrollwheel: true,
    disableDoubleClickZoom: false,
    mapTypeControl: true,
    streetViewControl: true,
    fullscreenControl: true,
    gestureHandling: 'greedy',
    draggableCursor: mapPickMode ? 'crosshair' : undefined,
    styles: isDark ? darkMapStyles : lightMapStyles,
  }), [isDark, mapPickMode]);

  // 🎯 Map Center - ZONES ONLY (never drivers)
  const mapCenter = useMemo(() => {
    // ALWAYS prioritize zones - NEVER use driver location
    if (zones.length > 0) {
      const allPoints: { lat: number; lng: number }[] = [];
      for (const zone of zones) {
        if (zone.polygon && zone.polygon.length > 0) {
          for (const coord of zone.polygon) {
            allPoints.push({ lat: coord.lat, lng: coord.lng });
          }
        }
      }

      if (allPoints.length > 0) {
        // Calculate center of all zone points
        const avgLat = allPoints.reduce((sum, p) => sum + p.lat, 0) / allPoints.length;
        const avgLng = allPoints.reduce((sum, p) => sum + p.lng, 0) / allPoints.length;
        return { lat: avgLat, lng: avgLng };
      }
    }

    // Fallback: Use default coordinates (NEVER drivers)
    return { lat: 25.2854, lng: 51.531 };
  }, [zones]);

  // Extract stable primitives from jobDraft to avoid re-renders when map updates jobDraft
  const draftPickupLat = jobDraft?.pickup?.latitude;
  const draftPickupLng = jobDraft?.pickup?.longitude;
  const draftPickupAddr = jobDraft?.pickup?.address;
  const draftDropoffLat = jobDraft?.dropoff?.latitude;
  const draftDropoffLng = jobDraft?.dropoff?.longitude;
  const draftDropoffAddr = jobDraft?.dropoff?.address;
  const draftRoutePath = jobDraft?.routePath;
  // Serialize stops to a stable string so useMemo only fires on real stop changes
  const draftStopsKey = useMemo(() => {
    if (!jobDraft?.stops?.length) return '';
    return jobDraft.stops
      .filter((s: any) => s.latitude && s.longitude)
      .map((s: any) => `${s.latitude},${s.longitude}`)
      .join('|');
  }, [jobDraft?.stops]);
  const draftStops = jobDraft?.stops;

  // 📍 Job Markers & Routes - Show on hover or when creating/editing
  const jobMarkersAndRoute = useMemo(() => {
    // Helper to safely get address string
    const getAddressStr = (addr: any): string => {
      if (!addr) return '';
      if (typeof addr === 'string') return addr;
      if (addr.address) return addr.address;
      if (addr.formattedAddress) return addr.formattedAddress;
      return '';
    };
    
    // Determine which job to show
    let jobToShow: {
      pickup: { lat: number; lng: number };
      dropoff: { lat: number; lng: number } | null;
      pickupAddress: string;
      dropoffAddress: string | null;
      routePath: any;
      isDraft: boolean;
    } | null = null;
    
    // Priority: Job draft (creating/editing) > Hovered job (eye-icon preview).
    // selectedJobId DOES NOT drive marker rendering — that's a click-to-focus
    // signal, not a "show route" signal. Previously the un-hover handler only
    // cleared hoveredJobId, so if the dispatcher had clicked a job badge
    // earlier (which sets selectedJobId), the pickup/dropoff pins stayed
    // glued to the map until they explicitly clicked something else. Eye =
    // hover-only preview is the dispatcher's mental model.
    if (draftPickupLat && draftPickupLng) {
      // Handle optional dropoff for drafts
      const hasDropoff = !!(draftDropoffLat && draftDropoffLng);
      jobToShow = {
        pickup: { lat: draftPickupLat, lng: draftPickupLng },
        dropoff: hasDropoff
          ? { lat: draftDropoffLat!, lng: draftDropoffLng! }
          : null,
        pickupAddress: draftPickupAddr || 'Draft Pickup',
        dropoffAddress: hasDropoff ? (draftDropoffAddr || 'Draft Dropoff') : null,
        routePath: hasDropoff ? draftRoutePath : null,
        isDraft: true,
      };
    } else if (hoveredJobId) {
      const job = jobs.find(j => j.id === hoveredJobId);

      // Check for pickup coordinates - support both pickupLocation and pickupLat/pickupLng
      const hasPickupLocation = job?.pickupLocation?.latitude && job?.pickupLocation?.longitude;
      const hasPickupLatLng = job?.pickupLat != null && job?.pickupLng != null;

      if (hasPickupLocation || hasPickupLatLng) {
        
        // Get pickup coordinates
        const pickupLat = hasPickupLocation ? job.pickupLocation!.latitude : job!.pickupLat!;
        const pickupLng = hasPickupLocation ? job.pickupLocation!.longitude : job!.pickupLng!;
        
        // Handle dropoff coordinates - support both formats
        const hasDropoffLocation = job?.dropoffLocation?.latitude && job?.dropoffLocation?.longitude;
        const hasDropoffLatLng = job?.dropoffLat != null && job?.dropoffLng != null;
        const hasDropoff = hasDropoffLocation || hasDropoffLatLng;
        
        const dropoffLat = hasDropoffLocation ? job.dropoffLocation!.latitude : job?.dropoffLat;
        const dropoffLng = hasDropoffLocation ? job.dropoffLocation!.longitude : job?.dropoffLng;
        
        jobToShow = {
          pickup: { lat: pickupLat, lng: pickupLng },
          dropoff: hasDropoff && dropoffLat != null && dropoffLng != null
            ? { lat: dropoffLat, lng: dropoffLng }
            : null,
          pickupAddress: getAddressStr(job.pickupAddress) || 'Pickup',
          dropoffAddress: hasDropoff ? (getAddressStr(job.dropoffAddress) || 'Dropoff') : null,
          routePath: hasDropoff ? job.routePath : null,
          isDraft: false,
        };
      } else {
        console.warn('⚠️ Job missing pickup coordinates:', job);
      }
    }
    
    if (!jobToShow) return null;
    
    // Prepare route path (only if we have both pickup and dropoff)
    let routeCoordinates: Array<{ lat: number; lng: number }> = [];
    if (jobToShow.dropoff) {
      if (jobToShow.routePath && jobToShow.routePath.length >= 2) {
        routeCoordinates = jobToShow.routePath.map((coord: any) => ({
          lat: coord.latitude || coord.lat,
          lng: coord.longitude || coord.lng,
        }));
      } else {
        // Straight line between pickup and dropoff
        routeCoordinates = [jobToShow.pickup, jobToShow.dropoff];
      }
    }
    
    return {
      pickup: jobToShow.pickup,
      dropoff: jobToShow.dropoff, // Can be null now
      pickupAddress: jobToShow.pickupAddress,
      dropoffAddress: jobToShow.dropoffAddress, // Can be null now
      route: routeCoordinates,
      isDraft: jobToShow.isDraft,
      hasDropoff: !!jobToShow.dropoff,
      stops: (() => {
        // For draft jobs, get stops from draftStops
        if (jobToShow.isDraft && draftStops) {
          return draftStops
            .filter((s: any) => s.latitude && s.longitude)
            .map((s: any, i: number) => ({ lat: s.latitude, lng: s.longitude, label: String(i + 1) }));
        }
        // For hovered jobs, get stops from job.requirements.stops
        const job = jobs.find(j => j.id === hoveredJobId);
        if (job?.requirements?.stops?.length) {
          return job.requirements.stops
            .filter((s: any) => s.latitude && s.longitude)
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((s: any, i: number) => ({ lat: s.latitude, lng: s.longitude, label: String(i + 1) }));
        }
        return [];
      })(),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPickupLat, draftPickupLng, draftPickupAddr, draftDropoffLat, draftDropoffLng, draftDropoffAddr, draftStopsKey, hoveredJobId, jobs]);

  // 🚗 Driver Markers - Filter drivers with valid positions AND online status
  // Note: runs on every `drivers` array update (i.e. every location tick).
  // Intentionally quiet — logging here spams the console every 5s.
  const driversWithLocation = useMemo(() => {
    return drivers.filter(d => {
      const hasPosition = d.position && d.position.latitude && d.position.longitude;
      const isOnline = d.status !== 'OFFLINE';
      return hasPosition && isOnline;
    });
  }, [drivers]);

  // 🎮 Map Event Handlers
  const handleMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
    console.log('🗺️ Google Maps loaded');

    // Prefer driver positions for the initial view — the dispatcher wants
    // to see where the fleet is, not a zoomed-out country view. Fall back
    // to zones when no drivers have a known location yet.
    setTimeout(() => {
      const driverPoints = drivers
        .map((d: any) => ({
          // DispatchDriver puts coords on `position`; some call paths also
          // write a flat lat/lng. Accept every shape so a missed mapping
          // doesn't silently strip drivers from the bounds.
          lat:
            d?.position?.latitude ??
            d?.location?.latitude ??
            d?.latitude ??
            null,
          lng:
            d?.position?.longitude ??
            d?.location?.longitude ??
            d?.longitude ??
            null,
        }))
        .filter(
          (p: any) =>
            typeof p.lat === 'number' &&
            typeof p.lng === 'number' &&
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lng),
        );

      if (driverPoints.length > 0) {
        const includeDispatcher = dispatcherLocation != null;
        console.log(
          `🗺️ Auto-focusing on ${driverPoints.length} driver(s)${includeDispatcher ? ' + dispatcher' : ''}`,
        );
        const bounds = new google.maps.LatLngBounds();
        for (const p of driverPoints) bounds.extend({ lat: p.lat, lng: p.lng });
        if (includeDispatcher) bounds.extend(dispatcherLocation!);
        map.fitBounds(bounds, 80);
        // Single-point fit (one driver, no dispatcher) zooms in far too
        // close; clamp to a sensible city zoom so the dispatcher still
        // sees context.
        if (driverPoints.length === 1 && !includeDispatcher) {
          const listener = google.maps.event.addListenerOnce(
            map,
            'idle',
            () => {
              const z = map.getZoom();
              if (typeof z === 'number' && z > 14) map.setZoom(14);
            },
          );
          setTimeout(() => google.maps.event.removeListener(listener), 3000);
        }
        return;
      }

      if (zones.length > 0) {
        console.log('🗺️ No drivers with location yet — fitting zones instead');
        const allPoints: { lat: number; lng: number }[] = [];
        for (const zone of zones) {
          if (zone.polygon && zone.polygon.length > 0) {
            for (const coord of zone.polygon) {
              allPoints.push({ lat: coord.lat, lng: coord.lng });
            }
          }
        }
        if (allPoints.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          for (const point of allPoints) bounds.extend(point);
          map.fitBounds(bounds, 50);
        }
      }
    }, 800);
  }, [drivers, zones, dispatcherLocation]);

  // Marker click handlers removed - zones only

  // 🎯 Recenter Map to Show All Zones
  const handleRecenterMap = useCallback(() => {
    if (!map || zones.length === 0) return;
    
    console.log('🎯 Recentering map to show all zones');
    
    // Collect all zone points
    const allPoints: { lat: number; lng: number }[] = [];
    for (const zone of zones) {
      if (zone.polygon && zone.polygon.length > 0) {
        for (const coord of zone.polygon) {
          allPoints.push({ lat: coord.lat, lng: coord.lng });
        }
      }
    }
    
    if (allPoints.length === 0) {
      console.warn('⚠️ No zone points found');
      return;
    }
    
    // Create bounds and extend for all points
    const bounds = new google.maps.LatLngBounds();
    for (const point of allPoints) {
      bounds.extend({ lat: point.lat, lng: point.lng });
    }
    
    // Fit map to bounds with padding
    map.fitBounds(bounds, 50);
    
    console.log('✅ Map recentered to show all zones');
  }, [map, zones]);

  // Explicit zoom controls — the default Google Maps zoom widget is small
  // and disappears below other chrome on compact layouts. A dedicated
  // +/- stack is faster for dispatchers working with a zoomed-out fleet
  // view.
  const handleZoomIn = useCallback(() => {
    if (!map) return;
    const z = map.getZoom();
    if (typeof z === 'number') map.setZoom(Math.min(21, z + 1));
  }, [map]);
  const handleZoomOut = useCallback(() => {
    if (!map) return;
    const z = map.getZoom();
    if (typeof z === 'number') map.setZoom(Math.max(2, z - 1));
  }, [map]);

  // Fit the map to all drivers whenever:
  //   • the very first driver location arrives after a zones-only fit, or
  //   • the Create-Job composer opens (dispatcher wants to see fleet while
  //     picking pickup/dropoff — wider zone view is unhelpful here).
  // Skip while mapPickMode is active (the dispatcher is mid-click; don't
  // yank the camera out from under them) or when a specific zone/driver is
  // already focused.
  const hasFittedDriversRef = useRef(false);
  useEffect(() => {
    if (!map) return;
    if (mapPickMode) return;
    if (focusedZoneId || focusedDriverId) return;

    const driverPoints = drivers
      .map((d: any) => ({
        lat:
          d?.position?.latitude ??
          d?.location?.latitude ??
          d?.latitude ??
          null,
        lng:
          d?.position?.longitude ??
          d?.location?.longitude ??
          d?.longitude ??
          null,
      }))
      .filter(
        (p: any) =>
          typeof p.lat === 'number' &&
          typeof p.lng === 'number' &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng),
      );
    if (driverPoints.length === 0) return;

    // Refit when composer opens (every time) OR when drivers first appear.
    const shouldFit = jobComposerOpen || !hasFittedDriversRef.current;
    if (!shouldFit) return;
    hasFittedDriversRef.current = true;

    const bounds = new google.maps.LatLngBounds();
    for (const p of driverPoints) bounds.extend({ lat: p.lat, lng: p.lng });
    const includeDispatcher = dispatcherLocation != null;
    if (includeDispatcher) bounds.extend(dispatcherLocation!);
    map.fitBounds(bounds, 80);
    if (driverPoints.length === 1 && !includeDispatcher) {
      const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
        const z = map.getZoom();
        if (typeof z === 'number' && z > 14) map.setZoom(14);
      });
      setTimeout(() => google.maps.event.removeListener(listener), 3000);
    }
  }, [map, drivers, jobComposerOpen, mapPickMode, focusedZoneId, focusedDriverId, dispatcherLocation]);

  // 🎯 Focus on specific zone when clicked
  useEffect(() => {
    if (!map || !focusedZoneId || zones.length === 0) return;
    
    const zone = zones.find(z => z.id === focusedZoneId);
    if (!zone || !zone.polygon || zone.polygon.length < 3) return;
    
    console.log('🎯 Focusing on zone:', zone.name);
    
    // Create bounds for this zone
    const bounds = new google.maps.LatLngBounds();
    for (const coord of zone.polygon) {
      bounds.extend({ lat: coord.lat, lng: coord.lng });
    }
    
    // Fit map to this zone's bounds
    map.fitBounds(bounds, 50);
    console.log('✅ Zone focused on map');
  }, [focusedZoneId, map, zones]);

  // 🎯 Focus on driver when clicked
  // IMPORTANT: this must only fire when the dispatcher explicitly focuses a
  // driver (focusedDriverId changes), NOT on every driver location tick.
  // Reading `drivers` via getState() avoids re-triggering zoom every 5s.
  const lastFocusedDriverIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!map) return;

    // Driver was unfocused
    if (!focusedDriverId) {
      lastFocusedDriverIdRef.current = null;
      return;
    }

    // Already focused on this driver — don't re-pan/zoom on location updates
    if (lastFocusedDriverIdRef.current === focusedDriverId) return;

    const driver = useDispatchStore
      .getState()
      .drivers.find(d => d.id === focusedDriverId);
    if (!driver || !driver.position) {
      console.warn('⚠️ Driver has no position');
      return;
    }

    console.log('🎯 Focusing on driver:', driver.name);
    map.panTo({
      lat: driver.position.latitude,
      lng: driver.position.longitude,
    });
    map.setZoom(16);
    lastFocusedDriverIdRef.current = focusedDriverId;
    console.log('✅ Driver focused on map');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedDriverId, map]);

  // Clear directions route whenever job markers change or disappear
  useEffect(() => {
    if (!jobMarkersAndRoute) {
      // Job cleared — remove route and alternatives immediately
      setDirectionsRoute(null);
      setAlternativeRoutes([]);
      setSelectedRouteIndex(0);
    } else {
      // Job changed — clear old route (new one will be fetched by auto-focus effect)
      setDirectionsRoute(null);
      setAlternativeRoutes([]);
      setSelectedRouteIndex(0);
    }
  }, [jobMarkersAndRoute]);

  // 🎯 Auto-focus on job markers when they appear, return to zones when cleared
  useEffect(() => {
    if (!map || !googleMaps) return;
    
    // If job markers disappeared (hover ended / draft cleared), return to all-zones view
    if (!jobMarkersAndRoute && prevJobMarkersRef.current) {
      prevJobMarkersRef.current = null;
      lastFetchedRouteKeyRef.current = '';
      setDirectionsRoute(null);
      setAlternativeRoutes([]);
      setSelectedRouteIndex(0);
      if (zones.length > 0) {
        handleRecenterMap();
      }
      return;
    }
    
    if (!jobMarkersAndRoute) return;
    prevJobMarkersRef.current = jobMarkersAndRoute;

    // Camera-control rule: only auto-pan/zoom when this came from the
    // composer's pickup/dropoff selection (`isDraft = true`). Hover/eye
    // previews and any indirect re-renders triggered by driver activity
    // events (accept / on-the-way / arrived) must NOT yank the camera —
    // dispatchers complained that every status update re-focused the map
    // on the job marker, throwing them off whatever they were watching.
    // Markers themselves still render; the map just doesn't move.
    if (!jobMarkersAndRoute.isDraft) {
      return;
    }

    // Create bounds that include all points
    const bounds = new googleMaps.LatLngBounds();
    bounds.extend(jobMarkersAndRoute.pickup);

    if (jobMarkersAndRoute.dropoff) {
      bounds.extend(jobMarkersAndRoute.dropoff);
    }

    // Include stops in bounds
    if (jobMarkersAndRoute.stops?.length > 0) {
      for (const stop of jobMarkersAndRoute.stops) {
        bounds.extend({ lat: stop.lat, lng: stop.lng });
      }
    }

    if (jobMarkersAndRoute.dropoff || jobMarkersAndRoute.stops?.length > 0) {
      map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
      // After fitBounds, check if we can zoom in more (max zoom 15)
      google.maps.event.addListenerOnce(map, 'idle', () => {
        const currentZoom = map.getZoom();
        if (currentZoom && currentZoom > 16) {
          map.setZoom(16);
        }
      });
    } else {
      map.panTo(jobMarkersAndRoute.pickup);
      map.setZoom(15);
    }
    
    // Fetch road route from OSRM (free, no API key needed)
    if (jobMarkersAndRoute.dropoff) {
      const origin = jobMarkersAndRoute.pickup;
      const destination = jobMarkersAndRoute.dropoff;
      const waypoints = (jobMarkersAndRoute.stops || []).map((s: any) => ({
        lat: s.lat,
        lng: s.lng,
      }));

      // Build a key from coordinates to detect real changes (prevents infinite loop
      // when updateJobDraft triggers jobDraft change which recomputes jobMarkersAndRoute)
      const routeKey = `${origin.lat},${origin.lng}-${destination.lat},${destination.lng}-${waypoints.map((w: any) => `${w.lat},${w.lng}`).join('|')}-${jobMarkersAndRoute.isDraft}`;

      // For drafts (new/edit job), fetch alternatives; for hover/existing, single route
      if (jobMarkersAndRoute.isDraft) {
        // Skip if we already fetched for these exact coordinates
        if (lastFetchedRouteKeyRef.current === routeKey) return;
        lastFetchedRouteKeyRef.current = routeKey;

        // OSRM alternatives don't work correctly with waypoints (intermediate stops)
        // — it returns routes that ignore waypoint ordering. Only request alternatives
        // when there are no stops; otherwise use single-route mode.
        const hasWaypoints = waypoints.length > 0;
        const routePromise = hasWaypoints
          ? getRoute(origin, destination, waypoints).then(r => ({ routes: [r], selectedIndex: 0 }))
          : getRouteWithAlternatives(origin, destination, []);

        routePromise
          .then((result) => {
            // If the dispatcher already submitted/closed the composer while
            // this OSRM fetch was in flight, the draft has been cleared —
            // writing routes back into a fresh empty draft would resurrect
            // jobDraft as a non-null object (with no pickup) and could keep
            // the map's auto-focus logic confused. Bail out cleanly.
            if (!useDispatchStore.getState().jobDraft) return;
            setAlternativeRoutes(result.routes);
            setSelectedRouteIndex(0);
            if (result.routes.length > 0) {
              setDirectionsRoute(result.routes[0].path);
              // Push selected route distance to store so fare calc can use it
              updateJobDraft({
                alternativeRoutes: result.routes.map(r => ({ path: r.path, distance: r.distance, duration: r.duration })),
                selectedRouteIndex: 0,
                selectedRouteDistance: result.routes[0].distance,
                selectedRouteDuration: result.routes[0].duration,
              });
            }
          })
          .catch(() => {
            setDirectionsRoute(null);
            setAlternativeRoutes([]);
          });
      } else {
        getRoute(origin, destination, waypoints)
          .then((result) => {
            setDirectionsRoute(result.path);
            setAlternativeRoutes([]);
          })
          .catch(() => {
            setDirectionsRoute(null);
            setAlternativeRoutes([]);
          });
      }
    } else {
      setDirectionsRoute(null);
      setAlternativeRoutes([]);
      lastFetchedRouteKeyRef.current = '';
    }
  }, [jobMarkersAndRoute, map, googleMaps, zones, handleRecenterMap]);

  // Handler for selecting an alternative route by clicking it
  const handleSelectAlternativeRoute = useCallback((index: number) => {
    if (index >= 0 && index < alternativeRoutes.length) {
      setSelectedRouteIndex(index);
      setDirectionsRoute(alternativeRoutes[index].path);
      updateJobDraft({
        selectedRouteIndex: index,
        selectedRouteDistance: alternativeRoutes[index].distance,
        selectedRouteDuration: alternativeRoutes[index].duration,
      });
    }
  }, [alternativeRoutes, updateJobDraft]);

  return (
    <div className="relative h-full w-full">
      {/* Pick-on-map banner — while the dispatcher has "Pick on map" active
          on the Create-Job composer, show a top banner so it's obvious the
          map is waiting for a click, and expose an Escape affordance. */}
      {mapPickMode && (
        <div
          className="absolute left-1/2 top-3 z-[1200] flex -translate-x-1/2 items-center gap-2 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
        >
          <span>
            📍 Click the map to set{' '}
            {mapPickMode.target === 'pickup'
              ? 'pickup'
              : mapPickMode.target === 'dropoff'
                ? 'dropoff'
                : `stop ${((mapPickMode as any)?.index ?? 0) + 1}`}
          </span>
          <button
            type="button"
            onClick={() => setMapPickMode(null)}
            className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 hover:bg-white/30"
          >
            ✕
          </button>
        </div>
      )}
      <LoadScript
        googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}
        libraries={libraries}
        onLoad={() => {
          console.log('✅ Google Maps API loaded');
          setIsGoogleLoaded(true);
        }}
        loadingElement={
          <div className="flex h-full items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading Enhanced Maps...</p>
            </div>
          </div>
        }
      >
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={mapCenter}
          zoom={zones.length > 0 ? 10 : 13}
          options={mapOptions}
          onLoad={handleMapLoad}
          onClick={async (e) => {
            // Map-pick flow for the Create-Job composer: when the dispatcher
            // flipped "pick on map" next to a field, the next map click
            // reverse-geocodes and publishes a one-shot `mapPickResult` that
            // the composer consumes. Ignored outside pick mode so normal map
            // clicks don't stomp on the form.
            if (!mapPickMode || !e.latLng) return;
            const latitude = e.latLng.lat();
            const longitude = e.latLng.lng();
            let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            try {
              const geocoder = new (window as any).google.maps.Geocoder();
              const { results } = await geocoder.geocode({
                location: { lat: latitude, lng: longitude },
              });
              if (results && results.length > 0) {
                address = results[0].formatted_address || address;
              }
            } catch (err) {
              console.warn('[map-pick] reverse geocode failed', err);
            }
            const target = mapPickMode.target;
            setMapPickResult({
              target,
              stopIndex: target === 'stop' ? (mapPickMode as any).index : undefined,
              address,
              latitude,
              longitude,
            });
            setMapPickMode(null);
          }}
        >
          {/* Traffic Layer */}
          {mapState.showTraffic && <TrafficLayer />}

          {/* Customer-demand heatmap — one warm circle per density bucket
              (Google's HeatmapLayer was removed in Maps JS API v3.65). */}
          {mapState.showHeatmap && heatmapBuckets.map((b, idx) => {
            const color = heatColor(b.weight);
            const radius = 350 + b.weight * 160; // metres, grows with demand
            return (
              <Circle
                key={`heat-${idx}`}
                center={{ lat: b.lat, lng: b.lng }}
                radius={radius}
                options={{
                  strokeColor: color, strokeOpacity: 0.35, strokeWeight: 1,
                  fillColor: color, fillOpacity: 0.28, clickable: false, zIndex: 1,
                }}
              />
            );
          })}

          {/* Zone Polygons */}
          {zones.map(zone => {
            if (!zone.polygon || zone.polygon.length < 3) return null;
            
            // Check if this zone is focused or hovered
            const isFocused = focusedZoneId === zone.id;
            const isHovered = hoveredZoneId === zone.id;
            const isHighlighted = isFocused || isHovered;
            
            return (
              <Polygon
                key={`zone-${zone.id}`}
                path={zone.polygon.map(coord => ({
                  lat: coord.lat,
                  lng: coord.lng,
                }))}
                options={{
                  // Balanced visibility - not too light, not too dark
                  fillColor: isHighlighted ? '#3b82f6' : '#60a5fa', // Bright blue when highlighted, medium blue normally
                  fillOpacity: isHighlighted ? 0.35 : 0.15, // More visible when highlighted, visible but subtle normally
                  strokeColor: isHighlighted ? '#1d4ed8' : '#3b82f6', // Dark blue when highlighted, medium blue normally
                  strokeWeight: isHighlighted ? 4 : 2, // Thicker when highlighted, medium normally
                  strokeOpacity: isHighlighted ? 1 : 0.7, // Fully opaque when highlighted, mostly visible normally
                  // While the dispatcher is in "Pick on map" mode the polygon
                  // must NOT intercept clicks — otherwise clicking inside a
                  // zone swallows the event and the map's onClick handler
                  // never fires, so the pin never drops. Flip clickable off
                  // during pick mode (and on normally so zone click features
                  // keep working).
                  clickable: !mapPickMode,
                }}
              />
            );
          })}
          
          {/* Alternative Route Lines - grey with border, clickable */}
          {jobMarkersAndRoute?.hasDropoff && jobMarkersAndRoute.isDraft && alternativeRoutes.length > 1 && isGoogleLoaded && googleMaps && (
            alternativeRoutes.map((altRoute, idx) => {
              if (idx === selectedRouteIndex) return null;
              return (
                <React.Fragment key={`alt-route-${idx}`}>
                  {/* Alt route border */}
                  <Polyline
                    path={altRoute.path}
                    options={{
                      strokeColor: '#64748b',
                      strokeWeight: 7,
                      strokeOpacity: 0.3,
                      clickable: !mapPickMode,
                      zIndex: 1,
                    }}
                    onClick={() => !mapPickMode && handleSelectAlternativeRoute(idx)}
                  />
                  {/* Alt route fill */}
                  <Polyline
                    path={altRoute.path}
                    options={{
                      strokeColor: '#94a3b8',
                      strokeWeight: 4,
                      strokeOpacity: 0.5,
                      clickable: !mapPickMode,
                      zIndex: 2,
                    }}
                    onClick={() => !mapPickMode && handleSelectAlternativeRoute(idx)}
                  />
                </React.Fragment>
              );
            })
          )}

          {/* Alternative Route Distance Labels */}
          {jobMarkersAndRoute?.hasDropoff && jobMarkersAndRoute.isDraft && alternativeRoutes.length > 1 && isGoogleLoaded && googleMaps && (
            alternativeRoutes.map((altRoute, idx) => {
              if (idx === selectedRouteIndex) return null;
              // Place label at ~40% of the route path
              const midIdx = Math.floor(altRoute.path.length * 0.4);
              const midPoint = altRoute.path[midIdx] || altRoute.path[0];
              const distKm = (altRoute.distance / 1000).toFixed(1);
              return (
                <Marker
                  key={`alt-label-${idx}`}
                  position={midPoint}
                  icon={{
                    url: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="28"><rect rx="6" width="72" height="28" fill="#1e293b" fill-opacity="0.85"/><text x="36" y="19" text-anchor="middle" fill="#e2e8f0" font-size="12" font-family="Arial,sans-serif" font-weight="600">${distKm} km</text></svg>`)}`,
                    scaledSize: new googleMaps.Size(72, 28),
                    anchor: new googleMaps.Point(36, 14),
                  }}
                  clickable={!mapPickMode}
                  onClick={() => !mapPickMode && handleSelectAlternativeRoute(idx)}
                  zIndex={500}
                />
              );
            })
          )}

          {/* Job Route Line - Google Maps-style with dark border + colored fill */}
          {jobMarkersAndRoute?.hasDropoff && directionsRoute && directionsRoute.length >= 2 && isGoogleLoaded && googleMaps && (
            <>
              {/* Dark border/outline polyline (drawn behind) */}
              <Polyline
                path={directionsRoute}
                options={{
                  strokeColor: jobMarkersAndRoute.isDraft ? '#4c1d95' : '#1e3a5f',
                  strokeWeight: 8,
                  strokeOpacity: 0.7,
                  zIndex: 9,
                }}
              />
              {/* Main colored route polyline (drawn on top) */}
              <Polyline
                path={directionsRoute}
                options={{
                  strokeColor: jobMarkersAndRoute.isDraft ? '#7c3aed' : '#4285F4',
                  strokeWeight: 5,
                  strokeOpacity: 1,
                  zIndex: 10,
                  icons: [{
                    icon: {
                      path: googleMaps.SymbolPath.FORWARD_OPEN_ARROW,
                      scale: 2.5,
                      strokeColor: '#ffffff',
                      strokeWeight: 2,
                      strokeOpacity: 0.9,
                    },
                    offset: '15%',
                    repeat: '120px',
                  }],
                }}
              />
            </>
          )}

          {/* White dot markers at intermediate stops on the route */}
          {isGoogleLoaded && googleMaps && directionsRoute && jobMarkersAndRoute?.stops?.map((stop: any, i: number) => (
            <Marker
              key={`stop-dot-${i}`}
              position={{ lat: stop.lat, lng: stop.lng }}
              icon={{
                path: googleMaps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: '#ffffff',
                fillOpacity: 1,
                strokeColor: jobMarkersAndRoute.isDraft ? '#7c3aed' : '#4285F4',
                strokeWeight: 3,
              }}
              zIndex={500}
              clickable={false}
            />
          ))}
          
          {/* Job Pickup Marker - GREEN */}
          {isGoogleLoaded && googleMaps && jobMarkersAndRoute && (
            <Marker
              position={jobMarkersAndRoute.pickup}
              icon={{
                url: `data:image/svg+xml;base64,${btoa('<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg"><path d="M20 50 C20 50 38 32 38 18 C38 8 30 0 20 0 C10 0 2 8 2 18 C2 32 20 50 20 50Z" fill="#16a34a" stroke="white" stroke-width="2"/><circle cx="20" cy="18" r="11" fill="white"/><text x="20" y="23" text-anchor="middle" fill="#16a34a" font-size="14" font-weight="bold">P</text></svg>')}`,
                scaledSize: new googleMaps.Size(40, 52),
                anchor: new googleMaps.Point(20, 50),
              }}
              title={`📍 ${jobMarkersAndRoute.pickupAddress}`}
              zIndex={1000}
            />
          )}
          
          {/* Job Dropoff Marker - RED */}
          {isGoogleLoaded && googleMaps && jobMarkersAndRoute && jobMarkersAndRoute.dropoff && (
            <Marker
              position={jobMarkersAndRoute.dropoff}
              icon={{
                url: `data:image/svg+xml;base64,${btoa('<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg"><path d="M20 50 C20 50 38 32 38 18 C38 8 30 0 20 0 C10 0 2 8 2 18 C2 32 20 50 20 50Z" fill="#dc2626" stroke="white" stroke-width="2"/><circle cx="20" cy="18" r="11" fill="white"/><text x="20" y="23" text-anchor="middle" fill="#dc2626" font-size="14" font-weight="bold">D</text></svg>')}`,
                scaledSize: new googleMaps.Size(40, 52),
                anchor: new googleMaps.Point(20, 50),
              }}
              title={`🎯 ${jobMarkersAndRoute.dropoffAddress || 'Dropoff'}`}
              zIndex={999}
            />
          )}
          
          {/* Stop Markers - AMBER numbered */}
          {isGoogleLoaded && googleMaps && jobMarkersAndRoute?.stops?.map((stop: any, i: number) => (
            <Marker
              key={`stop-marker-${i}`}
              position={{ lat: stop.lat, lng: stop.lng }}
              icon={{
                url: `data:image/svg+xml;base64,${btoa(`<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg"><path d="M18 44 C18 44 34 28 34 16 C34 7 27 0 18 0 C9 0 2 7 2 16 C2 28 18 44 18 44Z" fill="#f59e0b" stroke="white" stroke-width="2"/><circle cx="18" cy="16" r="10" fill="white"/><text x="18" y="21" text-anchor="middle" fill="#d97706" font-size="14" font-weight="bold">${stop.label}</text></svg>`)}`,
                scaledSize: new googleMaps.Size(36, 46),
                anchor: new googleMaps.Point(18, 44),
              }}
              title={`Stop ${stop.label}`}
              zIndex={998}
            />
          ))}
          
          {/* 📍 Dispatcher Location Marker */}
          {isGoogleLoaded && googleMaps && dispatcherLocation && (
            <Marker
              position={dispatcherLocation}
              icon={{
                path: googleMaps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: '#3b82f6',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
              }}
              title="Your Location (Dispatcher)"
              zIndex={1000}
            />
          )}

          {/* Driver Vehicle Markers - memoized so only position changes re-apply on location ticks */}
          {isGoogleLoaded && driversWithLocation.map((driver) => (
            <DriverMarker
              key={`driver-${driver.id}`}
              driver={driver}
              isFocused={focusedDriverId === driver.id}
            />
          ))}
        </GoogleMap>
      </LoadScript>
      
      {/* Control Panel */}
      <ControlPanel
        mapState={mapState}
        setMapState={setMapState}
        onRecenterMap={handleRecenterMap}
        isDark={isDark}
      />

      {/* Zoom controls — a compact +/- stack pinned top-right below the
          Map Controls panel. Explicit over the default Google zoom widget
          because the default disappears under other chrome on narrow
          dispatcher layouts. */}
      <div
        className={classNames(
          'absolute right-2 sm:right-3 top-40 sm:top-44 z-10 flex flex-col overflow-hidden rounded-md shadow-lg',
          isDark ? 'border border-slate-700 bg-slate-800' : 'bg-white',
        )}
      >
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
          className={classNames(
            'flex h-8 w-8 items-center justify-center transition',
            isDark
              ? 'text-slate-200 hover:bg-slate-700'
              : 'text-slate-700 hover:bg-slate-100',
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
        <div
          className={classNames(
            'h-px',
            isDark ? 'bg-slate-700' : 'bg-slate-200',
          )}
        />
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
          className={classNames(
            'flex h-8 w-8 items-center justify-center transition',
            isDark
              ? 'text-slate-200 hover:bg-slate-700'
              : 'text-slate-700 hover:bg-slate-100',
          )}
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>

      {/* Status Bar removed - zones only */}
    </div>
  );
};

// Helper functions removed - zones only

export default DispatchMapGoogle;
