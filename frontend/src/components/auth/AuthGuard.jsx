import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredCredentials } from '@/api/client';
import { authService } from '@/api/authService';
import { queryClient } from '@/lib/queryClient';

// Reconcile the locally stored token with the active Frappe session (/app)
// exactly once per page load. The Frappe session cookie is the source of
// truth, so if the desk is logged in as a different user than the one cached
// in localStorage, we re-point to that user and drop any stale cached data.
let bootstrapPromise = null;
function bootstrapSession() {
    if (!bootstrapPromise) {
        const previousUser = getStoredCredentials()?.user || null;
        bootstrapPromise = authService
            .syncWithFrappeSession()
            .then((payload) => {
                if (payload && payload.user !== previousUser) {
                    queryClient.clear();
                }
                return payload;
            })
            .catch(() => null);
    }
    return bootstrapPromise;
}

export default function AuthGuard({ children }) {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let active = true;
        bootstrapSession().finally(() => {
            if (active) setReady(true);
        });
        return () => {
            active = false;
        };
    }, []);

    if (!ready) {
        return null;
    }

    const credentials = getStoredCredentials();
    const isAuthenticated = !!(credentials?.api_key && credentials?.api_secret);

    if (!isAuthenticated) {
        return <Navigate to="/cheese/login" replace />;
    }

    return children;
}
