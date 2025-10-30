/**
 * Geocoding Service Tests - Beast Mode Edition
 * Comprehensive test suite for location autocomplete functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getLocationSuggestions,
  getPlaceDetails,
  calculateDistance
} from '../services/geocodingService';

// Mock global environment
const mockGlobal = globalThis as any;

// Mock Google Maps API
const mockGoogleMaps = {
  places: {
    AutocompleteService: vi.fn(),
    AutocompleteSessionToken: vi.fn(),
    PlacesService: vi.fn(),
    PlacesServiceStatus: {
      OK: 'OK',
      ZERO_RESULTS: 'ZERO_RESULTS',
      OVER_QUERY_LIMIT: 'OVER_QUERY_LIMIT',
      REQUEST_DENIED: 'REQUEST_DENIED',
      INVALID_REQUEST: 'INVALID_REQUEST',
      UNKNOWN_ERROR: 'UNKNOWN_ERROR'
    }
  },
  DistanceMatrixService: vi.fn(),
  DistanceMatrixStatus: {
    OK: 'OK',
    INVALID_REQUEST: 'INVALID_REQUEST',
    OVER_QUERY_LIMIT: 'OVER_QUERY_LIMIT',
    REQUEST_DENIED: 'REQUEST_DENIED',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
  },
  TravelMode: {
    DRIVING: 'DRIVING'
  },
  LatLng: vi.fn((lat: number, lng: number) => ({ lat: () => lat, lng: () => lng }))
};

const mockPredictions = [
  {
    place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    description: 'Sydney NSW, Australia',
    structured_formatting: {
      main_text: 'Sydney',
      secondary_text: 'NSW, Australia'
    }
  },
  {
    place_id: 'ChIJOwg_06VPwokRYv534QaPC8g',
    description: 'New York, NY, USA',
    structured_formatting: {
      main_text: 'New York',
      secondary_text: 'NY, USA'
    }
  }
];

const mockPlaceDetails = {
  place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  formatted_address: 'Sydney NSW, Australia',
  geometry: {
    location: {
      lat: () => -33.8688,
      lng: () => 151.2093
    }
  }
};

// Mock fetch for OpenStreetMap
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('GeocodingService - Beast Mode Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset global state
    delete mockGlobal.google;
    delete mockGlobal.googleMapsLoadPromise;
    
    // Setup import.meta.env mock
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-api-key');
    
    // Setup console spies
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('Google Maps Provider - Success Cases', () => {
    beforeEach(() => {
      // Setup successful Google Maps mock
      mockGlobal.google = {
        maps: mockGoogleMaps
      };

      // Mock AutocompleteService
      const mockAutocompleteService = {
        getPlacePredictions: vi.fn((request: any, callback: any) => {
          setTimeout(() => callback(mockPredictions, 'OK'), 0);
        })
      };
      mockGoogleMaps.places.AutocompleteService.mockImplementation(() => mockAutocompleteService);
      mockGoogleMaps.places.AutocompleteSessionToken.mockImplementation(() => ({ token: 'test-session' }));

      // Mock PlacesService
      const mockPlacesService = {
        getDetails: vi.fn((request: any, callback: any) => {
          setTimeout(() => callback(mockPlaceDetails, 'OK'), 0);
        })
      };
      mockGoogleMaps.places.PlacesService.mockImplementation(() => mockPlacesService);
    });

    it('should return Google Places suggestions for valid query', async () => {
      const result = await getLocationSuggestions('Sydney', 'GOOGLE_MAPS');
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        provider: 'GOOGLE_MAPS',
        description: 'Sydney NSW, Australia',
        mainText: 'Sydney',
        secondaryText: 'NSW, Australia',
        raw: mockPredictions[0]
      });
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[GeocodingService] BEAST MODE - getLocationSuggestions called:'),
        expect.objectContaining({
          query: 'Sydney',
          provider: 'GOOGLE_MAPS',
          apiKeyExists: true,
          isBrowser: true
        })
      );
    });

    it('should return place details for valid place ID', async () => {
      const result = await getPlaceDetails('ChIJN1t_tDeuEmsRUsoyG83frY4', 'GOOGLE_MAPS');
      
      expect(result).toEqual({
        provider: 'GOOGLE_MAPS',
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        address: 'Sydney NSW, Australia',
        formattedAddress: 'Sydney NSW, Australia',
        lat: -33.8688,
        lng: 151.2093
      });
    });

    it('should calculate distance using Google Distance Matrix', async () => {
      const mockDistanceResponse = {
        rows: [{
          elements: [{
            status: 'OK',
            distance: { value: 15000 }, // 15km in meters
            duration: { value: 1200 } // 20 minutes in seconds
          }]
        }]
      };

      const mockDistanceService = {
        getDistanceMatrix: vi.fn((request: any, callback: any) => {
          setTimeout(() => callback(mockDistanceResponse, 'OK'), 0);
        })
      };
      mockGoogleMaps.DistanceMatrixService.mockImplementation(() => mockDistanceService);

      const origin = { lat: -33.8688, lng: 151.2093 };
      const destination = { lat: -33.8556, lng: 151.2175 };
      
      const result = await calculateDistance(origin, destination);
      
      expect(result).toEqual({
        distance: 15, // converted to km
        duration: 20, // converted to minutes
        origin,
        destination
      });
    });
  });

  describe('Google Maps Provider - Error Handling', () => {
    it('should fallback to OpenStreetMap when Google Maps API key is missing', async () => {
      vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
      
      // Mock successful OpenStreetMap response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          osm_id: 12345,
          display_name: 'Sydney, New South Wales, Australia',
          name: 'Sydney',
          lat: '-33.8688',
          lon: '151.2093'
        }]
      });

      const result = await getLocationSuggestions('Sydney', 'GOOGLE_MAPS');
      
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('OPENSTREETMAP');
      expect(console.error).toHaveBeenCalledWith(
        '[GeocodingService] No Google Maps API key found'
      );
    });

    it('should fallback to OpenStreetMap when Google Maps is not available', async () => {
      // Don't set up google.maps mock (simulates API not loaded)
      delete mockGlobal.google;
      
      // Mock successful OpenStreetMap response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          osm_id: 12345,
          display_name: 'Sydney, New South Wales, Australia',
          name: 'Sydney',
          lat: '-33.8688',
          lon: '151.2093'
        }]
      });

      const result = await getLocationSuggestions('Sydney', 'GOOGLE_MAPS');
      
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('OPENSTREETMAP');
      expect(console.warn).toHaveBeenCalledWith(
        '[GeocodingService] Google Maps not available, falling back to OpenStreetMap'
      );
    });

    it('should handle Google Places API errors gracefully', async () => {
      mockGlobal.google = { maps: mockGoogleMaps };
      
      // Mock API error
      const mockAutocompleteService = {
        getPlacePredictions: vi.fn((request: any, callback: any) => {
          setTimeout(() => callback([], 'REQUEST_DENIED'), 0);
        })
      };
      mockGoogleMaps.places.AutocompleteService.mockImplementation(() => mockAutocompleteService);

      // Mock OpenStreetMap fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      const result = await getLocationSuggestions('Sydney', 'GOOGLE_MAPS');
      
      expect(result).toHaveLength(0);
      expect(console.error).toHaveBeenCalledWith(
        '[GeocodingService] Google Places API error:', 'REQUEST_DENIED'
      );
    });

    it('should return mock data when all services fail', async () => {
      delete mockGlobal.google;
      
      // Mock OpenStreetMap failure
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getLocationSuggestions('New York', 'GOOGLE_MAPS');
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'mock-0',
        provider: 'OPENSTREETMAP',
        description: 'New York, USA',
        mainText: 'New York',
        secondaryText: 'USA',
        lat: 40.7128,
        lng: -74.006,
        raw: expect.any(Object)
      });
    });
  });

  describe('OpenStreetMap Provider', () => {
    it('should return OpenStreetMap suggestions for valid query', async () => {
      const mockOSMResponse = [
        {
          osm_id: 12345,
          display_name: 'Sydney, New South Wales, Australia',
          name: 'Sydney',
          lat: '-33.8688',
          lon: '151.2093'
        }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOSMResponse
      });

      const result = await getLocationSuggestions('Sydney', 'OPENSTREETMAP');
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '12345',
        provider: 'OPENSTREETMAP',
        description: 'Sydney, New South Wales, Australia',
        mainText: 'Sydney',
        secondaryText: 'New South Wales, Australia',
        lat: -33.8688,
        lng: 151.2093,
        raw: mockOSMResponse[0]
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://nominatim.openstreetmap.org/search'),
        expect.objectContaining({
          headers: {
            'User-Agent': 'TaxiTime-Dispatch/1.0'
          }
        })
      );
    });

    it('should handle OpenStreetMap API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await getLocationSuggestions('Sydney', 'OPENSTREETMAP');
      
      expect(result).toHaveLength(1); // Should return mock data
      expect(result[0].provider).toBe('OPENSTREETMAP');
      expect(console.error).toHaveBeenCalledWith(
        '[GeocodingService] OpenStreetMap error:',
        expect.any(Error)
      );
    });
  });

  describe('Input Validation', () => {
    it('should return empty array for queries shorter than 3 characters', async () => {
      const shortQueries = ['', ' ', 'ab', '  '];
      
      for (const query of shortQueries) {
        const result = await getLocationSuggestions(query, 'GOOGLE_MAPS');
        expect(result).toHaveLength(0);
      }
      
      expect(console.log).toHaveBeenCalledWith(
        '[GeocodingService] Query too short, returning empty array'
      );
    });

    it('should handle null and undefined queries', async () => {
      const result1 = await getLocationSuggestions(null as any, 'GOOGLE_MAPS');
      const result2 = await getLocationSuggestions(undefined as any, 'GOOGLE_MAPS');
      
      expect(result1).toHaveLength(0);
      expect(result2).toHaveLength(0);
    });
  });

  describe('Distance Calculation Fallbacks', () => {
    it('should use Haversine formula when Google Maps is unavailable', async () => {
      delete mockGlobal.google;
      
      const origin = { lat: 40.7128, lng: -74.006 }; // New York
      const destination = { lat: 51.5074, lng: -0.1278 }; // London
      
      const result = await calculateDistance(origin, destination);
      
      expect(result.distance).toBeGreaterThan(5000); // Should be ~5500km
      expect(result.duration).toBeGreaterThan(5000); // Should be ~5500 minutes
      expect(result.origin).toEqual(origin);
      expect(result.destination).toEqual(destination);
    });
  });

  describe('Mock Data Generation', () => {
    it('should return relevant mock locations for queries', async () => {
      delete mockGlobal.google;
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const testCases = [
        { query: 'New York', expectedCity: 'New York' },
        { query: 'london', expectedCity: 'London' },
        { query: 'PARIS', expectedCity: 'Paris' },
        { query: 'tokyo', expectedCity: 'Tokyo' },
        { query: 'sydney', expectedCity: 'Sydney' },
        { query: 'doha', expectedCity: 'Doha' }
      ];

      for (const testCase of testCases) {
        const result = await getLocationSuggestions(testCase.query, 'GOOGLE_MAPS');
        expect(result).toHaveLength(1);
        expect(result[0].mainText).toBe(testCase.expectedCity);
        expect(result[0].provider).toBe('OPENSTREETMAP');
      }
    });

    it('should return empty array for unmatched mock queries', async () => {
      delete mockGlobal.google;
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getLocationSuggestions('Unknown City', 'GOOGLE_MAPS');
      expect(result).toHaveLength(0);
    });
  });
});