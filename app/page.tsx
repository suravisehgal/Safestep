"use client";

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { getSafetyAnalysis, SafetyAnalysis, analyzeRouteTime, RouteTimeAnalysis } from './services/GeminiService';
import { getRoute, RouteData } from './services/RouteService';
import { useAuth } from './components/AuthProvider';
import AuthModal from './components/AuthModal';
import GuardianManager from './components/GuardianManager';
import SafetyTimer from './components/SafetyTimer';
import TransportTimeAnalysis from './components/TransportTimeAnalysis';

// Dynamically import Map to avoid SSR issues
const Map = dynamic(() => import('./components/MapComponent'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-900 flex items-center justify-center text-slate-500">Loading Map...</div>
});

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export default function Home() {
  const { user } = useAuth();

  // App State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGuardians, setShowGuardians] = useState(false);
  const [safetyTimerActive, setSafetyTimerActive] = useState(false);

  // Map & Routing State
  const [origin, setOrigin] = useState('Current Location');
  const [destination, setDestination] = useState('');
  const [analysis, setAnalysis] = useState<SafetyAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [isHoldingSOS, setIsHoldingSOS] = useState(false);
  const [center, setCenter] = useState<[number, number]>([51.505, -0.09]); // Default: London
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>(undefined);
  const [destinationLocation, setDestinationLocation] = useState<[number, number] | undefined>(undefined);
  const [routePath, setRoutePath] = useState<[number, number][] | null>(null);

  // Multi-Modal State
  const [travelMode, setTravelMode] = useState<'walking' | 'cycling' | 'driving'>('walking');
  const [routeOptions, setRouteOptions] = useState<Record<string, RouteData | null>>({
    walking: null,
    cycling: null,
    driving: null
  });
  const [routeTimeAnalysis, setRouteTimeAnalysis] = useState<Record<string, RouteTimeAnalysis | null>>({
    walking: null,
    cycling: null,
    driving: null
  });

  // Autocomplete State
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeInput, setActiveInput] = useState<'origin' | 'destination'>('destination');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sosTimerRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Initial Location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPos: [number, number] = [position.coords.latitude, position.coords.longitude];
          setCenter(newPos);
          setUserLocation(newPos);
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  }, []);

  // Watch Position for Dynamic ETA
  useEffect(() => {
    if (analysis && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const newPos: [number, number] = [position.coords.latitude, position.coords.longitude];
          setUserLocation(newPos);
          // Only update path if we're actively routing? 
          // For MVP, we won't re-fetch the route on every small move to save API, 
          // but in production, we'd snap to route.
        },
        (error) => console.error("Watch Position Error:", error),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [analysis]);

  const geocode = async (query: string): Promise<[number, number] | null> => {
    try {
      const res = await fetch(`${NOMINATIM_BASE_URL}?format=json&q=${encodeURIComponent(query)}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (e) { console.error(e); }
    return null;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) return;

    setIsLoading(true);
    setAnalysis(null);

    // Simulate "Thinking" time
    const minTime = new Promise(resolve => setTimeout(resolve, 1500));

    let startCoords = userLocation;

    // Handle Manual Origin
    if (origin !== 'Current Location') {
      const coords = await geocode(origin);
      if (coords) {
        startCoords = coords;
        setUserLocation(coords); // Update "User Location" to manual start for routing
        setCenter(coords);
      }
    }

    if (!startCoords) {
      setIsLoading(false);
      alert("Could not determine start location");
      return;
    }

    try {
      // Logic for separate destination coordinate fetch if needed, 
      // but usually destinationLocation is set by autocomplete click.
      let endCoords = destinationLocation;
      if (!endCoords) {
        const coords = await geocode(destination);
        if (coords) {
          endCoords = coords;
          setDestinationLocation(endCoords);
        }
      }

      if (startCoords && endCoords) {
        // Fetch All Routes Parallel
        const [walkRoute, bikeRoute, driveRoute] = await Promise.all([
          getRoute(startCoords, endCoords, 'walking'),
          getRoute(startCoords, endCoords, 'cycling'),
          getRoute(startCoords, endCoords, 'driving')
        ]);

        setRouteOptions({
          walking: walkRoute,
          cycling: bikeRoute,
          driving: driveRoute
        });

        // Analyze route times with Gemini (considering destination access)
        const [walkTimeAnalysis, bikeTimeAnalysis, driveTimeAnalysis] = await Promise.all([
          walkRoute ? analyzeRouteTime(origin, destination, 'walking', walkRoute.duration, walkRoute.distance) : Promise.resolve(null),
          bikeRoute ? analyzeRouteTime(origin, destination, 'cycling', bikeRoute.duration, bikeRoute.distance) : Promise.resolve(null),
          driveRoute ? analyzeRouteTime(origin, destination, 'driving', driveRoute.duration, driveRoute.distance) : Promise.resolve(null)
        ]);

        setRouteTimeAnalysis({
          walking: walkTimeAnalysis,
          cycling: bikeTimeAnalysis,
          driving: driveTimeAnalysis
        });

        // Set initial path
        const currentRoute = travelMode === 'walking' ? walkRoute : travelMode === 'cycling' ? bikeRoute : driveRoute;
        if (currentRoute) setRoutePath(currentRoute.coordinates);
      }

      const [result] = await Promise.all([
        getSafetyAnalysis(origin, destination, travelMode),
        minTime
      ]);
      setAnalysis(result);
      if (user) setSafetyTimerActive(true); // Auto-start timer if logged in

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = async (mode: 'walking' | 'cycling' | 'driving') => {
    setTravelMode(mode);
    setAnalysis(prev => prev ? { ...prev, tip: "Updating for " + mode + "..." } : null); // Optimistic UI

    if (routeOptions[mode]) {
      setRoutePath(routeOptions[mode]!.coordinates);
    }

    // Trigger new API call for safety analysis
    if (destination) {
      try {
        const result = await getSafetyAnalysis(origin, destination, mode);
        setAnalysis(result);
      } catch (e) { console.error(e); }
    }
  };

  // Autocomplete Logic
  const handleInput = (value: string, type: 'origin' | 'destination') => {
    if (type === 'origin') setOrigin(value);
    else setDestination(value);

    setActiveInput(type);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      if (value.length > 2 && value !== 'Current Location') {
        try {
          const lat = center[0];
          const lon = center[1];
          const viewbox = `${lon - 0.5},${lat + 0.5},${lon + 0.5},${lat - 0.5}`;
          const res = await fetch(`${NOMINATIM_BASE_URL}?format=json&q=${encodeURIComponent(value)}&limit=5&viewbox=${viewbox}&bounded=1`);
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(true);
        } catch (err) { console.error(err); }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);
  };

  const handleSuggestionClick = (place: NominatimResult) => {
    if (activeInput === 'origin') {
      setOrigin(place.display_name);
      // We'd ideally wait to set userLocation until Search is clicked or set it here?
      // For now, let Search handle the geocode confirmation or do it lazily.
    } else {
      setDestination(place.display_name);
      setDestinationLocation([parseFloat(place.lat), parseFloat(place.lon)]);
      setCenter([parseFloat(place.lat), parseFloat(place.lon)]);
    }
    setShowSuggestions(false);
  };

  // SOS Button Logic
  const startSOS = () => {
    setIsHoldingSOS(true);
    sosTimerRef.current = setTimeout(() => {
      triggerSOS();
    }, 2000);
  };

  const cancelSOS = () => {
    setIsHoldingSOS(false);
    if (sosTimerRef.current) {
      clearTimeout(sosTimerRef.current);
      sosTimerRef.current = null;
    }
  };

  const triggerSOS = () => {
    setSosActive(true);
    setIsHoldingSOS(false);
    if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
    setTimeout(() => setSosActive(false), 5000);
  };

  const formatArrival = (seconds: number) => {
    const now = new Date();
    now.setSeconds(now.getSeconds() + seconds);
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <main className="relative h-screen w-full bg-slate-900 overflow-hidden flex flex-col font-sans">

      {/* Auth Modal */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {/* Safety Timer Overlay */}
      <SafetyTimer
        isActive={safetyTimerActive}
        onStop={() => setSafetyTimerActive(false)}
        onTriggerSOS={triggerSOS}
      />

      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
        <Map center={center} userLocation={userLocation} destinationLocation={destinationLocation} routePath={routePath} />
      </div>

      {/* Top Bar: Auth & User Status */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        {user ? (
          <>
            <button
              onClick={() => setShowGuardians(!showGuardians)}
              className="bg-slate-800/90 text-white p-2 rounded-full shadow-lg border border-slate-700 hover:bg-slate-700 transition"
              title="Manage Guardians"
            >
              <span className="material-symbols-outlined">verified_user</span>
            </button>
            <div className="bg-slate-800/90 text-neon-mint px-3 py-2 rounded-full shadow-lg border border-slate-700 flex items-center gap-2 text-xs font-bold">
              <span className="material-symbols-outlined text-sm">smart_toy</span>
              AI SECURED
            </div>
          </>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="bg-neon-mint text-slate-900 px-4 py-2 rounded-full font-bold shadow-lg hover:bg-emerald-400 transition flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">login</span>
            Login
          </button>
        )}
      </div>

      {/* Guardians Panel */}
      {showGuardians && (
        <div className="absolute top-16 right-4 z-20 w-72 animate-in slide-in-from-top-4">
          <GuardianManager />
        </div>
      )}

      {/* Search Bar */}
      <div className="relative z-10 p-4 pt-12 pointer-events-none">
        <form onSubmit={handleSearch} className="relative max-w-md mx-auto pointer-events-auto space-y-2 bg-slate-900/80 backdrop-blur-md p-4 rounded-3xl border border-slate-700 shadow-2xl">

          {/* Origin Input */}
          <div className="relative flex items-center border-b border-slate-700/50 pb-2">
            <span className="material-symbols-outlined text-slate-400 w-8">my_location</span>
            <input
              type="text"
              className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none"
              placeholder="Current Location"
              value={origin}
              onChange={(e) => handleInput(e.target.value, 'origin')}
              onFocus={() => {
                setActiveInput('origin');
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
          </div>

          {/* Destination Input */}
          <div className="relative flex items-center pt-2">
            <span className="material-symbols-outlined text-neon-mint w-8">location_on</span>
            <input
              type="text"
              className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none font-semibold"
              placeholder="Where to?"
              value={destination}
              onChange={(e) => handleInput(e.target.value, 'destination')}
              onFocus={() => {
                setActiveInput('destination');
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="bg-neon-mint text-slate-900 p-2 rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 ml-2"
            >
              {isLoading ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">arrow_forward</span>}
            </button>
          </div>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
              <ul>
                {suggestions.map((place) => (
                  <li
                    key={place.place_id}
                    className="px-4 py-3 hover:bg-slate-700 cursor-pointer text-slate-300 text-sm border-b border-slate-700/50 flex items-start"
                    onClick={() => handleSuggestionClick(place)}
                  >
                    <span className="material-symbols-outlined text-sm mr-2 mt-0.5 text-slate-400">place</span>
                    <span className="truncate">{place.display_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-neon-mint"></div>
          <p className="mt-4 text-neon-mint font-semibold text-lg tracking-wide animate-pulse">Analyzing Route Safety...</p>
        </div>
      )}

      {/* SOS Alert Notification */}
      {sosActive && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm px-4">
          <div className="bg-red-600 text-white rounded-3xl p-6 shadow-2xl border-2 border-red-400 animate-bounce text-center">
            <span className="material-symbols-outlined text-6xl mb-2">warning</span>
            <h2 className="text-2xl font-bold mb-1">SOS SENT!</h2>
            <p className="text-red-100">Alert sent to guardians.</p>
          </div>
        </div>
      )}

      {/* Bottom Information Card */}
      <div className="mt-auto relative z-10 p-4 pb-8 bg-gradient-to-t from-slate-900 via-slate-900/90 to-transparent pointer-events-none">
        <div className="max-w-md mx-auto space-y-4 pointer-events-auto">
          {analysis && !isLoading && (
            <div className="bg-slate-800/90 backdrop-blur-md rounded-3xl p-5 border border-slate-700 shadow-xl animate-in slide-in-from-bottom duration-500">

              {/* Mode Selector & ETA */}
              <div className="flex justify-between items-center mb-4 bg-slate-900/50 rounded-xl p-1">
                {[
                  { id: 'walking', icon: 'directions_walk', label: 'Walk' },
                  { id: 'cycling', icon: 'directions_bike', label: 'Bike' },
                  { id: 'driving', icon: 'directions_car', label: 'Car' },
                ].map((mode) => {
                  // Get the correct duration - use adjusted duration from Gemini if available, otherwise use route duration
                  const timeAnalysis = routeTimeAnalysis[mode.id];
                  const displayDuration = timeAnalysis 
                    ? timeAnalysis.adjustedDuration 
                    : (routeOptions[mode.id]?.duration || 0);
                  const displayMinutes = Math.round(displayDuration / 60);
                  
                  return (
                    <button
                      key={mode.id}
                      onClick={() => switchMode(mode.id as any)}
                      className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all ${travelMode === mode.id ? 'bg-slate-700 text-neon-mint shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      <span className="material-symbols-outlined mb-1">{mode.icon}</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider">{mode.label}</span>
                      <span className="text-xs font-mono">
                        {displayDuration > 0 ? displayMinutes + ' m' : '-'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Arrival Time & Duration */}
              <div className="text-center mb-4 space-y-2">
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Travel Time</p>
                  <p className="text-xl font-bold text-white">
                    {routeTimeAnalysis[travelMode] 
                      ? formatTime(routeTimeAnalysis[travelMode]!.adjustedDuration)
                      : routeOptions[travelMode] 
                        ? formatTime(routeOptions[travelMode]!.duration)
                        : '--'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Expected Arrival</p>
                  <p className="text-2xl font-bold text-neon-mint">
                    {(() => {
                      // Calculate arrival time dynamically from the current adjusted duration
                      const displayDuration = routeTimeAnalysis[travelMode]?.adjustedDuration || routeOptions[travelMode]?.duration;
                      if (displayDuration) {
                        return formatArrival(displayDuration);
                      }
                      return '--:--';
                    })()}
                  </p>
                </div>
                {routeTimeAnalysis[travelMode]?.accessNotes && (
                  <p className="text-slate-500 text-xs mt-2 italic">
                    {routeTimeAnalysis[travelMode]!.accessNotes}
                  </p>
                )}
              </div>

              <div className="flex items-start justify-between border-t border-slate-700 pt-4">
                <div>
                  <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">AI Safety Score</h3>
                  <div className="flex items-baseline space-x-2">
                    <span className={`text-4xl font-black ${analysis.score >= 8 ? 'text-neon-mint' : analysis.score >= 5 ? 'text-yellow-400' : 'text-red-500'}`}>
                      {analysis.score}
                    </span>
                    <span className="text-slate-400 text-sm">/ 10</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-700/50 rounded-2xl">
                  <span className={`material-symbols-outlined text-4xl ${analysis.score >= 8 ? 'text-neon-mint' : analysis.score >= 5 ? 'text-yellow-400' : 'text-red-500'}`}>
                    {analysis.score >= 8 ? 'verified_user' : 'gpp_maybe'}
                  </span>
                </div>
              </div>

              <div className="mt-3 text-slate-300 text-sm leading-relaxed bg-slate-700/30 p-3 rounded-xl border border-slate-700/50">
                <span className="text-neon-mint mr-2 font-bold flex items-center gap-1 mb-1">
                  <span className="material-symbols-outlined text-sm">psychology</span>
                  AI Analysis:
                </span>
                {analysis.tip}
              </div>
            </div>
          )}

          {/* Transport Time Analysis */}
          {routeOptions.walking || routeOptions.cycling || routeOptions.driving ? (
            <TransportTimeAnalysis routeOptions={routeOptions} routeTimeAnalysis={routeTimeAnalysis} />
          ) : null}

          {/* SOS Button */}
          <div className="flex justify-center pt-2">
            <button
              onMouseDown={startSOS}
              onMouseUp={cancelSOS}
              onMouseLeave={cancelSOS}
              onTouchStart={startSOS}
              onTouchEnd={cancelSOS}
              className={`
                relative group flex items-center justify-center rounded-full shadow-lg transition-all duration-300 select-none
                ${isHoldingSOS ? 'w-24 h-24 bg-red-600 scale-110' : 'w-20 h-20 bg-red-500 hover:bg-red-600'}
              `}
            >
              <div className={`absolute inset-0 rounded-full border-4 border-red-500/50 ${isHoldingSOS ? 'animate-ping' : 'opacity-0'}`}></div>
              <span className={`font-black text-white ${isHoldingSOS ? 'text-xs' : 'text-xl'}`}>
                {isHoldingSOS ? 'HOLD...' : 'SOS'}
              </span>
            </button>
          </div>
          <p className="text-center text-slate-500 text-xs mt-2">Hold 2s for Emergency</p>
        </div>
      </div>
    </main>
  );
}
