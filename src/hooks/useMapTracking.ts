import { useEffect, useRef, useCallback, useState } from 'react';
import { useDispatchStore } from '../store/useDispatchStore';

interface RealTimeUpdate {
  type: 'driver_location' | 'driver_status' | 'job_status' | 'new_job' | 'job_completed';
  driverId?: string;
  jobId?: string;
  data: any;
  timestamp: number;
}

interface MapUpdateEvent {
  type: 'location_update' | 'status_change' | 'route_update' | 'zone_update';
  payload: any;
  priority: 'high' | 'medium' | 'low';
}

export const useRealTimeMapTracking = () => {
  const { 
    drivers, 
    jobs, 
    updateDriverLocation, 
    updateJob,
    upsertDriver 
  } = useDispatchStore();

  const [isConnected, setIsConnected] = useState(false);
  const [updateQueue, setUpdateQueue] = useState<MapUpdateEvent[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  
  const wsRef = useRef<WebSocket | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout>();
  const batchUpdateRef = useRef<Map<string, RealTimeUpdate>>(new Map());

  // 🔌 WebSocket Connection Management
  const connectWebSocket = useCallback(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
    
    try {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('🔌 Real-time map tracking connected');
        setIsConnected(true);
        
        // Subscribe to map-relevant events
        wsRef.current?.send(JSON.stringify({
          type: 'subscribe',
          channels: ['driver_locations', 'driver_status', 'job_updates', 'zone_updates']
        }));
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const update: RealTimeUpdate = JSON.parse(event.data);
          handleRealTimeUpdate(update);
        } catch (error) {
          console.error('🚫 Failed to parse WebSocket message:', error);
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('🔌 WebSocket connection closed, attempting reconnect...');
        setIsConnected(false);
        
        // Exponential backoff reconnection
        setTimeout(() => {
          connectWebSocket();
        }, Math.min(1000 * Math.pow(2, 3), 30000));
      };
      
      wsRef.current.onerror = (error) => {
        console.error('🚫 WebSocket error:', error);
        setIsConnected(false);
      };
      
    } catch (error) {
      console.error('🚫 Failed to connect WebSocket:', error);
    }
  }, []);

  // 📡 Handle Real-time Updates
  const handleRealTimeUpdate = useCallback((update: RealTimeUpdate) => {
    const mapEvent: MapUpdateEvent = convertToMapEvent(update);
    
    // Batch updates for performance
    batchUpdateRef.current.set(`${update.type}-${update.driverId || update.jobId}`, update);
    
    // Add to update queue with priority
    setUpdateQueue(prev => {
      const filtered = prev.filter(event => 
        !(event.type === mapEvent.type && 
          event.payload.id === mapEvent.payload.id)
      );
      return [...filtered, mapEvent].sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });
    });
  }, []);

  // 🔄 Helper functions for updates
  const updateDriverLocationData = useCallback((update: RealTimeUpdate) => {
    if (update.driverId && update.data.position) {
      updateDriverLocation(update.driverId, {
        latitude: update.data.position.lat,
        longitude: update.data.position.lng,
        heading: update.data.heading,
      });
    }
  }, [updateDriverLocation]);

  const updateDriverStatusData = useCallback((update: RealTimeUpdate) => {
    if (update.driverId && update.data.status) {
      const existingDriver = drivers.find(d => d.id === update.driverId);
      if (existingDriver) {
        upsertDriver({ ...existingDriver, status: update.data.status });
      }
    }
  }, [drivers, upsertDriver]);

  const updateJobStatusData = useCallback((update: RealTimeUpdate) => {
    if (update.jobId && update.data.status) {
      const existingJob = jobs.find(j => j.id === update.jobId);
      if (existingJob) {
        updateJob({ ...existingJob, status: update.data.status });
      }
    }
  }, [jobs, updateJob]);

  const addNewJob = useCallback((update: RealTimeUpdate) => {
    if (update.data.job) {
      updateJob(update.data.job);
    }
  }, [updateJob]);

  // 🔄 Process Individual Update
  const processUpdate = useCallback((update: RealTimeUpdate) => {
    switch (update.type) {
      case 'driver_location':
        updateDriverLocationData(update);
        break;
      case 'driver_status':
        updateDriverStatusData(update);
        break;
      case 'job_status':
        updateJobStatusData(update);
        break;
      case 'new_job':
        addNewJob(update);
        break;
    }
  }, [updateDriverLocationData, updateDriverStatusData, updateJobStatusData, addNewJob]);

  // 🔄 Process Batched Updates
  const processBatchedUpdates = useCallback(() => {
    const updates = Array.from(batchUpdateRef.current.values());
    batchUpdateRef.current.clear();
    
    if (updates.length === 0) return;
    
    console.log(`🔄 Processing ${updates.length} real-time updates`);
    
    for (const update of updates) {
      processUpdate(update);
    }
    
    setLastUpdate(Date.now());
  }, [processUpdate]);

  // 🎯 Convert Update to Map Event
  const convertToMapEvent = (update: RealTimeUpdate): MapUpdateEvent => {
    switch (update.type) {
      case 'driver_location':
        return {
          type: 'location_update',
          payload: {
            id: update.driverId,
            position: update.data.position,
            heading: update.data.heading,
            speed: update.data.speed,
          },
          priority: 'high',
        };
        
      case 'driver_status':
        return {
          type: 'status_change',
          payload: {
            id: update.driverId,
            status: update.data.status,
            previousStatus: update.data.previousStatus,
          },
          priority: 'medium',
        };
        
      case 'job_status':
        return {
          type: 'route_update',
          payload: {
            id: update.jobId,
            status: update.data.status,
            route: update.data.route,
            eta: update.data.eta,
          },
          priority: 'medium',
        };
        
      default:
        return {
          type: 'location_update',
          payload: update.data,
          priority: 'low',
        };
    }
  };

  // 📊 Real-time Metrics
  const getMetrics = useCallback(() => {
    const activeDrivers = drivers.filter(d => d.position).length;
    const totalJobs = jobs.length;
    const queueLength = updateQueue.length;
    const timeSinceLastUpdate = Date.now() - lastUpdate;
    
    return {
      isConnected,
      activeDrivers,
      totalJobs,
      queueLength,
      timeSinceLastUpdate,
      updateRate: (updates: number) => Math.round(updates / (timeSinceLastUpdate / 1000)),
    };
  }, [drivers, jobs, updateQueue, lastUpdate, isConnected]);

  // 🚀 Initialize and Cleanup
  useEffect(() => {
    connectWebSocket();
    
    // Process batched updates every 250ms for smooth animation
    updateIntervalRef.current = setInterval(processBatchedUpdates, 250);
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [connectWebSocket, processBatchedUpdates]);

  return {
    isConnected,
    updateQueue,
    metrics: getMetrics(),
    reconnect: connectWebSocket,
  };
};

