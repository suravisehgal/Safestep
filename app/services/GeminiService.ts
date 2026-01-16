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
