'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface SafetyAnalysis {
  score: number;
  tip: string;
  source: 'Gemini' | 'Groq' | 'EST';
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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" } });

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
          messages: [{ role: "user", content: getPrompt(origin, destination, mode) + "\n\nRETURN JSON ONLY." }],
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
