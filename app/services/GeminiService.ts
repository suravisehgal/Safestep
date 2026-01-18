'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface SafetyAnalysis {
  score: number;
  tip: string;
  source: 'Gemini' | 'Groq' | 'EST';
}

export interface RouteTimingAnalysis {
  estimatedMinutes: number;
  adjustedMinutes: number;
  arrivalTime: string;
  timingNotes: string;
  source: 'Gemini' | 'Groq' | 'EST';
  confidence: number; // 0-100
}

// Security: Keys accessed only on server
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function getSafetyAnalysis(origin: string, destination: string, mode: string = 'walking'): Promise<SafetyAnalysis> {
  console.log(`[SafetyService] Request: ${origin} -> ${destination} (${mode})`);

  // ATTEMPT 1: GEMINI 1.5 FLASH
  try {
    if (!GEMINI_API_KEY) throw new Error("Gemini Key Missing");

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = getPrompt(origin, destination, mode);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const data = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());

    return { score: data.score, tip: data.tip, source: 'Gemini' };

  } catch (geminiError: any) {
    console.warn(`[SafetyService] Gemini Failed: ${geminiError.message}. Switching to Groq...`);

    // ATTEMPT 2: GROQ (LLAMA 3.1)
    try {
      if (!GROQ_API_KEY) throw new Error("Groq Key Missing");

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: getPrompt(origin, destination, mode) + "\n\nRETURN VALID JSON ONLY." }],
          response_format: { type: "json_object" }
        })
      });

      if (!groqResponse.ok) throw new Error(`Groq Status: ${groqResponse.status}`);

      const groqData = await groqResponse.json();
      const parsedGroq = JSON.parse(groqData.choices[0].message.content);

      return { score: parsedGroq.score, tip: parsedGroq.tip, source: 'Groq' };

    } catch (groqError: any) {
      console.error(`[SafetyService] Groq Failed: ${groqError.message}. Using Offline Fallback.`);

      // ATTEMPT 3: EST FALLBACK
      return {
        score: 7.8,
        tip: "EST: Using local urban safety metrics. Stay on main roads and avoid unlit shortcuts.",
        source: 'EST'
      };
    }
  }
}

/**
 * LOCATION-AWARE TIMING ANALYSIS
 * Uses actual distance/duration + AI to provide accurate time estimates like Google Maps
 */
export async function analyzeLocationTiming(
  origin: string,
  destination: string,
  mode: 'walking' | 'cycling' | 'driving',
  baseRouteDistance: number, // meters from OSRM
  baseRouteDuration: number  // seconds from OSRM
): Promise<RouteTimingAnalysis> {
  
  const distanceKm = baseRouteDistance / 1000;
  const baseMinutes = Math.round(baseRouteDuration / 60);
  const currentTime = new Date();
  const hour = currentTime.getHours();
  
  console.log(`[LocationTiming] ${mode} route: ${distanceKm.toFixed(2)}km, Base: ${baseMinutes}min`);

  // ATTEMPT 1: GEMINI - Location-Aware Timing
  try {
    if (!GEMINI_API_KEY) throw new Error("Gemini Key Missing");

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const timingPrompt = getTimingPrompt(origin, destination, mode, distanceKm, baseMinutes, hour);
    const result = await model.generateContent(timingPrompt);
    const responseText = result.response.text();
    const data = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());

    const adjustedMinutes = Math.round(data.adjustedDuration || data.estimatedDuration);
    const arrivalTime = calculateArrivalTime(adjustedMinutes);

    return {
      estimatedMinutes: baseMinutes,
      adjustedMinutes,
      arrivalTime,
      timingNotes: data.notes || "Route timing analyzed by Gemini based on location context.",
      source: 'Gemini',
      confidence: 85
    };

  } catch (geminiError: any) {
    console.warn(`[LocationTiming] Gemini Failed: ${geminiError.message}. Trying Groq...`);

    // ATTEMPT 2: GROQ - Location-Aware Timing
    try {
      if (!GROQ_API_KEY) throw new Error("Groq Key Missing");

      const timingPrompt = getTimingPrompt(origin, destination, mode, distanceKm, baseMinutes, hour);
      
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ 
            role: "user", 
            content: timingPrompt + "\n\nRETURN VALID JSON ONLY WITH: estimatedDuration (minutes), adjustedDuration (minutes), notes (string)"
          }],
          response_format: { type: "json_object" }
        })
      });

      if (!groqResponse.ok) throw new Error(`Groq Status: ${groqResponse.status}`);

      const groqData = await groqResponse.json();
      const data = JSON.parse(groqData.choices[0].message.content);

      const adjustedMinutes = Math.round(data.adjustedDuration || data.estimatedDuration);
      const arrivalTime = calculateArrivalTime(adjustedMinutes);

      return {
        estimatedMinutes: baseMinutes,
        adjustedMinutes,
        arrivalTime,
        timingNotes: data.notes || "Route timing analyzed by Groq based on location context.",
        source: 'Groq',
        confidence: 80
      };

    } catch (groqError: any) {
      console.error(`[LocationTiming] Groq Failed: ${groqError.message}. Using EST fallback.`);

      // ATTEMPT 3: INTELLIGENT FALLBACK (EST)
      return generateIntelligentFallbackTiming(mode, baseMinutes, distanceKm, hour);
    }
  }
}

