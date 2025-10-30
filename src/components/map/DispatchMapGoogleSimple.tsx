import {
  GoogleMap,
  LoadScript,
  Marker,
  Polygon,
  Polyline,
  TrafficLayer,
} from '@react-google-maps/api';
import { Navigation, Settings, Target } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatchStore } from '../../store/useDispatchStore';

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

// 📱 Control Panel Component
const ControlPanel: React.FC<{
  mapState: AdvancedMapState;
  setMapState: React.Dispatch<React.SetStateAction<AdvancedMapState>>;
  onRecenterMap: () => void;
}> = ({ mapState, setMapState, onRecenterMap }) => (
  <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 space-y-3 z-10">
    <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
      <Settings size={16} />
      Map Controls
    </h3>
    
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mapState.showTraffic}
          onChange={(e) => setMapState(prev => ({ ...prev, showTraffic: e.target.checked }))}
          className="rounded"
        />
        <Navigation size={14} />
        Traffic Layer
      </label>
      
        {/* Demand Heatmap removed */}
      
      {/* Divider */}
      <div className="border-t border-gray-200 my-2"></div>
      
      {/* Recenter Button */}
      <button
        onClick={onRecenterMap}
        className="w-full flex items-center gap-2 text-sm px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md transition-colors duration-200 font-medium"
        title="Reset view to show all zones"
      >
        <Target size={14} />
        <span>Show All Zones</span>
      </button>
    </div>
  </div>
);

