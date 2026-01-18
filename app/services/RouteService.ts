export interface RouteData {
    coordinates: [number, number][];
    duration: number; // in seconds
    distance: number; // in meters
}

// Helper to calculate distance (Haversine) for fallback
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180)
}

export async function getRoute(start: [number, number], end: [number, number], profile: 'walking' | 'driving' | 'cycling' = 'walking'): Promise<RouteData | null> {
    try {
        // OSRM expects {lon},{lat}
        const startStr = `${start[1]},${start[0]}`;
        const endStr = `${end[1]},${end[0]}`;

        // Specific URL endpoints for Multi-Modal Routing
        let baseUrl = "https://router.project-osrm.org/route/v1";
        let osrmProfile = "foot"; // Default

        if (profile === 'walking') {
            baseUrl = "https://router.project-osrm.org/route/v1";
            osrmProfile = "foot";
        } else if (profile === 'cycling') {
            // Use standard OSRM with bike profile for better accuracy
            baseUrl = "https://router.project-osrm.org/route/v1";
            osrmProfile = "bike";
        } else if (profile === 'driving') {
            // specialized car server
            baseUrl = "https://routing.openstreetmap.de/routed-car/route/v1";
            osrmProfile = "driving";
        }

        const url = `${baseUrl}/${osrmProfile}/${startStr};${endStr}?overview=full&geometries=geojson`;

        // Console log for debugging distinctive calls
        console.log(`Fetching Route (${profile}):`, url);

        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const coordinates = route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
            
            let duration = route.duration; // in seconds
            let distance = route.distance; // in meters
            
            // Validate and correct unrealistic durations based on distance and mode
            const distanceKm = distance / 1000;
            const expectedSpeeds = {
                walking: 5,    // 5 km/h average walking speed
                cycling: 15,    // 15 km/h average cycling speed
                driving: 50     // 50 km/h average driving speed (urban)
            };
            
            const expectedSpeed = expectedSpeeds[profile] || 5;
            const expectedDuration = (distanceKm / expectedSpeed) * 3600; // seconds
            
            // If API returns duration that's way off (more than 2x expected), use calculated duration
            // But allow some variance (API might account for traffic, elevation, etc.)
            if (duration > expectedDuration * 2 || duration < expectedDuration * 0.3) {
                console.warn(`OSRM ${profile} duration seems unrealistic (${duration}s vs expected ${expectedDuration.toFixed(0)}s). Using calculated duration.`);
                duration = expectedDuration;
            }
            
            return {
                coordinates,
                duration: Math.round(duration),
                distance: Math.round(distance)
            };
        }
        throw new Error("No route found");
    } catch (error) {
        console.warn(`OSRM Routing Error (${profile}). Using fallback calculation.`, error);

        // Fallback: Calculate straight-line distance and estimate time
        // Note: Straight-line distance is shorter than actual route, so we add 20% buffer
        const distKm = getDistanceFromLatLonInKm(start[0], start[1], end[0], end[1]);
        const routeBuffer = 1.2; // 20% longer for actual route vs straight line
        const adjustedDistKm = distKm * routeBuffer;
        
        const speeds = { 
            walking: 5,    // 5 km/h average walking speed
            cycling: 15,   // 15 km/h average cycling speed  
            driving: 50    // 50 km/h average driving speed (urban)
        };
        const speed = speeds[profile] || 5;
        const durationSeconds = (adjustedDistKm / speed) * 3600;

        return {
            coordinates: [start, end], // Straight line
            duration: Math.round(durationSeconds),
            distance: Math.round(adjustedDistKm * 1000)
        };
    }
}
