'use client';

import { useEffect } from "react";
import { touchSession } from "@/actions/session";
import { useSession } from "next-auth/react";

export function SessionManager() {
    const { status } = useSession();

    useEffect(() => {
        if (status === "authenticated") {
            // Update session info (IP, User Agent) on load
            touchSession();
        }
    }, [status]);

    return null;
}
