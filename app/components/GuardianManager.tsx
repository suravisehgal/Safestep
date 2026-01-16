"use client";
import { useState } from "react";
import { useGuardians } from "../hooks/useGuardians";

export default function GuardianManager({ onClose }: { onClose?: () => void }) {
    const { guardians, addGuardian, removeGuardian, loading } = useGuardians();
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [error, setError] = useState("");

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            await addGuardian(name, phone);
            setName("");
            setPhone("");
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-900 text-white">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-neon-mint">verified_user</span>
                    Guardians
                </h2>
                {onClose && (
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <form onSubmit={handleAdd} className="space-y-3 bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Add Trusted Contact</h3>
                    <input
                        type="text"
                        placeholder="Name (e.g., Mom)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-neon-mint focus:outline-none placeholder-slate-500 text-white"
                    />
                    <input
                        type="tel"
                        placeholder="Phone (with country code)"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-neon-mint focus:outline-none font-mono placeholder-slate-500 text-white"
                    />
                    {error && <p className="text-red-400 text-xs">{error}</p>}
                    <button
                        type="submit"
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-xl transition flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        Save Guardian
                    </button>
                </form>

                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Your Guardians</h3>
                    {loading ? (
                        <p className="text-center text-slate-500 py-4">Loading...</p>
                    ) : guardians.length === 0 ? (
                        <p className="text-center text-slate-500 py-8 bg-slate-800/30 rounded-2xl border border-slate-800 border-dashed">
                            No contacts added yet.
                        </p>
                    ) : (
                        guardians.map(g => (
                            <div key={g.id} className="bg-slate-800 p-3 rounded-2xl flex justify-between items-center border border-slate-700">
                                <div>
                                    <p className="font-bold text-sm text-white">{g.name}</p>
                                    <p className="text-xs text-slate-400 font-mono">{g.phone}</p>
                                </div>
                                <button
                                    onClick={() => removeGuardian(g.id)}
                                    className="text-slate-500 hover:text-red-400 p-2 transition"
                                >
                                    <span className="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
