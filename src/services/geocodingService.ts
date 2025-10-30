/**
 * Geocoding Service - Beast Mode Edition
 * Supports Google Maps Places API with robust fallbacks
 */

export type PlaceProvider = "GOOGLE_MAPS" | "OPENSTREETMAP";

export interface LocationSuggestion {
  id: string;
  provider: PlaceProvider;
  description: string;
  mainText: string;
  secondaryText: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  raw?: unknown;
}

export interface PlaceDetails {
  provider: PlaceProvider;
  placeId?: string;
  address: string;
  lat: number;
  lng: number;
  formattedAddress: string;
}

export interface DistanceResult {
  distance: number;
  duration: number;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}

const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  import.meta.env.VITE_GOOGLE_MAP_API_KEY ||
  "";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const GOOGLE_PROVIDER: PlaceProvider = "GOOGLE_MAPS";
const OSM_PROVIDER: PlaceProvider = "OPENSTREETMAP";
const DEFAULT_COUNTRY_RESTRICTION = undefined;

const isBrowser = typeof globalThis !== "undefined" && typeof globalThis.window !== "undefined";

const getGoogleMaps = async (): Promise<any> => {
  if (!isBrowser) {
    throw new Error("Not in browser environment");
  }

  if ((globalThis as any)?.google?.maps?.places) {
    return (globalThis as any).google.maps;
  }

  if ((globalThis as any).googleMapsLoadPromise) {
    try {
      await (globalThis as any).googleMapsLoadPromise;
      return (globalThis as any).google.maps;
    } catch (error) {
      console.error("Google Maps loading failed:", error);
      throw error;
    }
  }

  throw new Error("Google Maps API not available");
};

const isGoogleMapsAvailable = async (): Promise<boolean> => {
  try {
    const gmaps = await getGoogleMaps();
    return Boolean(gmaps?.places);
  } catch {
    return false;
  }
};

type SuggestionOptions = {
  sessionToken?: any;
  limit?: number;
  language?: string;
};

export async function getLocationSuggestions(
  query: string,
  provider: PlaceProvider,
  options: SuggestionOptions = {}
): Promise<LocationSuggestion[]> {
  console.log("[GeocodingService] BEAST MODE - getLocationSuggestions called:", { 
    query, 
    provider, 
    options,
    apiKeyExists: Boolean(GOOGLE_MAPS_API_KEY),
    isBrowser
  });
  
  if (!query || query.trim().length < 3) {
    console.log("[GeocodingService] Query too short, returning empty array");
    return [];
  }

  if (provider === GOOGLE_PROVIDER) {
    console.log("[GeocodingService] Attempting Google Places API...");
    
    if (!GOOGLE_MAPS_API_KEY) {
      console.error("[GeocodingService] No Google Maps API key found");
      return getOpenStreetMapSuggestions(query, options);
    }

    try {
      const isAvailable = await isGoogleMapsAvailable();
      console.log("[GeocodingService] Google Maps availability:", isAvailable);
      
      if (!isAvailable) {
        console.warn("[GeocodingService] Google Maps not available, falling back to OpenStreetMap");
        return getOpenStreetMapSuggestions(query, options);
      }

      const gmaps = await getGoogleMaps();
      console.log("[GeocodingService] Google Maps loaded successfully");
      
      const service = new gmaps.places.AutocompleteService();
      const sessionToken = options.sessionToken ?? new gmaps.places.AutocompleteSessionToken();

      return await new Promise<LocationSuggestion[]>((resolve, reject) => {
        console.log("[GeocodingService] Making Google Places API call...");
        
        const requestOptions = {
          input: query,
          sessionToken,
          componentRestrictions: DEFAULT_COUNTRY_RESTRICTION,
          language: options.language ?? "en",
        };
        console.log("[GeocodingService] Request options:", requestOptions);

        service.getPlacePredictions(requestOptions, (predictions: any[], status: string) => {
          console.log("[GeocodingService] Google Places API response:", { 
            status, 
            predictionsCount: predictions?.length || 0,
            predictions: predictions?.slice(0, 3)
          });

          const PlacesStatus = gmaps.places.PlacesServiceStatus;
          
          if (status === PlacesStatus.OK && Array.isArray(predictions)) {
            const results = predictions.map((prediction) => ({
              id: prediction.place_id,
              placeId: prediction.place_id,
              provider: GOOGLE_PROVIDER,
              description: prediction.description,
              mainText: prediction.structured_formatting.main_text,
              secondaryText: prediction.structured_formatting.secondary_text || "",
              raw: prediction,
            }));
            console.log("[GeocodingService] Returning", results.length, "Google results");
            resolve(results);
          } else if (status === PlacesStatus.ZERO_RESULTS) {
            console.log("[GeocodingService] Zero results from Google Places");
            resolve([]);
          } else {
            console.error("[GeocodingService] Google Places API error:", status);
            getOpenStreetMapSuggestions(query, options).then(resolve).catch(reject);
          }
        });
      });
    } catch (error) {
      console.error("[GeocodingService] Google Places error:", error);
      return getOpenStreetMapSuggestions(query, options);
    }
  }

  return getOpenStreetMapSuggestions(query, options);
}

