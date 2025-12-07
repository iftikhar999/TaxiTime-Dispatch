import {
    GoogleMap,
    LoadScript,
    Marker,
    Polygon,
    Polyline,
    TrafficLayer,
} from '@react-google-maps/api';
import classNames from 'classnames';
import { Navigation, Settings, Target } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
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
    focusedZoneId,
    hoveredZoneId,
    hoveredJobId,
    selectedJobId,
    focusedDriverId,
    focusZone,
    focusDriver,
  } = useDispatchStore();

  // Enhanced map state
  const [mapState, setMapState] = useState<AdvancedMapState>({
    showTraffic: true,
    showHeatmap: false,
    showClusters: true,
    showStreetView: false,
    viewMode: 'normal',
    heatmapData: 'demand',
  });

  // Map instance
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
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
    clickableIcons: true,
    scrollwheel: true,
    disableDoubleClickZoom: false,
    mapTypeControl: true,
    streetViewControl: true,
    fullscreenControl: true,
    gestureHandling: 'greedy',
    styles: isDark ? darkMapStyles : lightMapStyles,
  }), [isDark]);

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
        console.log('📍 Map center from zones:', { lat: avgLat, lng: avgLng });
        return { lat: avgLat, lng: avgLng };
      }
    }
    
    // Fallback: Use default coordinates (NEVER drivers)
    console.log('📍 Using default center (no zones yet)');
    return { lat: 25.2854, lng: 51.531 };
  }, [zones]);

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
    
    // Priority: Job draft (creating/editing) > Hovered job > Selected job
    if (jobDraft?.pickup) {
      console.log('📦 Showing draft job markers');
      // Handle optional dropoff for drafts
      const dropoffData = jobDraft.dropoff;
      const hasDropoff = !!(dropoffData?.latitude && dropoffData?.longitude);
      jobToShow = {
        pickup: { lat: jobDraft.pickup.latitude, lng: jobDraft.pickup.longitude },
        dropoff: hasDropoff && dropoffData
          ? { lat: dropoffData.latitude, lng: dropoffData.longitude }
          : null,
        pickupAddress: jobDraft.pickup.address || 'Draft Pickup',
        dropoffAddress: hasDropoff && dropoffData ? (dropoffData.address || 'Draft Dropoff') : null,
        routePath: hasDropoff ? jobDraft.routePath : null,
        isDraft: true,
      };
    } else if (hoveredJobId || selectedJobId) {
      console.log('📦 Showing job markers for:', hoveredJobId || selectedJobId);
      const job = jobs.find(j => j.id === (hoveredJobId || selectedJobId));
      console.log('📦 Found job:', job);
      if (job?.pickupLocation) {
        console.log('📦 Job has pickup location, creating markers');
        // Handle optional dropoff
        const dropoffLoc = job.dropoffLocation;
        const hasDropoff = !!(dropoffLoc?.latitude && dropoffLoc?.longitude);
        jobToShow = {
          pickup: { lat: job.pickupLocation.latitude, lng: job.pickupLocation.longitude },
          dropoff: hasDropoff && dropoffLoc
            ? { lat: dropoffLoc.latitude, lng: dropoffLoc.longitude }
            : null,
          pickupAddress: getAddressStr(job.pickupAddress) || 'Pickup',
          dropoffAddress: hasDropoff ? (getAddressStr(job.dropoffAddress) || 'Dropoff') : null,
          routePath: hasDropoff ? job.routePath : null,
          isDraft: false,
        };
      } else {
        console.warn('⚠️ Job missing pickup location:', job);
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
    };
  }, [jobDraft, hoveredJobId, selectedJobId, jobs]);

  // 🚗 Driver Markers - Filter drivers with valid positions AND online status
  const driversWithLocation = useMemo(() => {
    console.log('🚗 Total drivers:', drivers.length);
    console.log('🚗 Drivers data sample:', drivers.slice(0, 2));
    
    const activeDrivers = drivers.filter(d => {
      const hasPosition = d.position && d.position.latitude && d.position.longitude;
      const isOnline = d.status !== 'OFFLINE';
      
      if (!hasPosition) {
        console.log(`⚠️ Driver ${d.name} (${d.id}) - No position`);
      }
      if (!isOnline) {
        console.log(`⚠️ Driver ${d.name} (${d.id}) - OFFLINE, hiding from map`);
      }
      
      return hasPosition && isOnline;
    });
    
    // ✅ FIX: Check for duplicate driver IDs
    const driverIds = activeDrivers.map(d => d.id);
    const uniqueIds = new Set(driverIds);
    if (driverIds.length !== uniqueIds.size) {
      console.error('❌ DUPLICATE DRIVER IDS DETECTED!', {
        total: driverIds.length,
        unique: uniqueIds.size,
        duplicates: driverIds.filter((id, index) => driverIds.indexOf(id) !== index)
      });
    }
    
    // ✅ FIX: Log each driver's position to verify uniqueness
    activeDrivers.forEach(d => {
      console.log(`📍 Driver ${d.name} (${d.id}):`, {
        lat: d.position?.latitude.toFixed(6),
        lng: d.position?.longitude.toFixed(6),
        status: d.status
      });
    });
    
    console.log(`✅ ${activeDrivers.length} drivers with position and online status`);
    return activeDrivers;
  }, [drivers]);

  // 🎮 Map Event Handlers
  const handleMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
    console.log('🗺️ Google Maps loaded');
    
    // Focus on all zones after map loads
    setTimeout(() => {
      if (zones.length > 0) {
        console.log('🗺️ Auto-focusing on all zones');
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
          for (const point of allPoints) {
            bounds.extend({ lat: point.lat, lng: point.lng });
          }
          map.fitBounds(bounds, 50);
          console.log('✅ Zones fitted to map');
        }
      }
    }, 800);
  }, [zones]);

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
  useEffect(() => {
    if (!map || !focusedDriverId) return;
    
    const driver = drivers.find(d => d.id === focusedDriverId);
    if (!driver || !driver.position) {
      console.warn('⚠️ Driver has no position');
      return;
    }
    
    console.log('🎯 Focusing on driver:', driver.name);
    
    // Zoom to driver location
    map.panTo({
      lat: driver.position.latitude,
      lng: driver.position.longitude,
    });
    map.setZoom(16);
    
    console.log('✅ Driver focused on map');
  }, [focusedDriverId, map, drivers]);

  // 🎯 Auto-focus on job markers when they appear
  useEffect(() => {
    if (!map || !jobMarkersAndRoute || !googleMaps) return;
    
    console.log('🎯 Auto-focusing on job markers');
    
    // Create bounds that include pickup and dropoff (if available)
    const bounds = new googleMaps.LatLngBounds();
    bounds.extend(jobMarkersAndRoute.pickup);
    
    // Only include dropoff if it exists
    if (jobMarkersAndRoute.dropoff) {
      bounds.extend(jobMarkersAndRoute.dropoff);
      // Fit map to show both markers with padding
      map.fitBounds(bounds, 80);
      console.log('✅ Job markers (pickup + dropoff) fitted in view');
    } else {
      // Just zoom to pickup location
      map.panTo(jobMarkersAndRoute.pickup);
      map.setZoom(15);
      console.log('✅ Pickup marker focused (no dropoff)');
    }
  }, [jobMarkersAndRoute, map, googleMaps]);

  return (
    <div className="relative h-full w-full">
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
        >
          {/* Traffic Layer */}
          {mapState.showTraffic && <TrafficLayer />}
          
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
                }}
              />
            );
          })}
          
          {/* Job Route Line - Only show if we have both pickup and dropoff */}
          {jobMarkersAndRoute?.hasDropoff && jobMarkersAndRoute.route.length >= 2 && (
            <Polyline
              path={jobMarkersAndRoute.route}
              options={{
                strokeColor: jobMarkersAndRoute.isDraft ? '#a855f7' : '#2563eb', // Purple for draft, blue for regular
                strokeWeight: 4,
                strokeOpacity: 0.8,
                geodesic: true,
              }}
            />
          )}
          
          {/* Job Pickup Marker */}
          {isGoogleLoaded && googleMaps && jobMarkersAndRoute && (
            <Marker
              position={jobMarkersAndRoute.pickup}
              icon={
                googleMaps
                  ? {
                      path: googleMaps.SymbolPath.CIRCLE,
                      scale: 12,
                      fillColor: jobMarkersAndRoute.isDraft ? '#c084fc' : '#bfdbfe',
                      fillOpacity: 1,
                      strokeColor: jobMarkersAndRoute.isDraft ? '#7c3aed' : '#2563eb',
                      strokeWeight: 4,
                    }
                  : undefined
              }
              title={`📍 ${jobMarkersAndRoute.pickupAddress}`}
              label={{
                text: 'P',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            />
          )}
          
          {/* Job Dropoff Marker - Only show if dropoff exists */}
          {isGoogleLoaded && googleMaps && jobMarkersAndRoute && jobMarkersAndRoute.dropoff && (
            <Marker
              position={jobMarkersAndRoute.dropoff}
              icon={
                googleMaps
                  ? {
                      path: googleMaps.SymbolPath.CIRCLE,
                      scale: 12,
                      fillColor: jobMarkersAndRoute.isDraft ? '#d8b4fe' : '#bbf7d0',
                      fillOpacity: 1,
                      strokeColor: jobMarkersAndRoute.isDraft ? '#7c3aed' : '#059669',
                      strokeWeight: 4,
                    }
                  : undefined
              }
              title={`🎯 ${jobMarkersAndRoute.dropoffAddress || 'Dropoff'}`}
              label={{
                text: 'D',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            />
          )}
          
          {/* Driver Vehicle Markers - Using SVG icons with status colors like old DispatchConsole */}
          {isGoogleLoaded && driversWithLocation.map((driver) => {
            const isFocused = focusedDriverId === driver.id;
            
            // Get vehicle plate number for display
            const plateNumber = typeof driver.vehicle === 'string' 
              ? driver.vehicle 
              : driver.vehicle?.plateNumber || '';
            
            // Get vehicle type for icon selection (car vs van)
            const vehicleType = driver.vehicleType || 
              (typeof driver.vehicle === 'object' ? driver.vehicle?.type : undefined) ||
              'car';
            
            // Generate SVG data URL with status color (green/red/yellow/blue like old DispatchConsole)
            // Now also passes vehicle type for car vs van icon selection
            const vehicleIconUrl = getVehicleSvgDataUrl(driver.status, plateNumber, vehicleType);
            
            return (
              <Marker
                key={`driver-${driver.id}`}
                position={{
                  lat: driver.position!.latitude,
                  lng: driver.position!.longitude,
                }}
                icon={{
                  url: vehicleIconUrl,
                  // Updated sizes for original car/van SVGs (60x30 aspect ratio)
                  scaledSize: new google.maps.Size(isFocused ? 72 : 60, isFocused ? 36 : 30),
                  anchor: new google.maps.Point(isFocused ? 36 : 30, isFocused ? 18 : 15),
                }}
                title={`${driver.name}\n${plateNumber || 'N/A'}\nStatus: ${normalizeDriverStatus(driver.status)}`}
              />
            );
          })}
        </GoogleMap>
      </LoadScript>
      
      {/* Control Panel */}
      <ControlPanel 
        mapState={mapState} 
        setMapState={setMapState} 
        onRecenterMap={handleRecenterMap}
        isDark={isDark}
      />
      
      {/* Status Bar removed - zones only */}
    </div>
  );
};

// Helper functions removed - zones only

export default DispatchMapGoogle;