const DispatchMapGoogle: React.FC = () => {
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
    styles: [
      {
        featureType: 'poi.business',
        stylers: [{ visibility: 'off' }],
      },
    ],
  }), []);

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
    // Determine which job to show
    let jobToShow = null;
    
    // Priority: Job draft (creating/editing) > Hovered job > Selected job
    if (jobDraft?.pickup && jobDraft?.dropoff) {
      console.log('📦 Showing draft job markers');
      jobToShow = {
        pickup: { lat: jobDraft.pickup.latitude, lng: jobDraft.pickup.longitude },
        dropoff: { lat: jobDraft.dropoff.latitude, lng: jobDraft.dropoff.longitude },
        pickupAddress: jobDraft.pickup.address || 'Draft Pickup',
        dropoffAddress: jobDraft.dropoff.address || 'Draft Dropoff',
        routePath: jobDraft.routePath,
        isDraft: true,
      };
    } else if (hoveredJobId || selectedJobId) {
      console.log('📦 Showing job markers for:', hoveredJobId || selectedJobId);
      const job = jobs.find(j => j.id === (hoveredJobId || selectedJobId));
      console.log('📦 Found job:', job);
      if (job?.pickupLocation && job?.dropoffLocation) {
        console.log('📦 Job has both locations, creating markers');
        jobToShow = {
          pickup: { lat: job.pickupLocation.latitude, lng: job.pickupLocation.longitude },
          dropoff: { lat: job.dropoffLocation.latitude, lng: job.dropoffLocation.longitude },
          pickupAddress: job.pickupAddress || 'Pickup',
          dropoffAddress: job.dropoffAddress || 'Dropoff',
          routePath: job.routePath,
          isDraft: false,
        };
      } else {
        console.warn('⚠️ Job missing locations:', job);
      }
    }
    
    if (!jobToShow) return null;
    
    // Prepare route path (use routePath if available, otherwise straight line)
    let routeCoordinates = [];
    if (jobToShow.routePath && jobToShow.routePath.length >= 2) {
      routeCoordinates = jobToShow.routePath.map((coord: any) => ({
        lat: coord.latitude || coord.lat,
        lng: coord.longitude || coord.lng,
      }));
    } else {
      // Straight line between pickup and dropoff
      routeCoordinates = [jobToShow.pickup, jobToShow.dropoff];
    }
    
    return {
      pickup: jobToShow.pickup,
      dropoff: jobToShow.dropoff,
      pickupAddress: jobToShow.pickupAddress,
      dropoffAddress: jobToShow.dropoffAddress,
      route: routeCoordinates,
      isDraft: jobToShow.isDraft,
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
    if (!map || !jobMarkersAndRoute || typeof google === 'undefined') return;
    
    console.log('🎯 Auto-focusing on job markers');
    
    // Create bounds that include both pickup and dropoff
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(jobMarkersAndRoute.pickup);
    bounds.extend(jobMarkersAndRoute.dropoff);
    
    // Fit map to show both markers with padding
    map.fitBounds(bounds, 80);
    
    console.log('✅ Job markers fitted in view');
  }, [jobMarkersAndRoute, map]);

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
          
          {/* Job Route Line */}
          {jobMarkersAndRoute && (
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
          {jobMarkersAndRoute && (
            <Marker
              position={jobMarkersAndRoute.pickup}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: jobMarkersAndRoute.isDraft ? '#c084fc' : '#bfdbfe', // Light purple for draft, light blue for regular
                fillOpacity: 1,
                strokeColor: jobMarkersAndRoute.isDraft ? '#7c3aed' : '#2563eb', // Darker purple/blue border
                strokeWeight: 4,
              }}
              title={`📍 ${jobMarkersAndRoute.pickupAddress}`}
              label={{
                text: 'P',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            />
          )}
          
          {/* Job Dropoff Marker */}
          {jobMarkersAndRoute && (
            <Marker
              position={jobMarkersAndRoute.dropoff}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: jobMarkersAndRoute.isDraft ? '#d8b4fe' : '#bbf7d0', // Light purple for draft, light green for regular
                fillOpacity: 1,
                strokeColor: jobMarkersAndRoute.isDraft ? '#7c3aed' : '#059669', // Darker purple/green border
                strokeWeight: 4,
              }}
              title={`🎯 ${jobMarkersAndRoute.dropoffAddress}`}
              label={{
                text: 'D',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            />
          )}
          
          {/* Driver Vehicle Markers */}
          {isGoogleLoaded && driversWithLocation.map((driver) => {
            // Determine marker color based on driver status
            let markerColor = '#94a3b8'; // Default gray
            if (driver.status === 'AVAILABLE') markerColor = '#10b981'; // Green
            else if (driver.status === 'BUSY') markerColor = '#f59e0b'; // Amber
            else if (driver.status === 'ROGER') markerColor = '#3b82f6'; // Blue
            else if (driver.status === 'AWAY') markerColor = '#6b7280'; // Gray
            else if (driver.status === 'OFFLINE') markerColor = '#ef4444'; // Red
            
            const isFocused = focusedDriverId === driver.id;
            
            // Get vehicle type and icon from driver data
            const vehicleType = driver.vehicleType?.toLowerCase() || 'sedan';
            // @ts-ignore - vehicle property exists in API response
            const customVehicleIcon = driver.vehicle?.icon;
            
            // Create vehicle icon URL - use custom icon from DB if available
            const getVehicleIconUrl = (type: string) => {
              // If custom icon exists from database, use it
              if (customVehicleIcon) {
                const apiUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';
                const iconPath = customVehicleIcon.startsWith('/') ? customVehicleIcon : `/${customVehicleIcon}`;
                return `${apiUrl}${iconPath}`;
              }
              
              // Normalize vehicle type
              const typeMap: Record<string, string> = {
                'car': 'sedan',
                'taxi': 'sedan', 
                'sedan': 'sedan',
                'suv': 'suv',
                'van': 'van',
                'truck': 'van',
                'minivan': 'van',
                'motorcycle': 'motorcycle',
                'bike': 'motorcycle'
              };
              
              const normalizedType = typeMap[type] || 'sedan';
              
              // Create SVG icon as data URL with color based on status
              const vehicleSvgs: Record<string, string> = {
                sedan: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                    <g transform="translate(24, 24)">
                      <path d="M-14,-6 L-12,-10 L-8,-12 L8,-12 L12,-10 L14,-6 L14,6 L12,8 L-12,8 L-14,6 Z" 
                            fill="${markerColor}" stroke="#fff" stroke-width="2"/>
                      <circle cx="-8" cy="8" r="3" fill="#333"/>
                      <circle cx="8" cy="8" r="3" fill="#333"/>
                      <rect x="-10" y="-8" width="8" height="6" fill="#4a9eff" opacity="0.6"/>
                      <rect x="2" y="-8" width="8" height="6" fill="#4a9eff" opacity="0.6"/>
                    </g>
                  </svg>
                `)}`,
                suv: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                    <g transform="translate(24, 24)">
                      <path d="M-16,-8 L-14,-14 L-10,-16 L10,-16 L14,-14 L16,-8 L16,8 L14,10 L-14,10 L-16,8 Z" 
                            fill="${markerColor}" stroke="#fff" stroke-width="2"/>
                      <circle cx="-10" cy="10" r="3.5" fill="#333"/>
                      <circle cx="10" cy="10" r="3.5" fill="#333"/>
                      <rect x="-12" y="-12" width="10" height="8" fill="#4a9eff" opacity="0.6"/>
                      <rect x="2" y="-12" width="10" height="8" fill="#4a9eff" opacity="0.6"/>
                    </g>
                  </svg>
                `)}`,
                van: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                    <g transform="translate(24, 24)">
                      <rect x="-16" y="-14" width="32" height="26" rx="2" 
                            fill="${markerColor}" stroke="#fff" stroke-width="2"/>
                      <rect x="-14" y="-12" width="12" height="8" fill="#4a9eff" opacity="0.6"/>
                      <rect x="2" y="-12" width="12" height="8" fill="#4a9eff" opacity="0.6"/>
                      <circle cx="-10" cy="12" r="3" fill="#333"/>
                      <circle cx="10" cy="12" r="3" fill="#333"/>
                    </g>
                  </svg>
                `)}`,
                motorcycle: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                  <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                    <g transform="translate(24, 24)">
                      <circle cx="-8" cy="6" r="5" fill="#333" stroke="#fff" stroke-width="1.5"/>
                      <circle cx="8" cy="6" r="5" fill="#333" stroke="#fff" stroke-width="1.5"/>
                      <path d="M-8,6 L-4,-4 L4,-4 L8,6" fill="none" stroke="${markerColor}" stroke-width="3" stroke-linecap="round"/>
                      <circle cx="0" cy="-8" r="3" fill="${markerColor}" stroke="#fff" stroke-width="1.5"/>
                    </g>
                  </svg>
                `)}`,
              };
              
              return vehicleSvgs[normalizedType] || vehicleSvgs.sedan;
            };
            
            return (
              <Marker
                key={`driver-${driver.id}`}
                position={{
                  lat: driver.position!.latitude,
                  lng: driver.position!.longitude,
                }}
                icon={{
                  url: getVehicleIconUrl(vehicleType),
                  scaledSize: new google.maps.Size(isFocused ? 56 : 48, isFocused ? 56 : 48),
                  anchor: new google.maps.Point(isFocused ? 28 : 24, isFocused ? 28 : 24),
                }}
                title={`${driver.name}\n${driver.vehicle || 'N/A'}\nType: ${vehicleType}\nStatus: ${driver.status}`}
                label={{
                  text: driver.vehicle?.slice(-3) || '?', // Last 3 chars of vehicle number
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  className: 'vehicle-marker-label'
                }}
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
      />
      
      {/* Status Bar removed - zones only */}
    </div>
  );
};

// Helper functions removed - zones only

export default DispatchMapGoogle;