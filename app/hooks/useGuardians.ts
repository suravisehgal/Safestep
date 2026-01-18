"use client";

import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../components/AuthProvider";

export interface Guardian {
    id: string;
    name: string;
    phone: string;
    createdAt?: any;
}

export function useGuardians() {
    const { user } = useAuth();
    const [guardians, setGuardians] = useState<Guardian[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !db) {
            setGuardians([]);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, `users/${user.uid}/guardians`),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Guardian));
            setGuardians(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const addGuardian = async (name: string, phone: string) => {
        if (!user) throw new Error("User not authenticated");
        if (!db) throw new Error("Firebase is not configured. Please check your environment variables.");

        // Validation
        if (!name.trim()) throw new Error("Name is required");
        if (!/^\d+$/.test(phone.replace(/[\s-()]/g, ""))) throw new Error("Invalid phone number");

        await addDoc(collection(db, `users/${user.uid}/guardians`), {
            name: name.trim(),
            phone: phone.trim(),
            createdAt: serverTimestamp()
        });
    };

    const removeGuardian = async (id: string) => {
        if (!user || !db) return;
        await deleteDoc(doc(db, `users/${user.uid}/guardians`, id));
    };

    return { guardians, loading, addGuardian, removeGuardian };
}
