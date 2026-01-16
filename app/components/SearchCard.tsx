import { useState, useRef, useEffect } from "react";

interface SearchCardProps {
    onSearch: (origin: string, destination: string) => void;
    isLoading: boolean;
    onPlaceSelect: (place: any, type: 'origin' | 'destination') => void;
    userLocation: [number, number] | undefined;
}

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";

export default function SearchCard({ onSearch, isLoading, onPlaceSelect, userLocation }: SearchCardProps) {
    const [origin, setOrigin] = useState("Current Location");
    const [destination, setDestination] = useState("");
    const [activeInput, setActiveInput] = useState<'origin' | 'destination'>('destination');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleInput = (value: string, type: 'origin' | 'destination') => {
        if (type === 'origin') setOrigin(value);
        else setDestination(value);
        setActiveInput(type);

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(async () => {
            if (value.length > 2 && value !== 'Current Location') {
                try {
                    const res = await fetch(`${NOMINATIM_BASE_URL}?format=json&q=${encodeURIComponent(value)}&limit=5`);
                    const data = await res.json();
                    setSuggestions(data);
                    setShowSuggestions(true);
                } catch (e) { console.error(e); }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 300);
    };

    const handleSelect = (place: any) => {
        if (activeInput === 'origin') setOrigin(place.display_name);
        else setDestination(place.display_name);

        onPlaceSelect(place, activeInput);
        setShowSuggestions(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch(origin, destination);
    };

    return (
        <div className="absolute top-4 left-4 z-[1000] w-full max-w-sm">
            <form onSubmit={handleSubmit} className="bg-slate-900/90 backdrop-blur-md rounded-[28px] p-4 border border-slate-700 shadow-xl space-y-3">
                {/* Origin */}
                <div className="relative flex items-center bg-slate-800 rounded-xl px-3 py-2 border border-slate-700 focus-within:ring-2 focus-within:ring-neon-mint transition-all">
                    <span className="material-symbols-outlined text-slate-400 text-lg mr-2">my_location</span>
                    <input
                        type="text"
                        value={origin}
                        onChange={(e) => handleInput(e.target.value, 'origin')}
                        onFocus={() => { setActiveInput('origin'); if (suggestions.length) setShowSuggestions(true); }}
                        className="bg-transparent border-none focus:outline-none text-white text-sm w-full placeholder-slate-500"
                        placeholder="Start Location"
                    />
                    <button
                        type="button"
                        onClick={() => { setOrigin("Current Location"); if (userLocation) onPlaceSelect(null, 'origin'); }} // Use null to signal reset to user loc
                        className="p-1 hover:bg-slate-700 rounded-full text-neon-mint transition"
                        title="Use Current Location"
                    >
                        <span className="material-symbols-outlined text-lg">crosshairs_gps</span>
                    </button>
                </div>

                {/* Destination */}
                <div className="relative flex items-center bg-slate-800 rounded-xl px-3 py-2 border border-slate-700 focus-within:ring-2 focus-within:ring-neon-mint transition-all">
                    <span className="material-symbols-outlined text-red-400 text-lg mr-2">location_on</span>
                    <input
                        type="text"
                        value={destination}
                        onChange={(e) => handleInput(e.target.value, 'destination')}
                        onFocus={() => { setActiveInput('destination'); if (suggestions.length) setShowSuggestions(true); }}
                        className="bg-transparent border-none focus:outline-none text-white text-sm w-full font-semibold placeholder-slate-500"
                        placeholder="Where to?"
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-neon-mint text-slate-900 font-bold py-3 rounded-xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
                >
                    {isLoading ? <span className="material-symbols-outlined animate-spin">refresh</span> : "Find Safe Route"}
                </button>
            </form>

            {/* Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
                <div className="mt-2 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
                    {suggestions.map((s: any) => (
                        <div
                            key={s.place_id}
                            onClick={() => handleSelect(s)}
                            className="px-4 py-3 hover:bg-slate-800 cursor-pointer border-b border-slate-800 last:border-0 flex items-start text-xs text-slate-300"
                        >
                            <span className="material-symbols-outlined text-slate-500 text-sm mr-2 mt-0.5">place</span>
                            <span className="truncate">{s.display_name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
