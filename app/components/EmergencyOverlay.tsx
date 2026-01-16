import { useRef, useEffect } from "react";
import { Guardian, useGuardians } from "../hooks/useGuardians";

interface EmergencyOverlayProps {
    isVisible: boolean;
    onClose: () => void;
    userLocation: [number, number] | undefined;
}

export default function EmergencyOverlay({ isVisible, onClose, userLocation }: EmergencyOverlayProps) {
    const { guardians } = useGuardians();

    if (!isVisible) return null;

    const getMapsLink = () => {
        if (!userLocation) return "Location not available";
        return `https://www.google.com/maps?q=${userLocation[0]},${userLocation[1]}`;
    };

    const getMessage = (type: 'wa' | 'sms') => {
        const time = new Date().toLocaleTimeString();
        const link = getMapsLink();
        const text = `EMERGENCY: I feel unsafe. My location at ${time}: ${link}`;
        return type === 'wa' ? encodeURIComponent(text) : text;
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">

            <div className="max-w-md w-full bg-slate-900 border-2 border-red-500 rounded-3xl p-6 shadow-2xl relative">
                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2">
                    <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center shadow-lg border-4 border-slate-900 animate-pulse">
                        <span className="material-symbols-outlined text-5xl text-white">sos</span>
                    </div>
                </div>

                <h2 className="text-3xl font-black text-white text-center mt-12 mb-2 uppercase tracking-wide">Emergency Mode</h2>
                <p className="text-red-200 text-center mb-8 text-sm">
                    Select a contact to alert immediately.
                </p>

                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {guardians.length === 0 ? (
                        <div className="text-center text-slate-400 py-4 bg-slate-800 rounded-xl">
                            <p>No Trusted Contacts Added.</p>
                            <p className="text-xs mt-1">Add them in settings.</p>
                        </div>
                    ) : (
                        guardians.map(guardian => (
                            <div key={guardian.id} className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="font-bold text-white text-lg">{guardian.name}</span>
                                    <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded-full">{guardian.phone}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <a
                                        href={`tel:${guardian.phone}`}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl flex flex-col items-center justify-center transition"
                                    >
                                        <span className="material-symbols-outlined mb-1">call</span>
                                        <span className="text-xs font-bold">Call</span>
                                    </a>
                                    <a
                                        href={`sms:${guardian.phone}?body=${getMessage('sms')}`}
                                        className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl flex flex-col items-center justify-center transition"
                                    >
                                        <span className="material-symbols-outlined mb-1">sms</span>
                                        <span className="text-xs font-bold">SMS</span>
                                    </a>
                                    <a
                                        href={`https://wa.me/${guardian.phone}?text=${getMessage('wa')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-[#25D366] hover:brightness-110 text-slate-900 p-3 rounded-xl flex flex-col items-center justify-center transition"
                                    >
                                        <span className="material-symbols-outlined mb-1">chat</span>
                                        <span className="text-xs font-bold">WhatsApp</span>
                                    </a>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-6 flex justify-center">
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-800 transition"
                    >
                        <span className="material-symbols-outlined">close</span>
                        Dismiss Emergency
                    </button>
                </div>
            </div>

            <p className="text-slate-400 text-xs mt-8 max-w-xs text-center">
                Browser security requires manual confirmation for calls and messages.
            </p>
        </div>
    );
}