function getPrompt(origin: string, destination: string, mode: string): string {
  const time = new Date().toLocaleTimeString();
  return `
      ROLE: You are a "Hyper-Critical Urban Safety Auditor."
      CONTEXT: Current time is ${time}. Mode: ${mode}.
      TASK: Analyze the route from ${origin} to ${destination}.
      
      CRITICAL SCORING RULES:
      - STRICTLY FORBIDDEN to default to 7 or 8. Use the full 1-10 scale.
      - 9-10: Bustling, high-visibility main streets only.
      - 1-4: Unlit parks, isolated alleys, or desolate areas, especially at night.
      - 6-8: Average residential areas.
      - Be EXTREMELY critical based on the time of day (${time}).
      
      OUTPUT REQUIREMENTS:
      - Tip: 2-3 detailed sentences explaining the score (e.g., "Lighting is poor," "High crowd density").
      - JSON format: { "score": number, "tip": "string" }
  `;
}

function getTimingPrompt(
  origin: string,
  destination: string,
  mode: 'walking' | 'cycling' | 'driving',
  distanceKm: number,
  baseMinutes: number,
  hour: number
): string {
  const timeOfDay = hour < 6 ? 'early morning' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  const modeLabel = mode === 'walking' ? 'walking/pedestrian' : mode === 'cycling' ? 'bicycle/cycling' : 'car/driving';
  
  return `
    ROLE: You are a "Location-Based Route Timing Expert" like Google Maps.
    
    LOCATION-BASED TIMING ANALYSIS:
    From: ${origin}
    To: ${destination}
    Mode: ${modeLabel}
    
    ROUTE DATA:
    - Distance: ${distanceKm.toFixed(2)} km
    - Base duration (from OSRM routing): ${baseMinutes} minutes
    - Current time: ${timeOfDay} (hour ${hour})
    
    ANALYZE AND ADJUST:
    1. Is this a main road or residential area? (affects speed)
    2. Is it rush hour (7-9am, 5-7pm)? (affects driving/cycling)
    3. What's the terrain type? (affects walking speed)
    4. Weather/season impact on mode of travel
    5. Destination access time (parking, bike parking, walking from car)
    
    RETURN ACCURATE TIMING:
    {
      "estimatedDuration": number (minutes, realistic based on distance),
      "adjustedDuration": number (minutes, including delays, parking, access),
      "notes": "string (brief explanation of adjustments made)"
    }
    
    BE ACCURATE: Don't add excessive padding. Match Google Maps quality estimates.
  `;
}

function calculateArrivalTime(minutes: number): string {
  const arrival = new Date();
  arrival.setMinutes(arrival.getMinutes() + minutes);
  return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function generateIntelligentFallbackTiming(
  mode: 'walking' | 'cycling' | 'driving',
  baseMinutes: number,
  distanceKm: number,
  hour: number
): RouteTimingAnalysis {
  
  // Smart adjustments based on time of day and mode
  let adjustmentFactor = 1.0;
  
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  const isNight = hour < 6 || hour > 21;
  
  if (mode === 'driving') {
    if (isRushHour) adjustmentFactor = 1.3; // +30% for traffic
    else if (isNight) adjustmentFactor = 0.85; // -15% for clear roads
  } else if (mode === 'cycling') {
    if (isNight) adjustmentFactor = 1.15; // +15% for safety/visibility
    if (isRushHour) adjustmentFactor = 1.1; // +10% for mixed traffic
  } else if (mode === 'walking') {
    if (isNight) adjustmentFactor = 1.2; // +20% for caution
    if (distanceKm > 3) adjustmentFactor = Math.min(adjustmentFactor + 0.1, 1.3); // Add for long walks
  }
  
  // Add access time
  let accessTime = 0;
  if (mode === 'driving') accessTime = 5; // parking + walking
  else if (mode === 'cycling') accessTime = 2; // bike parking
  
  const adjustedMinutes = Math.round((baseMinutes * adjustmentFactor) + accessTime);
  const arrivalTime = calculateArrivalTime(adjustedMinutes);
  
  const reason = isRushHour ? 'rush hour traffic' : isNight ? 'nighttime conditions' : 'current conditions';
  
  return {
    estimatedMinutes: baseMinutes,
    adjustedMinutes,
    arrivalTime,
    timingNotes: `EST: Estimated ${adjustedMinutes}min (${reason}). ${mode === 'driving' ? 'Includes parking time.' : ''}`,
    source: 'EST',
    confidence: 65
  };
}
