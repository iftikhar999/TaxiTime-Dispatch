import {
  GoogleMap as GoogleMapComponent,
  Marker as GoogleMarker,
  Polygon as GooglePolygon,
  Polyline as GooglePolyline,
  useJsApiLoader
} from "@react-google-maps/api";
import L, { LatLngTuple } from "leaflet";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Marker as LeafletMarker,
  Polygon as LeafletPolygon,
  Polyline as LeafletPolyline,
  MapContainer,
  TileLayer
} from "react-leaflet";
import { MAP_TILE_URL } from "../../config/environment";
import { getRoute } from "../../services/routingService";
import { getMapSettings } from "../../services/zoneService";
import { useDispatchStore } from "../../store/useDispatchStore";
import {
  getDriverStatusColor
} from "../../utils/driverStatusColors";
import { createVehicleIconConfig } from "../../utils/vehicleIcons";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

// Create colored car icons for driver status
const createDriverIcon = (status: string, driverName?: string) => {
  const color = getDriverStatusColor(status);
  const initial = driverName?.charAt(0)?.toUpperCase() || "D";

  // Create SVG icon with status color
  const svgIcon = `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="16" r="10" fill="${color}" opacity="0.8"/>
      <text x="16" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold">${initial}</text>
    </svg>
  `;

  const iconUrl = "data:image/svg+xml;base64," + btoa(svgIcon);

  return L.icon({
    iconUrl,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Create vehicle marker using actual vehicle type icons with status colors
const createVehicleIcon = (
  status: string,
  vehicleType?: string,
  vehicleNumber?: string
) => {
  const statusColor = getDriverStatusColor(status);
  const number = vehicleNumber?.slice(-2) || "??";

  // Try to use the actual vehicle SVG icon
  const vehicleIconConfig = createVehicleIconConfig(vehicleType, "map");

  // Create an enhanced icon with status indicator overlay
  const enhancedSvgIcon = `
    <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="status-glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge> 
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      <!-- Vehicle silhouette positioned in center -->
      <g transform="translate(6, 12)">
        <image href="${vehicleIconConfig.iconUrl}" width="36" height="24" />
      </g>
      
      <!-- Status indicator circle -->
      <circle cx="38" cy="10" r="8" fill="${statusColor}" stroke="white" stroke-width="2" filter="url(#status-glow)"/>
      
      <!-- Vehicle number badge -->
      <rect x="2" y="35" width="18" height="10" rx="2" fill="rgba(0,0,0,0.8)" stroke="white" stroke-width="1"/>
      <text x="11" y="42" text-anchor="middle" fill="white" font-size="8" font-weight="bold">${number}</text>
    </svg>
  `;

  const iconUrl = "data:image/svg+xml;base64," + btoa(enhancedSvgIcon);

  return L.icon({
    iconUrl,
    iconSize: [48, 48],
    iconAnchor: [24, 36], // Anchor at bottom center for proper positioning
    popupAnchor: [0, -36],
  });
};

// Create Google Maps compatible vehicle icon
const createGoogleVehicleIcon = (
  status: string,
  vehicleType?: string,
  vehicleNumber?: string,
  driverName?: string
) => {
  const statusColor = getDriverStatusColor(status);
  const number = vehicleNumber?.slice(-2) || "??";

  // Use vehicle type icon if available, otherwise fallback to driver initial
  const vehicleIconConfig = createVehicleIconConfig(vehicleType, "map");

  const enhancedSvgIcon = `
    <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <!-- Vehicle silhouette -->
      <g transform="translate(6, 12)">
        <image href="${vehicleIconConfig.iconUrl}" width="36" height="24" />
      </g>
      
      <!-- Status indicator circle -->
      <circle cx="38" cy="10" r="8" fill="${statusColor}" stroke="white" stroke-width="2"/>
      
      <!-- Vehicle number badge -->
      <rect x="2" y="35" width="18" height="10" rx="2" fill="rgba(0,0,0,0.8)" stroke="white" stroke-width="1"/>
      <text x="11" y="42" text-anchor="middle" fill="white" font-size="8" font-weight="bold">${number}</text>
    </svg>
  `;

  return {
    url: "data:image/svg+xml;base64," + btoa(enhancedSvgIcon),
    scaledSize: new google.maps.Size(48, 48),
    anchor: new google.maps.Point(24, 36),
  };
};

const DispatchMap: React.FC = () => {
  const drivers = useDispatchStore((state) => state.drivers);
  const zones = useDispatchStore((state) => state.zones);
  const selectedJobId = useDispatchStore((state) => state.selectedJobId);
  const focusedZoneId = useDispatchStore((state) => state.focusedZoneId);
  const mapFocusCoords = useDispatchStore((state) => state.mapFocusCoords);
  const focusAllZones = useDispatchStore((state) => state.focusAllZones);
  const jobs = useDispatchStore((state) => state.jobs);
  const hoveredJobId = useDispatchStore((state) => state.hoveredJobId);
  const hoveredDriverId = useDispatchStore((state) => state.hoveredDriverId);
  const hoveredZoneId = useDispatchStore((state) => state.hoveredZoneId);

  console.log('🗺️ DispatchMap RENDER:', {
    selectedJobId,
    focusedZoneId,
    mapFocusCoords,
    jobsCount: jobs.length,
    zonesCount: zones.length
  });
  const jobDraft = useDispatchStore((state) => state.jobDraft);
  const [mapReady, setMapReady] = useState(false);
  const [directionsRoute, setDirectionsRoute] = useState<Array<{ lat: number; lng: number }> | null>(null);
  
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [mapSettings, setMapSettings] = useState<{
    mapProvider: "GOOGLE_MAPS" | "OPENSTREETMAP";
    placeApiProvider: "GOOGLE_MAPS" | "OPENSTREETMAP";
  } | null>(null);
  const mapRef = useRef<any>(null); // Reference to map instance (Leaflet or Google Maps)
  const googleMapRef = useRef<google.maps.Map | null>(null); // Specific ref for Google Maps

  const GOOGLE_MAPS_API_KEY =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    import.meta.env.VITE_GOOGLE_MAP_API_KEY ||
    "";
    
  useEffect(() => {
    let mounted = true;
    getMapSettings()
      .then((settings) => {
        if (mounted) {
          setMapSettings({
            mapProvider: settings.mapProvider,
            placeApiProvider: settings.placeApiProvider,
          });
        }
      })
      .catch(() => {
        if (mounted) {
          setMapSettings(null);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const useGoogleMap =
    mapSettings?.mapProvider === "GOOGLE_MAPS" && Boolean(GOOGLE_MAPS_API_KEY);

  const { isLoaded: isGoogleLoaded } = useJsApiLoader({
    id: "dispatch-google-map",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: ["places"],
  });

  // Delay map rendering to avoid React Leaflet context issues
  useEffect(() => {
    const timer = setTimeout(() => setMapReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Initialize map to show all zones by default - CRITICAL for page load
  useEffect(() => {
    if (mapReady && (mapRef.current || googleMapRef.current) && zones.length > 0) {
      // Wait for map to fully initialize and zones to be rendered
      const timer = setTimeout(() => {
        console.log('🗺️ [INIT] Initializing map with all zones view - zones count:', zones.length);
        handleFocusAllZones();
      }, 1000); // Increased delay to ensure zones are loaded
      return () => clearTimeout(timer);
    } else if (mapReady && zones.length === 0) {
      console.warn('⚠️ [INIT] Map is ready but no zones loaded yet');
    }
  }, [mapReady, zones.length]);

  // Auto-return to all zones view when all focus states are cleared
  useEffect(() => {
    const allFocusStatesNull = !mapFocusCoords && !focusedZoneId && !selectedJobId;
    
    if (allFocusStatesNull && mapReady && (mapRef.current || googleMapRef.current) && zones.length > 0) {
      console.log('🗺️ All focus states cleared - returning to all zones view');
      // Small delay to ensure state updates have completed
      const timer = setTimeout(() => {
        handleFocusAllZones();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mapFocusCoords, focusedZoneId, selectedJobId, mapReady, zones.length]);

  // Handle map focusing based on store state
  useEffect(() => {
    console.log('🗺️ Map focus effect triggered:', {
      hasMapRef: !!mapRef.current,
      hasGoogleMapRef: !!googleMapRef.current,
      mapFocusCoords,
      focusedZoneId,
      selectedJobId
    });

    if (!mapRef.current && !googleMapRef.current) {
      console.log('⚠️ No map ref available yet');
      return;
    }

    // Focus on specific coordinates (from driver/zone/job)
    if (mapFocusCoords) {
      console.log('📍 Focusing on coordinates:', mapFocusCoords);
      if (mapRef.current?.setView) {
        // Leaflet
        mapRef.current.setView(
          [mapFocusCoords.lat, mapFocusCoords.lng],
          mapFocusCoords.zoom || 16,
          { animate: true, duration: 0.5 }
        );
        console.log('✅ Leaflet view set');
      } else if (googleMapRef.current) {
        // Google Maps
        googleMapRef.current.panTo({ lat: mapFocusCoords.lat, lng: mapFocusCoords.lng });
        googleMapRef.current.setZoom(mapFocusCoords.zoom || 16);
        console.log('✅ Google Maps view set');
      }
      return; // Don't process other focus states when coordinates are set
    }

    // Focus on specific zone
    if (focusedZoneId) {
      console.log('🗺️ Focusing on zone:', focusedZoneId);
      const zone = zones.find(z => z.id === focusedZoneId);
      if (zone?.polygon && zone.polygon.length > 0) {
        if (mapRef.current?.fitBounds) {
          // Leaflet
          const bounds = L.latLngBounds(zone.polygon.map(p => [p.lat, p.lng]));
          mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });
          console.log('✅ Leaflet zone bounds set');
        } else if (googleMapRef.current) {
          // Google Maps
          const bounds = new google.maps.LatLngBounds();
          for (const p of zone.polygon) {
            bounds.extend({ lat: p.lat, lng: p.lng });
          }
          googleMapRef.current.fitBounds(bounds, 50);
          console.log('✅ Google Maps zone bounds set');
        }
      }
      return; // Don't process other focus states
    }

    // Focus on selected job (fit bounds to pickup/dropoff)
    if (selectedJobId) {
      console.log('📦 Focusing on job:', selectedJobId);
      const job = jobs.find(j => j.id === selectedJobId);
      if (job?.pickupLocation && job?.dropoffLocation) {
        if (mapRef.current?.fitBounds) {
          // Leaflet
          const bounds = L.latLngBounds([
            [job.pickupLocation.latitude, job.pickupLocation.longitude],
            [job.dropoffLocation.latitude, job.dropoffLocation.longitude]
          ]);
          mapRef.current.fitBounds(bounds, { padding: [80, 80], animate: true });
          console.log('✅ Leaflet job bounds set');
        } else if (googleMapRef.current) {
          // Google Maps
          const bounds = new google.maps.LatLngBounds();
          bounds.extend({ lat: job.pickupLocation.latitude, lng: job.pickupLocation.longitude });
          bounds.extend({ lat: job.dropoffLocation.latitude, lng: job.dropoffLocation.longitude });
          googleMapRef.current.fitBounds(bounds, 80);
          console.log('✅ Google Maps job bounds set');
        }
      }
      return; // Don't show all zones when job is selected
    }

    // Default: Show all zones when nothing specific is focused
    if (!focusedZoneId && !mapFocusCoords && zones.length > 0) {
      console.log('🗺️ No specific focus, showing all zones');
      handleFocusAllZones();
    }
  }, [mapFocusCoords, focusedZoneId, selectedJobId, zones, jobs, focusAllZones]);

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0],
    [jobs, selectedJobId]
  );

  const activeDrivers = useMemo(
    () => drivers.filter((driver) => driver.status !== "OFFLINE"),
    [drivers]
  );

  const driversWithLocation = useMemo(
    () =>
      activeDrivers.filter((driver) => {
        const lat = driver.position?.latitude;
        const lng = driver.position?.longitude;
        return (
          driver.position !== undefined &&
          lat !== undefined &&
          lng !== undefined &&
          Number.isFinite(lat) &&
          Number.isFinite(lng)
        );
      }),
    [activeDrivers]
  );

  const jobRoutes = useMemo(() => {
    // Don't show job routes when creating/editing a job (jobDraft is active)
    if (jobDraft) {
      return [];
    }
    
    // Only show job routes when a job is selected for viewing or when hovering
    const jobIdToShow = selectedJobId || hoveredJobId;
    if (!jobIdToShow) {
      return [];
    }

    return jobs
      .filter((job) => job.id === jobIdToShow) // Show route for selected or hovered job
      .map((job) => {
        const routePath = Array.isArray(job.routePath) ? job.routePath : [];

        let fallbackPath: Array<{ lat: number; lng: number }> = [];
        if (
          (!routePath || routePath.length < 2) &&
          job.pickupLocation &&
          job.dropoffLocation
        ) {
          fallbackPath = [
            {
              lat: job.pickupLocation.latitude,
              lng: job.pickupLocation.longitude,
            },
            {
              lat: job.dropoffLocation.latitude,
              lng: job.dropoffLocation.longitude,
            },
          ];
        }

        const driverTrail = Array.isArray(job.driverTrail)
          ? job.driverTrail
              .filter(
                (point) =>
                  Number.isFinite(point.latitude) &&
                  Number.isFinite(point.longitude)
              )
              .map((point) => ({
                lat: point.latitude,
                lng: point.longitude,
              }))
          : [];

        const path = routePath.length >= 2 ? routePath : fallbackPath;

        if (path.length < 2 && driverTrail.length < 2) {
          return null;
        }

        return {
          id: job.id,
          path,
          driverTrail,
          isSelected: true, // Always true since we filtered by selectedJobId
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      path: Array<{ lat: number; lng: number }>;
      driverTrail: Array<{ lat: number; lng: number }>;
      isSelected: boolean;
    }>;
  }, [jobs, hoveredJobId, selectedJobId, jobDraft]);

  const draftRoute = useMemo(() => {
    if (!jobDraft?.routePath || jobDraft.routePath.length < 2) {
      return null;
    }
    return jobDraft.routePath;
  }, [jobDraft]);

  // Fetch real road route from OSRM (free, no API key needed)
  useEffect(() => {
    // Build route from pickup → stops → dropoff (not from routePath which may be stale)
    if (!jobDraft?.pickup) {
      setDirectionsRoute(null);
      return;
    }
    
    const origin = { lat: jobDraft.pickup.latitude, lng: jobDraft.pickup.longitude };
    
    // Collect stops as waypoints
    const waypoints = (jobDraft.stops || [])
      .filter((s: any) => s.latitude && s.longitude)
      .map((s: any) => ({ lat: s.latitude, lng: s.longitude }));
    
    // Need at least a dropoff to route
    if (!jobDraft.dropoff?.latitude || !jobDraft.dropoff?.longitude) {
      setDirectionsRoute(null);
      return;
    }
    
    const destination = { lat: jobDraft.dropoff.latitude, lng: jobDraft.dropoff.longitude };

    getRoute(origin, destination, waypoints)
      .then((result) => {
        setDirectionsRoute(result.path);
      })
      .catch(() => {
        setDirectionsRoute(null);
      });
  }, [jobDraft?.pickup, jobDraft?.dropoff, jobDraft?.stops]);

  const draftMarkers = useMemo(
    () => {
      const markers: Array<{
        type: "pickup" | "dropoff" | "stop";
        lat: number;
        lng: number;
        label?: string;
      }> = [];
      
      if (jobDraft?.pickup) {
        markers.push({
          type: "pickup",
          lat: jobDraft.pickup.latitude,
          lng: jobDraft.pickup.longitude,
        });
      }
      
      if (jobDraft?.stops) {
        jobDraft.stops.forEach((stop, i) => {
          if (stop.latitude && stop.longitude) {
            markers.push({
              type: "stop",
              lat: stop.latitude,
              lng: stop.longitude,
              label: `${i + 1}`,
            });
          }
        });
      }
      
      if (jobDraft?.dropoff) {
        markers.push({
          type: "dropoff",
          lat: jobDraft.dropoff.latitude,
          lng: jobDraft.dropoff.longitude,
        });
      }
      
      return markers;
    },
    [jobDraft]
  );

  const googleCenter = useMemo(() => {
    // ALWAYS prioritize zones - NEVER use driver location for initial center
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
        console.log('📍 Map center calculated from zones:', { lat: avgLat, lng: avgLng });
        return { lat: avgLat, lng: avgLng };
      }
    }
    
    // Fallback: Use default coordinates (NEVER use driver location)
    console.log('📍 Using default map center (no zones available)');
    return { lat: 25.2854, lng: 51.531 };
  }, [zones]); // Removed driversWithLocation dependency

  // Function to focus map on all zones
  const handleFocusAllZones = () => {
    if (zones.length === 0) return;
    
    // Calculate bounds to fit all zones
    const allPoints: { lat: number; lng: number }[] = [];
    for (const zone of zones) {
      if (zone.polygon && zone.polygon.length > 0) {
        for (const coord of zone.polygon) {
          allPoints.push({ lat: coord.lat, lng: coord.lng });
        }
      }
    }

    if (allPoints.length === 0) return;

    if (mapRef.current?.fitBounds) {
      // For Leaflet
      const bounds = L.latLngBounds(allPoints.map(p => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    } else if (googleMapRef.current) {
      // For Google Maps
      const bounds = new google.maps.LatLngBounds();
      for (const point of allPoints) {
        bounds.extend({ lat: point.lat, lng: point.lng });
      }
      googleMapRef.current.fitBounds(bounds, 50);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Fleet Map</h2>
          <p className="text-xs text-slate-600">
            Live positions and job overlays
          </p>
        </div>
        <div className="flex gap-2 text-xs text-slate-600">
          <button 
            onClick={() => {
              focusAllZones();
              setTimeout(() => handleFocusAllZones(), 100);
            }}
            className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 font-medium text-blue-700 shadow-sm transition hover:border-blue-500 hover:bg-blue-100"
          >
            🎯 Focus All Zones
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-1 shadow-sm transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700">
            Toggle Zones
          </button>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-1 shadow-sm transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700">
            Heatmap
          </button>
        </div>
      </header>
      <div className="relative flex-1">
        {(() => {
          if (!mapReady) {
            return (
              <div className="flex h-full items-center justify-center bg-slate-50 text-slate-600">
                <p>Loading map...</p>
              </div>
            );
          }
          
          if (useGoogleMap && isGoogleLoaded) {
            return (
            <GoogleMapComponent
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={googleCenter}
              zoom={zones.length > 0 ? 10 : 13}
              onLoad={(map) => {
                googleMapRef.current = map;
                // Immediately focus on all zones after map loads
                setTimeout(() => {
                  console.log('🗺️ Google Maps loaded - focusing on all zones');
                  if (zones.length > 0) {
                    handleFocusAllZones();
                  } else {
                    console.warn('⚠️ No zones available yet, will focus when zones load');
                  }
                }, 800);
              }}
              options={{
                streetViewControl: false,
                mapTypeControl: true,
                fullscreenControl: false,
                gestureHandling: "greedy",
              }}
            >
              {zones.map((zone) => {
                if (!zone.polygon || zone.polygon.length < 3) {
                  return null;
                }
                const path = zone.polygon.map((coord) => ({
                  lat: coord.lat,
                  lng: coord.lng,
                }));
                
                // Highlight focused or hovered zone
                const isFocused = focusedZoneId === zone.id;
                const isHovered = hoveredZoneId === zone.id;
                const isHighlighted = isFocused || isHovered;
                
                return (
                  <GooglePolygon
                    key={`g-zone-${zone.id}`}
                    path={path}
                    options={{
                      fillColor: isHighlighted ? "#3b82f6" : "#60a5fa",
                      fillOpacity: isHighlighted ? 0.25 : 0.1,
                      strokeColor: isHighlighted ? "#1d4ed8" : "#3b82f6",
                      strokeWeight: isHighlighted ? 4 : 2,
                    }}
                  />
                );
              })}
              {jobRoutes.map((route) =>
                route.path.length >= 2 ? (
                  <GooglePolyline
                    key={`g-route-${route.id}`}
                    path={route.path.map((coord) => ({
                      lat: coord.lat,
                      lng: coord.lng,
                    }))}
                    options={{
                      strokeColor: route.isSelected ? "#2563eb" : "#94a3b8",
                      strokeWeight: route.isSelected ? 4 : 2,
                      strokeOpacity: route.isSelected ? 0.9 : 0.6,
                    }}
                  />
                ) : null
              )}
              {jobRoutes
                .filter(
                  (route) => route.isSelected && route.driverTrail.length >= 2
                )
                .map((route) => (
                  <GooglePolyline
                    key={`g-route-trail-${route.id}`}
                    path={route.driverTrail.map((coord) => ({
                      lat: coord.lat,
                      lng: coord.lng,
                    }))}
                    options={{
                      strokeColor: "#22c55e",
                      strokeWeight: 3,
                      strokeOpacity: 0.7,
                      icons: [
                        {
                          icon: {
                            path: "M 0,-1 0,1",
                            strokeOpacity: 1,
                            scale: 4,
                          },
                          offset: "0",
                          repeat: "12px",
                        },
                      ],
                    }}
                  />
                ))}
              {/* Draft Route - Real road path from Google Directions */}
              {directionsRoute && directionsRoute.length >= 2 ? (
                <GooglePolyline
                  key="g-draft-route-directions"
                  path={directionsRoute}
                  options={{
                    strokeColor: "#7c3aed",
                    strokeWeight: 5,
                    strokeOpacity: 0.9,
                  }}
                />
              ) : draftRoute ? (
                <GooglePolyline
                  key="g-draft-route-fallback"
                  path={draftRoute.map((coord) => ({
                    lat: coord.lat,
                    lng: coord.lng,
                  }))}
                  options={{
                    strokeColor: "#a855f7",
                    strokeWeight: 3,
                    strokeOpacity: 0.85,
                    icons: [
                      {
                        icon: {
                          path: "M 0,-1 0,1",
                          strokeOpacity: 1,
                          scale: 4,
                        },
                        offset: "0",
                        repeat: "10px",
                      },
                    ],
                  }}
                />
              ) : null}
              {/* Draft Pickup/Dropoff/Stop Markers */}
              {draftMarkers.map((marker, idx) => {
                // Pin-shaped marker SVGs
                if (marker.type === 'pickup') {
                  const svg = `<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg"><path d="M20 50 C20 50 38 32 38 18 C38 8 30 0 20 0 C10 0 2 8 2 18 C2 32 20 50 20 50Z" fill="#16a34a" stroke="white" stroke-width="2"/><circle cx="20" cy="18" r="11" fill="white"/><text x="20" y="23" text-anchor="middle" fill="#16a34a" font-size="14" font-weight="bold">P</text></svg>`;
                  const svgIcon = `data:image/svg+xml;base64,${btoa(svg)}`;
                  return (
                    <GoogleMarker
                      key={`draft-pickup-${idx}`}
                      position={{ lat: marker.lat, lng: marker.lng }}
                      icon={{
                        url: svgIcon,
                        scaledSize: new google.maps.Size(40, 52),
                        anchor: new google.maps.Point(20, 50),
                      }}
                      zIndex={1000}
                    />
                  );
                }
                if (marker.type === 'dropoff') {
                  const svg = `<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg"><path d="M20 50 C20 50 38 32 38 18 C38 8 30 0 20 0 C10 0 2 8 2 18 C2 32 20 50 20 50Z" fill="#dc2626" stroke="white" stroke-width="2"/><circle cx="20" cy="18" r="11" fill="white"/><text x="20" y="23" text-anchor="middle" fill="#dc2626" font-size="14" font-weight="bold">D</text></svg>`;
                  const svgIcon = `data:image/svg+xml;base64,${btoa(svg)}`;
                  return (
                    <GoogleMarker
                      key={`draft-dropoff-${idx}`}
                      position={{ lat: marker.lat, lng: marker.lng }}
                      icon={{
                        url: svgIcon,
                        scaledSize: new google.maps.Size(40, 52),
                        anchor: new google.maps.Point(20, 50),
                      }}
                      zIndex={999}
                    />
                  );
                }
                // Stop markers - numbered pins
                const num = marker.label || String(idx);
                const svg = `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg"><path d="M18 44 C18 44 34 28 34 16 C34 7 27 0 18 0 C9 0 2 7 2 16 C2 28 18 44 18 44Z" fill="#f59e0b" stroke="white" stroke-width="2"/><circle cx="18" cy="16" r="10" fill="white"/><text x="18" y="21" text-anchor="middle" fill="#d97706" font-size="14" font-weight="bold">${num}</text></svg>`;
                const svgIcon = `data:image/svg+xml;base64,${btoa(svg)}`;
                return (
                  <GoogleMarker
                    key={`draft-stop-${idx}`}
                    position={{ lat: marker.lat, lng: marker.lng }}
                    icon={{
                      url: svgIcon,
                      scaledSize: new google.maps.Size(36, 46),
                      anchor: new google.maps.Point(18, 44),
                    }}
                    zIndex={998}
                  />
                );
              })}
            </GoogleMapComponent>
            );
          }
          
          return (
            <MapContainer
              key="dispatch-map"
              center={[googleCenter.lat, googleCenter.lng]}
              zoom={zones.length > 0 ? 10 : 12}
              className="h-full w-full"
              scrollWheelZoom
              ref={mapRef}
              whenReady={() => {
                setTimeout(() => {
                  console.log('🗺️ Leaflet map ready - focusing on all zones');
                  if (zones.length > 0) {
                    handleFocusAllZones();
                  } else {
                    console.warn('⚠️ No zones available yet, will focus when zones load');
                  }
                }, 800);
              }}
            >
              <TileLayer url={MAP_TILE_URL} />
              {zones.map((zone) => {
                if (!zone.polygon || zone.polygon.length < 3) {
                  return null;
                }
                const positions: LatLngTuple[] = zone.polygon.map((coord) => [
                  coord.lat,
                  coord.lng,
                ]);
                
                // Highlight focused or hovered zone
                const isFocused = focusedZoneId === zone.id;
                const isHovered = hoveredZoneId === zone.id;
                const isHighlighted = isFocused || isHovered;
                
                return (
                  <LeafletPolygon
                    key={zone.id}
                    positions={positions}
                    pathOptions={{
                      color: isHighlighted ? "#3b82f6" : "#60a5fa",
                      weight: isHighlighted ? 4 : 2,
                      fillOpacity: isHighlighted ? 0.25 : 0.1,
                      dashArray: isHighlighted ? undefined : "4 8",
                    }}
                  />
                );
              })}
              {/* Job Routes & Draft Overlays */}
              {jobRoutes.map((route) =>
                route.path.length >= 2 ? (
                  <LeafletPolyline
                    key={`line-${route.id}`}
                    positions={route.path.map(
                      (coord) => [coord.lat, coord.lng] as LatLngTuple
                    )}
                    pathOptions={{
                      color: route.isSelected ? "#2563eb" : "#94a3b8",
                      weight: route.isSelected ? 4 : 2,
                      opacity: route.isSelected ? 0.9 : 0.6,
                    }}
                  />
                ) : null
              )}
              {jobRoutes
                .filter(
                  (route) => route.isSelected && route.driverTrail.length >= 2
                )
                .map((route) => (
                  <LeafletPolyline
                    key={`trail-${route.id}`}
                    positions={route.driverTrail.map(
                      (coord) => [coord.lat, coord.lng] as LatLngTuple
                    )}
                    pathOptions={{
                      color: "#22c55e",
                      weight: 3,
                      opacity: 0.7,
                      dashArray: "4 8",
                    }}
                  />
                ))}
              {/* Draft Route - Real road path or straight fallback */}
              {directionsRoute && directionsRoute.length >= 2 ? (
                <LeafletPolyline
                  key="draft-route-directions"
                  positions={directionsRoute.map(p => [p.lat, p.lng] as LatLngTuple)}
                  pathOptions={{
                    color: "#7c3aed",
                    weight: 5,
                    opacity: 0.9,
                  }}
                />
              ) : draftRoute ? (
                <LeafletPolyline
                  key="draft-route-fallback"
                  positions={draftRoute.map(
                    (coord) => [coord.lat, coord.lng] as LatLngTuple
                  )}
                  pathOptions={{
                    color: "#a855f7",
                    weight: 3,
                    opacity: 0.85,
                    dashArray: "6 6",
                  }}
                />
              ) : null}

              {/* Draft Pickup/Dropoff/Stop Markers (Leaflet) */}
              {draftMarkers.map((marker, idx) => {
                if (marker.type === 'pickup') {
                  const svg = `<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg"><path d="M20 50 C20 50 38 32 38 18 C38 8 30 0 20 0 C10 0 2 8 2 18 C2 32 20 50 20 50Z" fill="#16a34a" stroke="white" stroke-width="2"/><circle cx="20" cy="18" r="11" fill="white"/><text x="20" y="23" text-anchor="middle" fill="#16a34a" font-size="14" font-weight="bold">P</text></svg>`;
                  return (
                    <LeafletMarker key={`draft-pickup-${idx}`} position={[marker.lat, marker.lng]}
                      icon={L.divIcon({ html: svg, className: '', iconSize: [40, 52], iconAnchor: [20, 50] })} />
                  );
                }
                if (marker.type === 'dropoff') {
                  const svg = `<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg"><path d="M20 50 C20 50 38 32 38 18 C38 8 30 0 20 0 C10 0 2 8 2 18 C2 32 20 50 20 50Z" fill="#dc2626" stroke="white" stroke-width="2"/><circle cx="20" cy="18" r="11" fill="white"/><text x="20" y="23" text-anchor="middle" fill="#dc2626" font-size="14" font-weight="bold">D</text></svg>`;
                  return (
                    <LeafletMarker key={`draft-dropoff-${idx}`} position={[marker.lat, marker.lng]}
                      icon={L.divIcon({ html: svg, className: '', iconSize: [40, 52], iconAnchor: [20, 50] })} />
                  );
                }
                const num = marker.label || String(idx);
                const svg = `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg"><path d="M18 44 C18 44 34 28 34 16 C34 7 27 0 18 0 C9 0 2 7 2 16 C2 28 18 44 18 44Z" fill="#f59e0b" stroke="white" stroke-width="2"/><circle cx="18" cy="16" r="10" fill="white"/><text x="18" y="21" text-anchor="middle" fill="#d97706" font-size="14" font-weight="bold">${num}</text></svg>`;
                return (
                  <LeafletMarker key={`draft-stop-${idx}`} position={[marker.lat, marker.lng]}
                    icon={L.divIcon({ html: svg, className: '', iconSize: [36, 46], iconAnchor: [18, 44] })} />
                );
              })}
            </MapContainer>
          );
        })()}
        {activeJob ? (
          <div className="pointer-events-none absolute right-4 top-4 rounded-lg border border-slate-300 bg-white/95 p-4 text-xs text-slate-700 shadow-xl backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Focused Job
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {activeJob.reference}
            </p>
            <p>{activeJob.pickupAddress}</p>
            <p className="text-slate-600">→ {activeJob.dropoffAddress}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default DispatchMap;
