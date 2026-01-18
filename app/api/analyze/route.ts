import { NextRequest, NextResponse } from 'next/server';
import { analyzeLocationTiming } from '@/app/services/GeminiService';

export async function POST(req: NextRequest) {
    try {
        const { origin, destination, mode, distance, duration } = await req.json();

        if (!origin || !destination || !mode) {
            return NextResponse.json({ error: "Missing origin, destination, or mode" }, { status: 400 });
        }

        if (!distance || !duration) {
            return NextResponse.json({ error: "Missing actual route data (distance/duration from OSRM)" }, { status: 400 });
        }

        console.log(`[API Route Analysis] ${mode} route: ${(distance/1000).toFixed(2)}km, base ${Math.round(duration/60)}min`);

        // Use the enhanced location-aware timing with Gemini/Groq
        const timingAnalysis = await analyzeLocationTiming(
            origin,
            destination,
            mode,
            distance,  // meters
            duration   // seconds
        );

        return NextResponse.json({
            origin,
            destination,
            mode,
            baseDistance: (distance / 1000).toFixed(2),
            baseMinutes: Math.round(duration / 60),
            estimatedMinutes: timingAnalysis.estimatedMinutes,
            adjustedMinutes: timingAnalysis.adjustedMinutes,
            arrivalTime: timingAnalysis.arrivalTime,
            timingNotes: timingAnalysis.timingNotes,
            source: timingAnalysis.source,
            confidence: timingAnalysis.confidence
        });

    } catch (error: any) {
        console.error("Route Analysis API Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
