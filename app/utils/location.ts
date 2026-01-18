/**
 * Location Utilities
 * Handles geolocation, distance calculations, and arrival time predictions
 */

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface TravelTimeEstimate {
  durationSeconds: number;
  durationMinutes: number;
  arrivalTime: string;
  distance: number; // meters
  mode: 'walking' | 'cycling' | 'driving';
}

/**
 * Get user's current location using Geolocation API
 */
export async function getCurrentLocation(): Promise<LocationCoordinates | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      console.warn('[Location] Geolocation not available');
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now()
        });
      },
      (error) => {
        console.warn('[Location] Geolocation error:', error);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/**
 * Calculate straight-line distance between two coordinates (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Estimate travel time based on mode and distance
 * Uses average speeds: walking 5km/h, cycling 15km/h, driving 40km/h
 */
export function estimateTravelTime(
  distanceMeters: number,
  mode: 'walking' | 'cycling' | 'driving'
): TravelTimeEstimate {
  const speeds = {
    walking: 5,    // km/h
    cycling: 15,   // km/h
    driving: 40    // km/h (conservative for urban)
  };

  const distanceKm = distanceMeters / 1000;
  const speed = speeds[mode];
  const durationSeconds = Math.round((distanceKm / speed) * 3600);
  const durationMinutes = Math.round(durationSeconds / 60);

  const arrival = new Date();
  arrival.setSeconds(arrival.getSeconds() + durationSeconds);

  return {
    durationSeconds,
    durationMinutes,
    arrivalTime: arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    distance: distanceMeters,
    mode
  };
}

/**
 * Check if a point (lat, lon) is within a danger zone
 */
export function isPointInDangerZone(
  lat: number,
  lon: number,
  dangerZones: DangerZone[]
): DangerZone | null {
  for (const zone of dangerZones) {
    const distance = calculateDistance(lat, lon, zone.latitude, zone.longitude);
    if (distance <= zone.radiusMeters) {
      return zone;
    }
  }
  return null;
}

/**
 * Check if route intersects with danger zones
 * Returns zones that are near the route path
 */
export function findIntersectingDangerZones(
  routePath: [number, number][],
  dangerZones: DangerZone[],
  bufferMeters: number = 100
): DangerZone[] {
  const intersecting: DangerZone[] = [];

  for (const zone of dangerZones) {
    for (const [lat, lon] of routePath) {
      const distance = calculateDistance(lat, lon, zone.latitude, zone.longitude);
      if (distance <= zone.radiusMeters + bufferMeters) {
        if (!intersecting.find(z => z.id === zone.id)) {
          intersecting.push(zone);
        }
        break;
      }
    }
  }

  return intersecting;
}

export interface DangerZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timeRestrictions?: {
    startHour: number;
    endHour: number;
    dayOfWeek?: number[]; // 0-6 (Sunday-Saturday)
  };
  alternateRoute?: string;
}

/**
 * Get safety warning for a danger zone based on current time
 */
export function getSafetyWarning(zone: DangerZone): string | null {
  if (!zone.timeRestrictions) {
    return `⚠️ High-risk area: ${zone.name}. ${zone.description}`;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const dayOfWeek = now.getDay();

  const { startHour, endHour, dayOfWeek: restrictedDays } = zone.timeRestrictions;

  // Check if current time falls within restriction
  const isTimeRestricted = currentHour >= startHour && currentHour < endHour;
  const isDayRestricted = !restrictedDays || restrictedDays.includes(dayOfWeek);

  if (isTimeRestricted && isDayRestricted) {
    return `⚠️ CAUTION: ${zone.name} has restricted access ${startHour}:00-${endHour}:00. ${zone.description}`;
  }

  return null;
}

/**
 * Cache location in localStorage for offline support
 */
export function cacheLocation(location: LocationCoordinates): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('lastKnownLocation', JSON.stringify(location));
  }
}

/**
 * Retrieve cached location from localStorage
 */
export function getCachedLocation(): LocationCoordinates | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  const cached = localStorage.getItem('lastKnownLocation');
  return cached ? JSON.parse(cached) : null;
}
