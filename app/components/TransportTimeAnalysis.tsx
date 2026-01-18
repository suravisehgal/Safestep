import { RouteData } from '../services/RouteService';
import { RouteTimeAnalysis } from '../services/GeminiService';

interface TransportTimeAnalysisProps {
  routeOptions: {
    walking: RouteData | null;
    cycling: RouteData | null;
    driving: RouteData | null;
  };
  routeTimeAnalysis?: {
    walking: RouteTimeAnalysis | null;
    cycling: RouteTimeAnalysis | null;
    driving: RouteTimeAnalysis | null;
  };
}

interface ModeAnalysis {
  mode: 'walking' | 'cycling' | 'driving';
  label: string;
  icon: string;
  distance: number; // in km
  duration: number; // in seconds
  durationMinutes: number;
  averageSpeed: number; // in km/h
  color: string;
}

export default function TransportTimeAnalysis({ routeOptions, routeTimeAnalysis }: TransportTimeAnalysisProps) {
  // Calculate modes with validation
  const rawModes: ModeAnalysis[] = [
    {
      mode: 'walking',
      label: 'Walking',
      icon: 'directions_walk',
      distance: routeOptions.walking ? routeOptions.walking.distance / 1000 : 0,
      duration: routeOptions.walking?.duration || 0,
      durationMinutes: routeOptions.walking ? Math.round(routeOptions.walking.duration / 60) : 0,
      averageSpeed: routeOptions.walking && routeOptions.walking.duration > 0 
        ? (routeOptions.walking.distance / 1000) / (routeOptions.walking.duration / 3600) 
        : 0,
      color: 'text-blue-400'
    },
    {
      mode: 'cycling',
      label: 'Cycling',
      icon: 'directions_bike',
      distance: routeOptions.cycling ? routeOptions.cycling.distance / 1000 : 0,
      duration: routeOptions.cycling?.duration || 0,
      durationMinutes: routeOptions.cycling ? Math.round(routeOptions.cycling.duration / 60) : 0,
      averageSpeed: routeOptions.cycling && routeOptions.cycling.duration > 0
        ? (routeOptions.cycling.distance / 1000) / (routeOptions.cycling.duration / 3600)
        : 0,
      color: 'text-green-400'
    },
    {
      mode: 'driving',
      label: 'Driving',
      icon: 'directions_car',
      distance: routeOptions.driving ? routeOptions.driving.distance / 1000 : 0,
      duration: routeOptions.driving?.duration || 0,
      durationMinutes: routeOptions.driving ? Math.round(routeOptions.driving.duration / 60) : 0,
      averageSpeed: routeOptions.driving && routeOptions.driving.duration > 0
        ? (routeOptions.driving.distance / 1000) / (routeOptions.driving.duration / 3600)
        : 0,
      color: 'text-purple-400'
    }
  ].filter(mode => mode.duration > 0 && mode.distance > 0); // Only show modes with valid data

  // Validate and fix: Bike should be faster than walking if distances are similar
  // If bike route is within 20% distance of walking route, bike should be faster
  const walkingMode = rawModes.find(m => m.mode === 'walking');
  const cyclingMode = rawModes.find(m => m.mode === 'cycling');
  
  // Create corrected modes array
  let correctedModes = [...rawModes];
  
  if (walkingMode && cyclingMode) {
    const distanceRatio = cyclingMode.distance / walkingMode.distance;
    
    // If bike distance is similar to walking (within 20%), bike should be faster
    if (distanceRatio >= 0.8 && distanceRatio <= 1.2) {
      if (cyclingMode.duration > walkingMode.duration) {
        // Bike is slower than walking - this is wrong, recalculate based on realistic speed
        console.warn(`Bike duration (${cyclingMode.duration}s) is longer than walking (${walkingMode.duration}s). Recalculating bike time.`);
        const bikeSpeed = 15; // km/h
        const correctedDuration = (cyclingMode.distance / bikeSpeed) * 3600;
        const correctedIndex = correctedModes.findIndex(m => m.mode === 'cycling');
        if (correctedIndex !== -1) {
          correctedModes[correctedIndex] = {
            ...cyclingMode,
            duration: correctedDuration,
            durationMinutes: Math.round(correctedDuration / 60),
            averageSpeed: bikeSpeed
          };
        }
      }
    }
  }

  // Sort modes by duration (fastest first) for display
  const modes = correctedModes.sort((a, b) => a.duration - b.duration);

  if (modes.length === 0) {
    return null;
  }

  // Find the longest duration for scaling the bar chart
  const maxDuration = Math.max(...modes.map(m => m.duration));
  // Note: Different modes may have different distances (bike routes, car routes can differ)
  const avgDistance = modes.reduce((sum, m) => sum + m.distance, 0) / modes.length;

  // Calculate time savings
  const getTimeSavings = (currentMode: ModeAnalysis, referenceMode: ModeAnalysis) => {
    if (currentMode.duration >= referenceMode.duration) return null;
    const saved = referenceMode.duration - currentMode.duration;
    const savedMinutes = Math.round(saved / 60);
    const percentage = Math.round((saved / referenceMode.duration) * 100);
    return { savedMinutes, percentage };
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatArrival = (seconds: number) => {
    const now = new Date();
    now.setSeconds(now.getSeconds() + seconds);
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getDisplayDuration = (mode: ModeAnalysis) => {
    const timeAnalysis = routeTimeAnalysis?.[mode.mode];
    if (timeAnalysis) {
      return timeAnalysis.adjustedDuration;
    }
    return mode.duration;
  };

  const getArrivalTime = (mode: ModeAnalysis) => {
    // Calculate arrival time dynamically from the current adjusted duration
    const displayDuration = getDisplayDuration(mode);
    return formatArrival(displayDuration);
  };

  return (
    <div className="bg-slate-800/90 backdrop-blur-md rounded-2xl p-5 border border-slate-700 shadow-xl mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-neon-mint">analytics</span>
          Travel Time Analysis
        </h3>
        <div className="text-slate-400 text-sm">
          <span className="font-semibold text-white">{avgDistance.toFixed(2)}</span> km
          <span className="text-xs text-slate-500 ml-1">(avg)</span>
        </div>
      </div>

      {/* Distance vs Time Comparison Chart */}
      <div className="space-y-3 mb-4">
        {modes.map((mode) => {
          const barWidth = (mode.duration / maxDuration) * 100;
          const fastestMode = modes.reduce((prev, curr) => 
            curr.duration < prev.duration ? curr : prev
          );
          const isFastest = mode.duration === fastestMode.duration;
          
          return (
            <div key={mode.mode} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined ${mode.color}`}>
                    {mode.icon}
                  </span>
                  <span className="text-slate-300 font-semibold">{mode.label}</span>
                  {isFastest && (
                    <span className="text-xs bg-neon-mint/20 text-neon-mint px-2 py-0.5 rounded-full font-bold">
                      FASTEST
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-white font-bold">
                      {formatTime(getDisplayDuration(mode))}
                    </span>
                    <span className="text-xs text-slate-500">
                      Arrives: {getArrivalTime(mode)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{mode.distance.toFixed(2)} km</span>
                    <span>•</span>
                    <span>{mode.averageSpeed > 0 ? `${mode.averageSpeed.toFixed(1)} km/h` : 'N/A'}</span>
                  </div>
                </div>
              </div>
              <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    mode.mode === 'walking' ? 'bg-blue-500' :
                    mode.mode === 'cycling' ? 'bg-green-500' :
                    'bg-purple-500'
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Time Savings Comparison */}
      {modes.length > 1 && (() => {
        const slowestMode = modes.reduce((prev, curr) => 
          curr.duration > prev.duration ? curr : prev
        );
        const fasterModes = modes.filter(m => m.duration < slowestMode.duration);
        
        if (fasterModes.length === 0) return null;
        
        return (
          <div className="border-t border-slate-700 pt-4 space-y-2">
            <h4 className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-2">
              Time Savings Comparison
            </h4>
            {fasterModes.map((mode) => {
              const savings = getTimeSavings(mode, slowestMode);
              if (!savings) return null;
              
              return (
                <div
                  key={`savings-${mode.mode}`}
                  className="flex items-center justify-between bg-slate-700/50 rounded-lg p-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined ${mode.color} text-lg`}>
                      {mode.icon}
                    </span>
                    <span className="text-slate-300">
                      vs {slowestMode.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-neon-mint font-bold">
                      -{savings.savedMinutes} min
                    </span>
                    <span className="text-slate-500 text-xs">
                      ({savings.percentage}% faster)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-700">
        {modes.map((mode) => {
          const displayDuration = getDisplayDuration(mode);
          const displayMinutes = Math.round(displayDuration / 60);
          return (
            <div key={`stats-${mode.mode}`} className="text-center">
              <div className={`text-2xl font-black ${mode.color}`}>
                {displayMinutes}
              </div>
              <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">
                {mode.label}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {getArrivalTime(mode)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
