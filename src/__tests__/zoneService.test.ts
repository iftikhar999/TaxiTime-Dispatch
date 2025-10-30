/**
 * Zone Service Unit Tests
 * Tests the client-side zone detection algorithms
 */

import { describe, expect, it } from "vitest";
import {
  isPointInCircle,
  isPointInPolygon,
  isPointInRectangle,
} from "../services/zoneService";

describe("Zone Detection Algorithms", () => {
  describe("Circle Zone Detection (Haversine)", () => {
    const center = { lat: 40.7128, lng: -74.006 }; // NYC
    const radius = 5; // 5km

    it("should detect point at center", () => {
      const point = { lat: 40.7128, lng: -74.006 };
      const result = isPointInCircle(point, center, radius);
      expect(result).toBe(true);
    });

    it("should detect point 2km from center", () => {
      const point = { lat: 40.7128 + 0.018, lng: -74.006 }; // ~2km north
      const result = isPointInCircle(point, center, radius);
      expect(result).toBe(true);
    });

    it("should NOT detect point 10km from center", () => {
      const point = { lat: 40.7128 + 0.09, lng: -74.006 }; // ~10km north
      const result = isPointInCircle(point, center, radius);
      expect(result).toBe(false);
    });

    it("should detect point on exact boundary", () => {
      const point = { lat: 40.7128 + 0.045, lng: -74.006 }; // ~5km north
      const result = isPointInCircle(point, center, radius);
      expect(result).toBe(true);
    });
  });

  describe("Polygon Zone Detection (Ray Casting)", () => {
    // Simple square polygon
    const squarePolygon = [
      { lat: 40.7, lng: -74.01 }, // Bottom-left
      { lat: 40.7, lng: -74.0 }, // Bottom-right
      { lat: 40.71, lng: -74.0 }, // Top-right
      { lat: 40.71, lng: -74.01 }, // Top-left
    ];

    it("should detect point in center of polygon", () => {
      const point = { lat: 40.705, lng: -74.005 }; // Center
      const result = isPointInPolygon(point, squarePolygon);
      expect(result).toBe(true);
    });

    it("should NOT detect point outside polygon", () => {
      const point = { lat: 40.72, lng: -74.0 }; // Above square
      const result = isPointInPolygon(point, squarePolygon);
      expect(result).toBe(false);
    });

    it("should detect point on edge", () => {
      const point = { lat: 40.7, lng: -74.005 }; // On bottom edge
      const result = isPointInPolygon(point, squarePolygon);
      expect(result).toBe(true);
    });

    // Complex irregular polygon (L-shape)
    const lShapePolygon = [
      { lat: 40.7, lng: -74.01 },
      { lat: 40.7, lng: -74.0 },
      { lat: 40.705, lng: -74.0 },
      { lat: 40.705, lng: -74.005 },
      { lat: 40.71, lng: -74.005 },
      { lat: 40.71, lng: -74.01 },
    ];

    it("should detect point in L-shaped polygon", () => {
      const point = { lat: 40.702, lng: -74.008 }; // In vertical part
      const result = isPointInPolygon(point, lShapePolygon);
      expect(result).toBe(true);
    });

    it("should NOT detect point in L-shape cutout", () => {
      const point = { lat: 40.708, lng: -74.008 }; // In cutout area
      const result = isPointInPolygon(point, lShapePolygon);
      expect(result).toBe(false);
    });
  });

  describe("Rectangle Zone Detection (Bounds Check)", () => {
    const bounds = {
      north: 40.71,
      south: 40.7,
      east: -74.0,
      west: -74.01,
    };

    it("should detect point in center of rectangle", () => {
      const point = { lat: 40.705, lng: -74.005 };
      const result = isPointInRectangle(point, bounds);
      expect(result).toBe(true);
    });

    it("should detect point on boundary", () => {
      const point = { lat: 40.71, lng: -74.005 }; // On north edge
      const result = isPointInRectangle(point, bounds);
      expect(result).toBe(true);
    });

    it("should NOT detect point outside rectangle", () => {
      const point = { lat: 40.72, lng: -74.005 }; // North of rectangle
      const result = isPointInRectangle(point, bounds);
      expect(result).toBe(false);
    });

    it("should NOT detect point west of rectangle", () => {
      const point = { lat: 40.705, lng: -74.02 }; // West
      const result = isPointInRectangle(point, bounds);
      expect(result).toBe(false);
    });

    it("should NOT detect point east of rectangle", () => {
      const point = { lat: 40.705, lng: -73.99 }; // East
      const result = isPointInRectangle(point, bounds);
      expect(result).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero radius circle", () => {
      const center = { lat: 40.7128, lng: -74.006 };
      const point = { lat: 40.7128, lng: -74.006 };
      const result = isPointInCircle(point, center, 0);
      expect(result).toBe(true);
    });

    it("should handle very large circle", () => {
      const center = { lat: 40.7128, lng: -74.006 };
      const point = { lat: 41.0, lng: -74.0 }; // ~30km away
      const result = isPointInCircle(point, center, 50); // 50km radius
      expect(result).toBe(true);
    });

    it("should handle triangle polygon", () => {
      const triangle = [
        { lat: 40.7, lng: -74.01 },
        { lat: 40.71, lng: -74.0 },
        { lat: 40.7, lng: -74.0 },
      ];
      const point = { lat: 40.703, lng: -74.005 };
      const result = isPointInPolygon(point, triangle);
      expect(result).toBe(true);
    });

    it("should handle empty polygon", () => {
      const emptyPolygon = [];
      const point = { lat: 40.705, lng: -74.005 };
      const result = isPointInPolygon(point, emptyPolygon);
      expect(result).toBe(false);
    });

    it("should handle rectangle with swapped coordinates", () => {
      const bounds = {
        north: 40.7, // Should be larger
        south: 40.71, // Should be smaller
        east: -74.01, // Should be larger
        west: -74.0, // Should be smaller
      };
      const point = { lat: 40.705, lng: -74.005 };
      const result = isPointInRectangle(point, bounds);
      expect(result).toBe(false); // Invalid bounds
    });
  });

  describe("Performance Tests", () => {
    it("should detect circle quickly", () => {
      const center = { lat: 40.7128, lng: -74.006 };
      const point = { lat: 40.7128, lng: -74.006 };
      const iterations = 10000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        isPointInCircle(point, center, 5);
      }
      const duration = performance.now() - start;

      console.log(
        `✅ ${iterations} circle detections in ${duration.toFixed(2)}ms`
      );
      expect(duration).toBeLessThan(100); // Should be fast
    });

    it("should detect polygon quickly", () => {
      const polygon = [
        { lat: 40.7, lng: -74.01 },
        { lat: 40.7, lng: -74.0 },
        { lat: 40.71, lng: -74.0 },
        { lat: 40.71, lng: -74.01 },
      ];
      const point = { lat: 40.705, lng: -74.005 };
      const iterations = 10000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        isPointInPolygon(point, polygon);
      }
      const duration = performance.now() - start;

      console.log(
        `✅ ${iterations} polygon detections in ${duration.toFixed(2)}ms`
      );
      expect(duration).toBeLessThan(200);
    });
  });
});

console.log("🧪 Zone Service Tests Ready");
console.log(
  "Run with: cd /Applications/A_B_TAXI/frontend/dispatch && npm test"
);