// 🎮 Advanced Route Optimization Hook
export const useRouteOptimization = () => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedRoutes, setOptimizedRoutes] = useState<Map<string, any>>(new Map());
  
  const optimizeJobRoute = useCallback(async (
    pickup: { lat: number; lng: number },
    dropoff: { lat: number; lng: number },
    options: {
      avoidTolls?: boolean;
      avoidHighways?: boolean;
      includeAlternatives?: boolean;
      optimizeFor?: 'time' | 'distance' | 'traffic';
    } = {}
  ) => {
    setIsOptimizing(true);
    
    try {
      // Use Google Maps Directions API
      const directionsService = new google.maps.DirectionsService();
      
      const request: google.maps.DirectionsRequest = {
        origin: pickup,
        destination: dropoff,
        travelMode: google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: options.optimizeFor === 'traffic' 
            ? google.maps.TrafficModel.BEST_GUESS 
            : google.maps.TrafficModel.OPTIMISTIC,
        },
        avoidHighways: options.avoidHighways || false,
        avoidTolls: options.avoidTolls || false,
        provideRouteAlternatives: options.includeAlternatives || true,
      };
      
      return new Promise<any>((resolve, reject) => {
        directionsService.route(request, (result, status) => {
          if (status !== 'OK' || !result?.routes?.length) {
            reject(new Error(`Route optimization failed: ${status}`));
            return;
          }
          
          const route = result.routes[0];
          
          // Extract path helper
          const extractPath = (pathPoints: google.maps.LatLng[]) => 
            pathPoints.map(point => ({ lat: point.lat(), lng: point.lng() }));
          
          const routePath = extractPath(route.overview_path);
          const alternatives = result.routes.slice(1).map(altRoute => ({
            distance: altRoute.legs[0].distance?.text,
            duration: altRoute.legs[0].duration?.text,
            path: extractPath(altRoute.overview_path),
          }));
          
          const optimizedRoute = {
            distance: route.legs[0].distance?.text,
            duration: route.legs[0].duration?.text,
            durationInTraffic: route.legs[0].duration_in_traffic?.text,
            path: routePath,
            bounds: {
              northeast: {
                lat: route.bounds.getNorthEast().lat(),
                lng: route.bounds.getNorthEast().lng(),
              },
              southwest: {
                lat: route.bounds.getSouthWest().lat(),
                lng: route.bounds.getSouthWest().lng(),
              },
            },
            alternatives,
          };
          
          const routeKey = `${pickup.lat},${pickup.lng}-${dropoff.lat},${dropoff.lng}`;
          const newRoutes = new Map(optimizedRoutes);
          newRoutes.set(routeKey, optimizedRoute);
          setOptimizedRoutes(newRoutes);
          
          console.log('🛣️ Route optimized:', optimizedRoute);
          resolve(optimizedRoute);
        });
      });
    } catch (error) {
      console.error('🚫 Route optimization failed:', error);
      return null;
    } finally {
      setIsOptimizing(false);
    }
  }, []);

  const getOptimizedRoute = useCallback((
    pickup: { lat: number; lng: number },
    dropoff: { lat: number; lng: number }
  ) => {
    const routeKey = `${pickup.lat},${pickup.lng}-${dropoff.lat},${dropoff.lng}`;
    return optimizedRoutes.get(routeKey);
  }, [optimizedRoutes]);

  return {
    optimizeJobRoute,
    getOptimizedRoute,
    isOptimizing,
    routeCount: optimizedRoutes.size,
  };
};

