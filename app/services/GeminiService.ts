import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

// Initialize with the API key directly
const genAI = new GoogleGenerativeAI(apiKey || "");

const cache = new Map<string, SafetyAnalysis>();

export interface SafetyAnalysis {
  score: number;
  tip: string;
  isMock: boolean;
}

export async function getSafetyAnalysis(origin: string, destination: string, mode: string = 'walking'): Promise<SafetyAnalysis> {
  console.log("Using API Key:", !!process.env.NEXT_PUBLIC_GEMINI_API_KEY);

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("Gemini API Key is missing or invalid. Using simulation fallback.");
    return mockResponse(origin, destination, mode);
  }

  try {
    const key = `${origin}-${destination}-${mode}`;
    if (cache.has(key)) {
      return cache.get(key)!;
    }

    // Explicitly target the stable v1 endpoint with gemini-2.5-flash
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { response_mime_type: "application/json" }
    });

    const prompt = `Analyze the route from ${origin} to ${destination}. The user is ${mode === 'driving' ? 'driving' : mode === 'cycling' ? 'cycling' : 'walking'}. Provide a safety score (1-10) and a tip. IMPORTANT: If the destination is a major city center, score it higher. If it's an unmapped or rural area, score it lower. Never return 8 by default. Your response MUST be unique to these coordinates. Provide a JSON response: { "score": number, "tip": "string" }`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log("Gemini Response:", responseText);

    if (!responseText) throw new Error("Empty response from Gemini");

    // Only set isMock: false after synchronous success
    const parsedData = JSON.parse(responseText);
    const analysis: SafetyAnalysis = { 
      score: parsedData.score, 
      tip: parsedData.tip, 
      isMock: false 
    };
    
    cache.set(key, analysis);
    return analysis;

  } catch (error) {
    console.error("Gemini API Error (Falling back to offline mode):", error);
    return mockResponse(origin, destination, mode);
  }
}

function mockResponse(origin: string, destination: string, mode: string): SafetyAnalysis {
  return {
    score: 8,
    tip: `Analysis based on local historical data: This ${mode} route is well-lit and active.`,
    isMock: true
  };
}

export async function analyzeRouteTime(
  origin: string,
  destination: string,
  mode: 'walking' | 'cycling' | 'driving',
  baseDuration: number, // in seconds from routing API
  distance: number // in meters
): Promise<RouteTimeAnalysis> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    // Fallback: calculate based on realistic speeds
    const distanceKm = distance / 1000;
    const speeds = { walking: 5, cycling: 15, driving: 50 };
    const speed = speeds[mode] || 5;
    const estimatedDuration = (distanceKm / speed) * 3600;
    
    const now = new Date();
    now.setSeconds(now.getSeconds() + estimatedDuration);
    const arrivalTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return {
      estimatedDuration: Math.round(estimatedDuration),
      arrivalTime,
      adjustedDuration: Math.round(estimatedDuration),
      accessNotes: `Estimated time based on ${speed} km/h average speed for ${mode}.`,
      isMock: true
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { response_mime_type: "application/json" }
    });

    const distanceKm = (distance / 1000).toFixed(2);
    const baseMinutes = Math.round(baseDuration / 60);
    
    const prompt = `Analyze the route timing from "${origin}" to "${destination}". 
    
Mode of transport: ${mode}
Base route duration: ${baseMinutes} minutes
Distance: ${distanceKm} km

Consider:
1. Vehicle type (${mode === 'driving' ? 'car' : mode === 'cycling' ? 'bicycle' : 'walking'})
2. Destination access (parking availability, bike parking, pedestrian access, traffic conditions)
3. Typical speeds for this mode in this area
4. Any delays due to destination access (finding parking, walking from parking, etc.)

Provide a JSON response with:
{
  "estimatedDuration": number (in seconds, realistic estimate),
  "adjustedDuration": number (in seconds, accounting for destination access delays),
  "accessNotes": "string (brief note about destination access)",
  "arrivalTimeOffset": number (additional seconds needed for destination access, 0 if none)
}

Be realistic. If destination is a mall/restaurant, add parking/walking time for cars. If it's a residential area, consider access.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    if (!responseText) throw new Error("Empty response from Gemini");

    const parsedData = JSON.parse(responseText);
    
    // Calculate adjusted duration - for walking, no access time needed
    let adjustedDuration = parsedData.adjustedDuration || parsedData.estimatedDuration || baseDuration;
    
    // For walking mode, don't add access time - use base duration
    if (mode === 'walking') {
      adjustedDuration = parsedData.estimatedDuration || baseDuration;
    }

    // Calculate arrival time (will be recalculated dynamically when displayed)
    const now = new Date();
    const totalDuration = adjustedDuration;
    now.setSeconds(now.getSeconds() + totalDuration);
    const arrivalTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      estimatedDuration: parsedData.estimatedDuration || baseDuration,
      arrivalTime,
      adjustedDuration: adjustedDuration,
      accessNotes: parsedData.accessNotes || "Route analyzed.",
      isMock: false
    };

  } catch (error) {
    console.error("Gemini Route Time Analysis Error:", error);
    
    // Fallback calculation
    const distanceKm = distance / 1000;
    const speeds = { walking: 5, cycling: 15, driving: 50 };
    const speed = speeds[mode] || 5;
    
    // Add access time based on mode (none for walking)
    let accessTime = 0;
    if (mode === 'driving') accessTime = 300; // 5 min for parking/walking
    else if (mode === 'cycling') accessTime = 60; // 1 min for bike parking
    // Walking: no access time needed
    
    const estimatedDuration = (distanceKm / speed) * 3600;
    const adjustedDuration = estimatedDuration + accessTime;
    
    // For walking, adjusted should equal estimated (no access time)
    const finalAdjustedDuration = mode === 'walking' ? estimatedDuration : adjustedDuration;
    
    const now = new Date();
    now.setSeconds(now.getSeconds() + finalAdjustedDuration);
    const arrivalTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return {
      estimatedDuration: Math.round(estimatedDuration),
      arrivalTime,
      adjustedDuration: Math.round(finalAdjustedDuration),
      accessNotes: mode === 'driving' ? 'Includes estimated parking/walking time.' : mode === 'cycling' ? 'Includes bike parking time.' : 'Estimated time.',
      isMock: true
    };
  }
}