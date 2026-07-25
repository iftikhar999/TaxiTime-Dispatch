/**
 * Free Road Routing Service
 * Uses OSRM (Open Source Routing Machine) public API — completely free, no API key needed.
 * Returns real road-following routes as lat/lng arrays for both Google Maps and Leaflet.
 *
 * Fallback: If OSRM fails, generates a curved interpolated path (Bezier-like)
 * that looks more natural than a straight line.
 */

interface LatLng {
  lat: number;
  lng: number;
}

interface RouteResult {
  path: LatLng[];
  distance: number; // meters
  duration: number; // seconds
  source: 'osrm' | 'fallback';
}

interface AlternativeRoutesResult {
  routes: RouteResult[];
  selectedIndex: number;
}

// Simple in-memory cache to avoid duplicate requests
const routeCache = new Map<string, { result: RouteResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(points: LatLng[]): string {
  return points.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
}

/**
 * Fetch a real road-following route from OSRM (free, no API key).
 * Supports waypoints (intermediate stops).
 */
export async function getRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[] = []
): Promise<RouteResult> {
  // Build ordered list of all points
  const allPoints = [origin, ...waypoints, destination];
  const cacheKey = getCacheKey(allPoints);

  // Check cache
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    // OSRM expects coordinates as lng,lat (reversed from our lat,lng format)
    const coordsStr = allPoints
      .map(p => `${p.lng},${p.lat}`)
      .join(';');

    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error(`OSRM: ${data.code || 'no routes'}`);
    }

    const route = data.routes[0];
    // GeoJSON coordinates are [lng, lat] — convert to { lat, lng }
    const path: LatLng[] = route.geometry.coordinates.map(
      (coord: [number, number]) => ({
        lat: coord[1],
        lng: coord[0],
      })
    );

    const result: RouteResult = {
      path,
      distance: route.distance, // meters
      duration: route.duration, // seconds
      source: 'osrm',
    };

    // Cache it
    routeCache.set(cacheKey, { result, timestamp: Date.now() });

    return result;
  } catch (err) {
    console.warn('OSRM routing failed, using curved fallback:', err);
    return getCurvedFallbackRoute(origin, destination, waypoints);
  }
}

/**
 * Fallback: Generate a curved path between points using quadratic Bezier interpolation.
 * Looks much more natural than a straight line on a map.
 */
function getCurvedFallbackRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[] = []
): RouteResult {
  const allPoints = [origin, ...waypoints, destination];
  const path: LatLng[] = [];

  for (let i = 0; i < allPoints.length - 1; i++) {
    const start = allPoints[i];
    const end = allPoints[i + 1];
    const segmentPoints = interpolateCurve(start, end, 20);
    // Avoid duplicating the junction point
    if (i > 0) segmentPoints.shift();
    path.push(...segmentPoints);
  }

  // Rough distance calculation
  let distance = 0;
  for (let i = 1; i < path.length; i++) {
    distance += haversineDistance(path[i - 1], path[i]);
  }

  return {
    path,
    distance,
    duration: distance / 13.89, // ~50 km/h average speed estimate
    source: 'fallback',
  };
}

/**
 * Quadratic Bezier curve between two points with a perpendicular control point.
 * Creates a natural-looking curve offset from the straight line.
 */
function interpolateCurve(start: LatLng, end: LatLng, numPoints: number): LatLng[] {
  const midLat = (start.lat + end.lat) / 2;
  const midLng = (start.lng + end.lng) / 2;

  // Create perpendicular offset for control point (makes the curve)
  const dLat = end.lat - start.lat;
  const dLng = end.lng - start.lng;
  const dist = Math.sqrt(dLat * dLat + dLng * dLng);

  // Offset perpendicular to the line, proportional to distance (max 15% of distance)
  const offsetFactor = Math.min(dist * 0.15, 0.01);
  const controlLat = midLat + (-dLng / dist) * offsetFactor;
  const controlLng = midLng + (dLat / dist) * offsetFactor;

  const points: LatLng[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const invT = 1 - t;
    // Quadratic Bezier: B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
    points.push({
      lat: invT * invT * start.lat + 2 * invT * t * controlLat + t * t * end.lat,
      lng: invT * invT * start.lng + 2 * invT * t * controlLng + t * t * end.lng,
    });
  }
  return points;
}

/**
 * Haversine distance in meters between two points.
 */
function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a2 =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));
}

/**
 * Fetch route with alternative routes from OSRM.
 * Returns up to 3 routes sorted by distance (shortest first).
 */
export async function getRouteWithAlternatives(
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[] = []
): Promise<AlternativeRoutesResult> {
  const allPoints = [origin, ...waypoints, destination];
  const altCacheKey = 'alt:' + getCacheKey(allPoints);

  // Check alt cache
  const cached = routeCache.get(altCacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { routes: (cached as any).routes, selectedIndex: 0 };
  }

  try {
    const coordsStr = allPoints
      .map(p => `${p.lng},${p.lat}`)
      .join(';');

    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&alternatives=true`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error(`OSRM: ${data.code || 'no routes'}`);
    }

    const routes: RouteResult[] = data.routes.map((route: any) => ({
      path: route.geometry.coordinates.map(
        (coord: [number, number]) => ({ lat: coord[1], lng: coord[0] })
      ),
      distance: route.distance,
      duration: route.duration,
      source: 'osrm' as const,
    }));

    // Sort by distance ascending, limit to max 2 routes
    routes.sort((a, b) => a.distance - b.distance);
    const limitedRoutes = routes.slice(0, 2);

    // Cache it
    (routeCache as any).set(altCacheKey, { routes: limitedRoutes, timestamp: Date.now() });

    return { routes: limitedRoutes, selectedIndex: 0 };
  } catch (err) {
    console.warn('OSRM alternatives failed, using single route fallback:', err);
    const fallback = getCurvedFallbackRoute(origin, destination, waypoints);
    return { routes: [fallback], selectedIndex: 0 };
  }
}

/**
 * Clear the route cache (useful when switching contexts).
 */
export function clearRouteCache(): void {
  routeCache.clear();
}
