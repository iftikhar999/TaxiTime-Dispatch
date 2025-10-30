import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  GoogleMap,
  LoadScript,
  Marker,
  InfoWindow,
  Polygon,
  Polyline,
  TrafficLayer,
  MarkerClusterer,
  HeatmapLayer,
  DirectionsRenderer,
  StreetViewPanorama,
} from '@react-google-maps/api';
import { useDispatchStore } from '../../store/useDispatchStore';
import { Driver, Job, Zone } from '../../types/index';
import { getDriverStatusColor, getDriverStatusText } from '../../utils/driverStatusColors';
import { MapPin, Navigation, Eye, Layers, TrendingUp, Settings } from 'lucide-react';

// Google Maps API libraries
const libraries: ("geometry" | "drawing" | "places" | "visualization" | "routes")[] = [
  "geometry", "drawing", "places", "visualization", "routes"
];

interface AdvancedMapState {
  showTraffic: boolean;
  showHeatmap: boolean;
  showClusters: boolean;
  showStreetView: boolean;
  viewMode: 'normal' | 'satellite' | 'hybrid' | 'terrain';
  heatmapData: 'demand' | 'revenue' | 'time';
}

interface CustomMarkerData {
  id: string;
  position: { lat: number; lng: number };
  type: 'driver' | 'pickup' | 'dropoff' | 'zone_center';
  data: any;
  priority: number;
}

interface RouteOptimization {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints?: { lat: number; lng: number }[];
  traffic: boolean;
  alternative: boolean;
}

