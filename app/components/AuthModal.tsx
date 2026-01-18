"use client";

import { useState } from "react";
import { auth } from "../lib/firebase";
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider } from "firebase/auth";
import { useAuth } from "./AuthProvider";

export default function AuthModal({ onClose }: { onClose: () => void }) {
    const { user } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleGoogleLogin = async () => {
        if (!auth) {
            setError("Firebase is not configured. Please check your environment variables.");
            return;
        }
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            onClose();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth) {
            setError("Firebase is not configured. Please check your environment variables.");
            return;
        }
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            onClose();
        } catch (err: any) {
            setError(err.message);
        }
    };

    if (user) return null; // Should not show if already logged in

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>

                <h2 className="text-2xl font-bold text-white mb-6 text-center">
                    {isLogin ? "Welcome Back" : "Create Account"}
                </h2>

                <button
                    onClick={handleGoogleLogin}
                    className="w-full bg-white text-slate-900 font-bold py-3 rounded-xl mb-4 flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
                >
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                    Continue with Google
                </button>

                <div className="flex items-center gap-4 mb-4">
                    <div className="h-px bg-slate-700 flex-1" />
                    <span className="text-slate-500 text-sm">OR</span>
                    <div className="h-px bg-slate-700 flex-1" />
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-4">
                    <div>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-neon-mint"
                            required
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-neon-mint"
                            required
                        />
                    </div>

                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                    <button
                        type="submit"
                        className="w-full bg-neon-mint text-slate-900 font-bold py-3 rounded-xl hover:bg-emerald-400 transition-colors"
                    >
                        {isLogin ? "Sign In" : "Sign Up"}
                    </button>
                </form>

                <p className="mt-6 text-center text-slate-400 text-sm">
                    {isLogin ? "No account? " : "Already have an account? "}
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-neon-mint font-bold hover:underline"
                    >
                        {isLogin ? "Sign up" : "Log in"}
                    </button>
                </p>
            </div>
        </div>
    );
}