async function getOpenStreetMapSuggestions(
  query: string,
  options: SuggestionOptions = {}
): Promise<LocationSuggestion[]> {
  console.log("[GeocodingService] Using OpenStreetMap fallback for:", query);
  
  try {
    const limit = options.limit || 5;
    const language = options.language || "en";
    
    const url = `${NOMINATIM_BASE_URL}/search?` + new URLSearchParams({
      q: query,
      format: "json",
      addressdetails: "1",
      limit: limit.toString(),
      "accept-language": language,
    });

    console.log("[GeocodingService] Making OpenStreetMap request:", url);
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "TaxiTime-Dispatch/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`OpenStreetMap API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("[GeocodingService] OpenStreetMap response:", data?.length || 0, "results");

    const results = data.map((item: any, index: number) => ({
      id: item.osm_id?.toString() || `osm-${index}`,
      provider: OSM_PROVIDER,
      description: item.display_name,
      mainText: item.name || item.display_name.split(",")[0],
      secondaryText: item.display_name.split(",").slice(1).join(",").trim(),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      raw: item,
    }));

    console.log("[GeocodingService] Returning", results.length, "OpenStreetMap results");
    return results;
  } catch (error) {
    console.error("[GeocodingService] OpenStreetMap error:", error);
    return getMockLocationSuggestions(query, OSM_PROVIDER);
  }
}

export async function getPlaceDetails(
  input: LocationSuggestion | string,
  providerOverride?: PlaceProvider
): Promise<PlaceDetails> {
  const provider = providerOverride || (typeof input === "string" ? GOOGLE_PROVIDER : input.provider);

  if (provider === GOOGLE_PROVIDER) {
    try {
      const isAvailable = await isGoogleMapsAvailable();
      if (!isAvailable) {
        console.warn("[GeocodingService] Google Maps not available for place details");
        return getMockPlaceDetails(input);
      }

      const placeId = typeof input === "string" ? input : input.placeId || input.id;
      if (!placeId) {
        throw new Error("Place ID is required for Google place details");
      }

      const gmaps = await getGoogleMaps();
      const service = new gmaps.places.PlacesService(document.createElement("div"));

      return await new Promise<PlaceDetails>((resolve, reject) => {
        service.getDetails(
          {
            placeId,
            fields: ["place_id", "formatted_address", "geometry"],
          },
          (place: any, status: string) => {
            const PlacesStatus = gmaps.places.PlacesServiceStatus;
            if (status === PlacesStatus.OK && place?.geometry?.location) {
              resolve({
                provider: GOOGLE_PROVIDER,
                placeId: place.place_id,
                address: place.formatted_address ?? "",
                formattedAddress: place.formatted_address ?? "",
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
              });
            } else {
              reject(new Error(`Place details error: ${status}`));
            }
          }
        );
      });
    } catch (error) {
      console.error("[GeocodingService] Google place details error:", error);
      return getMockPlaceDetails(input);
    }
  }

  if (typeof input !== "string" && input.lat !== undefined && input.lng !== undefined) {
    return {
      provider: OSM_PROVIDER,
      placeId: input.placeId ?? input.id,
      address: input.description,
      formattedAddress: input.description,
      lat: Number(input.lat),
      lng: Number(input.lng),
    };
  }

  throw new Error("Invalid input for place details");
}

