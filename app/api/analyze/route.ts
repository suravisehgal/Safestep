import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
    try {
        const { origin, destination, mode } = await req.json();

        if (!origin || !destination) {
            return NextResponse.json({ error: "Missing origin or destination" }, { status: 400 });
        }

        // Securely access the API Key on the server
        const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("Server API Error: GOOGLE_API_KEY is missing in environment variables.");
            return NextResponse.json({ error: "Server Configuration Error: API Key missing" }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        const prompt = `
      You are a realistic safety auditor providing real-time navigation advice. 
      Analyze the route from ${origin} to ${destination} for a user who is ${mode}.
      
      CRITICAL SCORING RULES:
      - If the route is a main, well-lit road/street, score HIGH (9-10).
      - If the route is through an alley, unlit park, or desolate area at night, score LOW (2-5).
      - If the area is average residential, score MODERATE (6-8).
      - NEVER default to 8. Be harsh if needed.
      
      OUTPUT REQUIREMENTS:
      - Tip must be detailed (2-3 sentences). 
      - Mention specific "real-time" factors like lighting coverage, potential crowd density, and visibility.
      - If the score is low, suggest an alternative action (e.g., "Keep to the main avenue").
      
      Output ONLY valid JSON in this format: { "score": number, "tip": "string" }
    `;

        let responseText = "";

        try {
            // Attempt 1: Gemini 1.5 Flash with Native JSON Mode
            console.log("Attempting Gemini 1.5 Flash...");
            const modelFlash = genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });
            const result = await modelFlash.generateContent(prompt);
            responseText = result.response.text();

        } catch (flashError: any) {
            console.warn("Gemini 1.5 Flash failed:", flashError.message);

            try {
                // Attempt 2: Gemini Pro (Standard)
                // Fallback for accounts/regions where 1.5 Flash is unavailable.
                // We REMOVE responseMimeType because basic gemini-pro (v1beta) often doesn't support it well.
                console.log("Falling back to Gemini Pro (text mode)...");
                const modelPro = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await modelPro.generateContent(prompt);
                responseText = result.response.text();
            } catch (proError: any) {
                console.error("Gemini Pro also failed:", proError.message);
                // If both fail, throwing error to be caught by outer catch
                throw new Error(`AI Service Unavailable: ${flashError.message} | ${proError.message}`);
            }
        }

        if (!responseText) {
            throw new Error("Empty response from Gemini");
        }

        // Clean up response if it contains markdown code blocks (common in text mode)
        const cleanerJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsedData = JSON.parse(cleanerJson);

        // Validate structure
        if (typeof parsedData.score !== 'number' || typeof parsedData.tip !== 'string') {
            throw new Error("Invalid JSON structure received from model");
        }

        return NextResponse.json({
            score: parsedData.score,
            tip: parsedData.tip,
            isMock: false
        });

    } catch (error: any) {
        console.error("Gemini API Route Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
