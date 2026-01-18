'use client';

import { useEffect, useState } from 'react';
import { Clock, AlertTriangle, CheckCircle, MapPin } from 'lucide-react';
import { 
  TravelTimeEstimate, 
  DangerZone, 
  findIntersectingDangerZones, 
  getSafetyWarning 
} from '@/app/utils/location';
import safetyZonesData from '@/app/data/safetyZones.json';

interface SafetyContextProps {
  origin: [number, number] | undefined;
  destination: [number, number] | undefined;
  routePath: [number, number][] | null;
  travelMode: 'walking' | 'cycling' | 'driving';
  travelTime?: TravelTimeEstimate;
  isLoading?: boolean;
}

export default function SafetyContext({
  origin,
  destination,
  routePath,
  travelMode,
  travelTime,
  isLoading = false
}: SafetyContextProps) {
  const [dangerZones] = useState<DangerZone[]>(safetyZonesData.dangerZones as DangerZone[]);
  const [intersectingZones, setIntersectingZones] = useState<DangerZone[]>([]);
  const [activeWarnings, setActiveWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!routePath || routePath.length === 0) {
      setIntersectingZones([]);
      setActiveWarnings([]);
      return;
    }

    // Check for danger zones along the route
    const zones = findIntersectingDangerZones(routePath, dangerZones, 150);
    setIntersectingZones(zones);

    // Get active warnings based on current time
    const warnings = zones
      .map(zone => getSafetyWarning(zone))
      .filter((warning): warning is string => warning !== null);

    setActiveWarnings(warnings);
  }, [routePath, dangerZones]);

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-red-100 border-red-300 text-red-800';
      case 'high':
        return 'bg-orange-100 border-orange-300 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'low':
        return 'bg-green-100 border-green-300 text-green-800';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  return (
    <div className="space-y-3">
      {/* Arrival Time Display */}
      {travelTime && (
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-blue-700">
              <Clock className="w-5 h-5" />
              <span className="font-semibold">Expected Arrival</span>
            </div>
            <div className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">
              {travelMode.toUpperCase()}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded p-2 text-center">
              <div className="text-xs text-gray-600 font-medium">Time</div>
              <div className="text-xl font-bold text-blue-600">{travelTime.arrivalTime}</div>
            </div>
            <div className="bg-white rounded p-2 text-center">
              <div className="text-xs text-gray-600 font-medium">Duration</div>
              <div className="text-xl font-bold text-green-600">{travelTime.durationMinutes} min</div>
            </div>
            <div className="bg-white rounded p-2 text-center">
              <div className="text-xs text-gray-600 font-medium">Distance</div>
              <div className="text-xl font-bold text-purple-600">
                {(travelTime.distance / 1000).toFixed(2)} km
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Warnings */}
      {activeWarnings.length > 0 && (
        <div className="space-y-2">
          {activeWarnings.map((warning, idx) => (
            <div
              key={idx}
              className="bg-red-50 border border-red-300 rounded-lg p-3 flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">{warning}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Danger Zones on Route */}
      {intersectingZones.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Safety Zones on Route:</h4>
          {intersectingZones.map((zone) => (
            <div
              key={zone.id}
              className={`border rounded-lg p-3 ${getRiskLevelColor(zone.riskLevel)}`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span className="font-semibold">{zone.name}</span>
                </div>
                <span className="text-xs font-bold uppercase px-2 py-1 bg-white bg-opacity-60 rounded">
                  {zone.riskLevel}
                </span>
              </div>
              <p className="text-sm mb-2">{zone.description}</p>
              {zone.timeRestrictions && (
                <p className="text-xs font-medium mb-1">
                  ⏰ Restricted: {zone.timeRestrictions.startHour}:00 - {zone.timeRestrictions.endHour}:00
                </p>
              )}
              {zone.alternateRoute && (
                <p className="text-xs bg-white bg-opacity-50 p-2 rounded">
                  💡 <strong>Alternative:</strong> {zone.alternateRoute}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Safe Route */}
      {routePath && intersectingZones.length === 0 && !isLoading && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-3 flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">✓ Route appears to be safe for {travelMode}</span>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 animate-pulse">
          <div className="flex items-center gap-2 text-gray-600">
            <Clock className="w-5 h-5" />
            <span className="text-sm">Analyzing route safety...</span>
          </div>
        </div>
      )}
    </div>
  );
}