// 🎯 Driver ETA Calculation Hook
export const useDriverETA = () => {
  const calculateETA = useCallback(async (
    driverPosition: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    includeTraffic: boolean = true
  ) => {
    try {
      const directionsService = new google.maps.DirectionsService();
      
      return new Promise<any>((resolve, reject) => {
        directionsService.route({
          origin: driverPosition,
          destination: destination,
          travelMode: google.maps.TravelMode.DRIVING,
          drivingOptions: includeTraffic ? {
            departureTime: new Date(),
            trafficModel: google.maps.TrafficModel.BEST_GUESS,
          } : undefined,
        }, (result, status) => {
          if (status === 'OK' && result?.routes?.[0]) {
            const leg = result.routes[0].legs[0];
            resolve({
              distance: leg.distance?.value || 0,
              duration: leg.duration?.value || 0,
              durationInTraffic: leg.duration_in_traffic?.value || leg.duration?.value || 0,
              distanceText: leg.distance?.text || '',
              durationText: leg.duration?.text || '',
              durationInTrafficText: leg.duration_in_traffic?.text || leg.duration?.text || '',
            });
          } else {
            reject(new Error(`ETA calculation failed: ${status}`));
          }
        });
      });
    } catch (error) {
      console.error('🚫 ETA calculation failed:', error);
      return null;
    }
  }, []);

  return { calculateETA };
};

export default {
  useRealTimeMapTracking,
  useRouteOptimization,
  useDriverETA,
};