export async function calculateDistance(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<DistanceResult> {
  try {
    const isAvailable = await isGoogleMapsAvailable();
    if (!isAvailable) {
      return calculateHaversineDistance(origin, destination);
    }

    const gmaps = await getGoogleMaps();
    const service = new gmaps.DistanceMatrixService();

    return await new Promise<DistanceResult>((resolve, reject) => {
      service.getDistanceMatrix(
        {
          origins: [new gmaps.LatLng(origin.lat, origin.lng)],
          destinations: [new gmaps.LatLng(destination.lat, destination.lng)],
          travelMode: gmaps.TravelMode.DRIVING,
        },
        (response: any, status: string) => {
          const MatrixStatus = gmaps.DistanceMatrixStatus;
          if (status === MatrixStatus.OK && response) {
            const element = response.rows[0]?.elements[0];
            if (element && element.status === "OK") {
              resolve({
                distance: element.distance.value / 1000,
                duration: element.duration.value / 60,
                origin,
                destination,
              });
            } else {
              resolve(calculateHaversineDistance(origin, destination));
            }
          } else {
            resolve(calculateHaversineDistance(origin, destination));
          }
        }
      );
    });
  } catch (error) {
    console.error("[GeocodingService] Distance calculation error:", error);
    return calculateHaversineDistance(origin, destination);
  }
}

function calculateHaversineDistance(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): DistanceResult {
  const R = 6371;
  const dLat = toRad(destination.lat - origin.lat);
  const dLng = toRad(destination.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.lat)) * Math.cos(toRad(destination.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  const duration = (distance / 60) * 60;

  return {
    distance,
    duration,
    origin,
    destination,
  };
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function getMockLocationSuggestions(query: string, provider: PlaceProvider): LocationSuggestion[] {
  console.log("[GeocodingService] Using mock suggestions for:", query);
  
  const mockLocations = [
    { name: "New York", lat: 40.7128, lng: -74.0060, country: "USA" },
    { name: "London", lat: 51.5074, lng: -0.1278, country: "UK" },
    { name: "Paris", lat: 48.8566, lng: 2.3522, country: "France" },
    { name: "Tokyo", lat: 35.6762, lng: 139.6503, country: "Japan" },
    { name: "Sydney", lat: -33.8688, lng: 151.2093, country: "Australia" },
    { name: "Doha", lat: 25.2854, lng: 51.5310, country: "Qatar" },
  ];

  return mockLocations
    .filter(loc => loc.name.toLowerCase().includes(query.toLowerCase()))
    .map((loc, index) => ({
      id: `mock-${index}`,
      provider,
      description: `${loc.name}, ${loc.country}`,
      mainText: loc.name,
      secondaryText: loc.country,
      lat: loc.lat,
      lng: loc.lng,
      raw: loc,
    }));
}

function getMockPlaceDetails(input: LocationSuggestion | string): PlaceDetails {
  console.log("[GeocodingService] Using mock place details for:", input);
  
  if (typeof input === "string") {
    return {
      provider: GOOGLE_PROVIDER,
      placeId: input,
      address: "Mock Location",
      formattedAddress: "Mock Location",
      lat: 25.2854,
      lng: 51.5310,
    };
  }

  return {
    provider: input.provider,
    placeId: input.placeId || input.id,
    address: input.description,
    formattedAddress: input.description,
    lat: input.lat || 25.2854,
    lng: input.lng || 51.5310,
  };
}