const DispatchMapGoogle: React.FC = () => {
  const { 
    drivers, 
    jobs, // Changed from activeJobs to jobs
    zones, 
    selectedDriver, 
    selectedJob,
    jobDraft,
    setSelectedDriver,
    setSelectedJob 
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

  // Map instance and UI state
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<CustomMarkerData | null>(null);
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
  const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);
  const [routes, setRoutes] = useState<google.maps.DirectionsResult[]>([]);
  const [streetViewService, setStreetViewService] = useState<google.maps.StreetViewService | null>(null);

  // Performance optimization refs
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // 🗺️ Map Configuration with Enhanced Options
  const mapOptions: google.maps.MapOptions = useMemo(() => ({
    disableDefaultUI: false,
    clickableIcons: true,
    scrollwheel: true,
    disableDoubleClickZoom: false,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      position: google.maps.ControlPosition.TOP_RIGHT,
      mapTypeIds: [
        google.maps.MapTypeId.ROADMAP,
        google.maps.MapTypeId.SATELLITE,
        google.maps.MapTypeId.HYBRID,
        google.maps.MapTypeId.TERRAIN,
      ],
    },
    streetViewControl: true,
    streetViewControlOptions: {
      position: google.maps.ControlPosition.LEFT_TOP,
    },
    fullscreenControl: true,
    rotateControl: true,
    scaleControl: true,
    panControl: true,
    gestureHandling: 'greedy',
    restriction: {
      latLngBounds: {
        north: 26.5,
        south: 24.5,
        east: 52.5,
        west: 50.5,
      },
      strictBounds: false,
    },
    styles: [
      {
        featureType: 'poi.business',
        stylers: [{ visibility: 'off' }],
      },
      {
        featureType: 'transit',
        elementType: 'labels.icon',
        stylers: [{ visibility: 'off' }],
      },
    ],
  }), []);

  // 🎯 Smart Map Center Calculation
  const mapCenter = useMemo(() => {
    const driversWithLocation = drivers.filter(d => d.position);
    
    if (selectedDriver?.position) {
      return {
        lat: selectedDriver.position.latitude,
        lng: selectedDriver.position.longitude,
      };
    }
    
    if (selectedJob?.pickupLocation) {
      return {
        lat: selectedJob.pickupLocation.latitude,
        lng: selectedJob.pickupLocation.longitude,
      };
    }
    
    if (jobDraft?.pickup) {
      return {
        lat: jobDraft.pickup.latitude,
        lng: jobDraft.pickup.longitude,
      };
    }
    
    if (driversWithLocation.length > 0) {
      // Calculate center of all drivers
      const avgLat = driversWithLocation.reduce((sum, d) => sum + d.position!.latitude, 0) / driversWithLocation.length;
      const avgLng = driversWithLocation.reduce((sum, d) => sum + d.position!.longitude, 0) / driversWithLocation.length;
      return { lat: avgLat, lng: avgLng };
    }
    
    // Default to Doha center
    return { lat: 25.2854, lng: 51.531 };
  }, [drivers, selectedDriver, selectedJob, jobDraft]);

  // 🚗 Advanced Driver Markers with Custom Icons
  const driverMarkers = useMemo(() => {
    return drivers
      .filter(driver => driver.position)
      .map(driver => ({
        id: `driver-${driver.id}`,
        position: {
          lat: driver.position!.latitude,
          lng: driver.position!.longitude,
        },
        type: 'driver' as const,
        data: driver,
        priority: driver.status === 'available' ? 1 : 
                 driver.status === 'busy' ? 2 : 
                 driver.status === 'enroute_pickup' ? 3 : 4,
        icon: createAdvancedDriverIcon(driver),
      }));
  }, [drivers]);

  // 📍 Job-related Markers
  const jobMarkers = useMemo(() => {
    const markers: CustomMarkerData[] = [];
    
    // Active job markers
    for (const job of jobs) {
      if (job.pickupLocation) {
        markers.push({
          id: `pickup-${job.id}`,
          position: {
            lat: job.pickupLocation.latitude,
            lng: job.pickupLocation.longitude,
          },
          type: 'pickup',
          data: job,
          priority: 5,
        });
      }
      
      if (job.dropoffLocation) {
        markers.push({
          id: `dropoff-${job.id}`,
          position: {
            lat: job.dropoffLocation.latitude,
            lng: job.dropoffLocation.longitude,
          },
          type: 'dropoff',
          data: job,
          priority: 6,
        });
      }
    }
    
    // Draft job markers
    if (jobDraft?.pickup) {
      markers.push({
        id: 'draft-pickup',
        position: {
          lat: jobDraft.pickup.latitude,
          lng: jobDraft.pickup.longitude,
        },
        type: 'pickup',
        data: { isDraft: true, type: 'pickup' },
        priority: 10,
      });
    }
    
    if (jobDraft?.dropoff) {
      markers.push({
        id: 'draft-dropoff',
        position: {
          lat: jobDraft.dropoff.latitude,
          lng: jobDraft.dropoff.longitude,
        },
        type: 'dropoff',
        data: { isDraft: true, type: 'dropoff' },
        priority: 10,
      });
    }
    
    return markers;
  }, [jobs, jobDraft]);

  // 🔥 Heatmap Data Generation
  const heatmapData = useMemo(() => {
    if (!mapState.showHeatmap) return [];
    
    const data: google.maps.visualization.WeightedLocation[] = [];
    
    switch (mapState.heatmapData) {
      case 'demand':
        // Generate demand heatmap based on pickup frequency
        for (const job of jobs) {
          if (job.pickupLocation) {
            data.push({
              location: new google.maps.LatLng(
                job.pickupLocation.latitude,
                job.pickupLocation.longitude
              ),
              weight: 1,
            });
          }
        }
        break;
        
      case 'revenue': {
        // Generate revenue heatmap
        for (const job of jobs) {
          if (job.pickupLocation && job.fareEstimate) {
            data.push({
              location: new google.maps.LatLng(
                job.pickupLocation.latitude,
                job.pickupLocation.longitude
              ),
              weight: job.fareEstimate / 10, // Normalize weight
            });
          }
        }
        break;
      }
        
      case 'time': {
        // Generate time-based demand heatmap
        const now = new Date();
        for (const job of jobs) {
          if (job.pickupLocation && job.requestedAt) {
            const hoursDiff = (now.getTime() - new Date(job.requestedAt).getTime()) / (1000 * 60 * 60);
            const weight = Math.max(0.1, 1 - (hoursDiff / 24)); // Decay over 24 hours
            
            data.push({
              location: new google.maps.LatLng(
                job.pickupLocation.latitude,
                job.pickupLocation.longitude
              ),
              weight,
            });
          }
        }
        break;
      }
    }
    
    return data;
  }, [jobs, mapState.showHeatmap, mapState.heatmapData]);

  // 🛣️ Route Optimization
  const optimizeRoute = useCallback(async (config: RouteOptimization) => {
    if (!directionsService || !map) return;

    const request: google.maps.DirectionsRequest = {
      origin: config.origin,
      destination: config.destination,
      waypoints: config.waypoints?.map(wp => ({ location: wp, stopover: true })),
      travelMode: google.maps.TravelMode.DRIVING,
      drivingOptions: {
        departureTime: new Date(),
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
      },
      provideRouteAlternatives: config.alternative,
      avoidHighways: false,
      avoidTolls: false,
    };

    try {
      const result = await directionsService.route(request);
      if (result.status === 'OK') {
        setRoutes(prev => [...prev, result]);
        if (directionsRenderer) {
          directionsRenderer.setDirections(result);
        }
      }
    } catch (error) {
      console.error('🚫 Route optimization failed:', error);
    }
  }, [directionsService, directionsRenderer, map]);

  // 🎮 Map Event Handlers
  const handleMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
    
    // Initialize services
    const dirService = new google.maps.DirectionsService();
    const dirRenderer = new google.maps.DirectionsRenderer({
      draggable: true,
      suppressMarkers: false,
    });
    const streetService = new google.maps.StreetViewService();
    
    dirRenderer.setMap(map);
    
    setDirectionsService(dirService);
    setDirectionsRenderer(dirRenderer);
    setStreetViewService(streetService);
    
    // Add custom controls
    addCustomControls(map);
    
    console.log('🗺️ Enhanced Google Maps loaded with services');
  }, []);

  const handleMarkerClick = useCallback((marker: CustomMarkerData) => {
    setSelectedMarker(marker);
    
    // Auto-focus map on marker
    if (map) {
      map.panTo(marker.position);
      map.setZoom(16);
    }
    
    // Update store selections
    if (marker.type === 'driver') {
      setSelectedDriver(marker.data);
    } else if (marker.data.id && !marker.data.isDraft) {
      setSelectedJob(marker.data);
    }
  }, [map, setSelectedDriver, setSelectedJob]);

  // 🎛️ Custom Controls
  const addCustomControls = useCallback((map: google.maps.Map) => {
    // Traffic Control
    const trafficControlDiv = document.createElement('div');
    trafficControlDiv.className = 'custom-control';
    trafficControlDiv.innerHTML = `
      <button class="bg-white border border-gray-300 rounded px-3 py-2 shadow-sm hover:bg-gray-50">
        🚦 Traffic
      </button>
    `;
    trafficControlDiv.addEventListener('click', () => {
      setMapState(prev => ({ ...prev, showTraffic: !prev.showTraffic }));
    });
    
    // Heatmap Control
    const heatmapControlDiv = document.createElement('div');
    heatmapControlDiv.className = 'custom-control';
    heatmapControlDiv.innerHTML = `
      <button class="bg-white border border-gray-300 rounded px-3 py-2 shadow-sm hover:bg-gray-50">
        🔥 Heatmap
      </button>
    `;
    heatmapControlDiv.addEventListener('click', () => {
      setMapState(prev => ({ ...prev, showHeatmap: !prev.showHeatmap }));
    });
    
    map.controls[google.maps.ControlPosition.TOP_LEFT].push(trafficControlDiv);
    map.controls[google.maps.ControlPosition.TOP_LEFT].push(heatmapControlDiv);
  }, []);

  // 📱 Control Panel Component
  const ControlPanel = () => (
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
        
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mapState.showHeatmap}
            onChange={(e) => setMapState(prev => ({ ...prev, showHeatmap: e.target.checked }))}
            className="rounded"
          />
          <TrendingUp size={14} />
          Demand Heatmap
        </label>
        
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mapState.showClusters}
            onChange={(e) => setMapState(prev => ({ ...prev, showClusters: e.target.checked }))}
            className="rounded"
          />
          <Layers size={14} />
          Marker Clustering
        </label>
        
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mapState.showStreetView}
            onChange={(e) => setMapState(prev => ({ ...prev, showStreetView: e.target.checked }))}
            className="rounded"
          />
          <Eye size={14} />
          Street View
        </label>
      </div>
      
      <div className="border-t pt-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Heatmap Data
        </label>
        <select
          value={mapState.heatmapData}
          onChange={(e) => setMapState(prev => ({ 
            ...prev, 
            heatmapData: e.target.value as 'demand' | 'revenue' | 'time' 
          }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
        >
          <option value="demand">Pickup Demand</option>
          <option value="revenue">Revenue</option>
          <option value="time">Time-based</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="relative h-full w-full">
      <LoadScript
        googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}
        libraries={libraries}
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
          zoom={13}
          options={mapOptions}
          onLoad={handleMapLoad}
        >
          {/* Traffic Layer */}
          {mapState.showTraffic && <TrafficLayer />}
          
          {/* Heatmap Layer */}
          {mapState.showHeatmap && heatmapData.length > 0 && (
            <HeatmapLayer
              data={heatmapData}
              options={{
                radius: 50,
                opacity: 0.7,
                gradient: [
                  'rgba(0, 255, 255, 0)',
                  'rgba(0, 255, 255, 1)',
                  'rgba(0, 191, 255, 1)',
                  'rgba(0, 127, 255, 1)',
                  'rgba(0, 63, 255, 1)',
                  'rgba(0, 0, 255, 1)',
                  'rgba(0, 0, 223, 1)',
                  'rgba(0, 0, 191, 1)',
                  'rgba(0, 0, 159, 1)',
                  'rgba(0, 0, 127, 1)',
                  'rgba(63, 0, 91, 1)',
                  'rgba(127, 0, 63, 1)',
                  'rgba(191, 0, 31, 1)',
                  'rgba(255, 0, 0, 1)'
                ],
              }}
            />
          )}
          
          {/* Zone Polygons */}
          {zones.map(zone => {
            if (!zone.polygon || zone.polygon.length < 3) return null;
            
            return (
              <Polygon
                key={`zone-${zone.id}`}
                path={zone.polygon.map(coord => ({
                  lat: coord.lat,
                  lng: coord.lng,
                }))}
                options={{
                  fillColor: '#3b82f6',
                  fillOpacity: 0.1,
                  strokeColor: '#1d4ed8',
                  strokeWeight: 2,
                  strokeOpacity: 0.8,
                }}
              />
            );
          })}
          
          {/* Enhanced Markers with Clustering */}
          {mapState.showClusters ? (
            <MarkerClusterer
              options={{
                imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m',
                gridSize: 60,
                maxZoom: 15,
              }}
            >
              {(clusterer) => (
                <>
                  {[...driverMarkers, ...jobMarkers].map(marker => (
                    <Marker
                      key={marker.id}
                      position={marker.position}
                      icon={getMarkerIcon(marker)}
                      clusterer={clusterer}
                      onClick={() => handleMarkerClick(marker)}
                      title={getMarkerTitle(marker)}
                    />
                  ))}
                </>
              )}
            </MarkerClusterer>
          ) : (
            <>
              {[...driverMarkers, ...jobMarkers].map(marker => (
                <Marker
                  key={marker.id}
                  position={marker.position}
                  icon={getMarkerIcon(marker)}
                  onClick={() => handleMarkerClick(marker)}
                  title={getMarkerTitle(marker)}
                />
              ))}
            </>
          )}
          
          {/* Advanced Info Window */}
          {selectedMarker && (
            <InfoWindow
              position={selectedMarker.position}
              onCloseClick={() => setSelectedMarker(null)}
            >
              <div className="p-2 max-w-xs">
                {renderInfoWindowContent(selectedMarker)}
              </div>
            </InfoWindow>
          )}
          
          {/* Route Visualization */}
          {routes.map((route, index) => (
            <DirectionsRenderer
              key={`route-${index}`}
              directions={route}
              options={{
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: '#2563eb',
                  strokeWeight: 4,
                  strokeOpacity: 0.8,
                },
              }}
            />
          ))}
          
          {/* Street View Panorama */}
          {mapState.showStreetView && selectedMarker && (
            <StreetViewPanorama
              position={selectedMarker.position}
              options={{
                visible: true,
                pov: { heading: 0, pitch: 0 },
                zoom: 1,
              }}
            />
          )}
        </GoogleMap>
      </LoadScript>
      
      {/* Control Panel */}
      <ControlPanel />
      
      {/* Status Bar */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span>{drivers.filter(d => d.status === 'AVAILABLE').length} Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span>{drivers.filter(d => d.status === 'BUSY').length} Busy</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={14} />
            <span>{jobs.length} Active Jobs</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// 🎨 Helper Functions for Advanced Features
function createAdvancedDriverIcon(driver: Driver): google.maps.Icon {
  const statusColor = getDriverStatusColor(driver.status);
  const vehicleIcon = getVehicleIconPath(driver.vehicleType);
  
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="14" fill="${statusColor}" stroke="white" stroke-width="2"/>
        <text x="16" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold">
          ${vehicleIcon}
        </text>
      </svg>
    `)}`,
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  };
}

function getVehicleIconPath(vehicleType: string): string {
  switch (vehicleType?.toLowerCase()) {
    case 'sedan': return '🚗';
    case 'suv': return '🚙';
    case 'van': return '🚐';
    case 'bike': return '🏍️';
    default: return '🚕';
  }
}

function getMarkerIcon(marker: CustomMarkerData): google.maps.Icon {
  switch (marker.type) {
    case 'driver':
      return createAdvancedDriverIcon(marker.data);
    case 'pickup':
      return {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
          <svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="#22c55e"/>
            <circle cx="12" cy="12" r="6" fill="white"/>
            <text x="12" y="16" text-anchor="middle" fill="#22c55e" font-size="8" font-weight="bold">P</text>
          </svg>
        `)}`,
        scaledSize: new google.maps.Size(24, 32),
        anchor: new google.maps.Point(12, 32),
      };
    case 'dropoff':
      return {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
          <svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="#ef4444"/>
            <circle cx="12" cy="12" r="6" fill="white"/>
            <text x="12" y="16" text-anchor="middle" fill="#ef4444" font-size="8" font-weight="bold">D</text>
          </svg>
        `)}`,
        scaledSize: new google.maps.Size(24, 32),
        anchor: new google.maps.Point(12, 32),
      };
    default:
      return {
        url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
        scaledSize: new google.maps.Size(32, 32),
      };
  }
}

function getMarkerTitle(marker: CustomMarkerData): string {
  switch (marker.type) {
    case 'driver':
      return `${marker.data.name} - ${getDriverStatusText(marker.data.status)}`;
    case 'pickup':
      return marker.data.isDraft ? 'Draft Pickup' : `Pickup - Job ${marker.data.reference}`;
    case 'dropoff':
      return marker.data.isDraft ? 'Draft Dropoff' : `Dropoff - Job ${marker.data.reference}`;
    default:
      return 'Map Marker';
  }
}

function renderInfoWindowContent(marker: CustomMarkerData): JSX.Element {
  switch (marker.type) {
    case 'driver':
      const driver = marker.data;
      return (
        <div>
          <h4 className="font-semibold text-gray-900">{driver.name}</h4>
          <p className="text-sm text-gray-600">{driver.vehicle}</p>
          <p className="text-sm">
            <span 
              className="inline-block w-2 h-2 rounded-full mr-2"
              style={{ backgroundColor: getDriverStatusColor(driver.status) }}
            />
            {getDriverStatusText(driver.status)}
          </p>
          {driver.currentJobId && (
            <p className="text-sm text-blue-600">Job: {driver.currentJobId}</p>
          )}
        </div>
      );
    case 'pickup':
    case 'dropoff':
      const job = marker.data;
      return (
        <div>
          <h4 className="font-semibold text-gray-900">
            {marker.type === 'pickup' ? 'Pickup' : 'Dropoff'}
          </h4>
          {!job.isDraft && (
            <>
              <p className="text-sm text-gray-600">Job: {job.reference}</p>
              <p className="text-sm text-gray-600">Customer: {job.customerName}</p>
            </>
          )}
          {job.isDraft && (
            <p className="text-sm text-purple-600">Draft Location</p>
          )}
        </div>
      );
    default:
      return <div>Map Location</div>;
  }
}

export default DispatchMapGoogle;