import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getStoredCredentials } from '@/api/client';

export default function AuthGuard({ children }) {
    const location = useLocation();
    
    // Check credentials synchronously on every render to handle page reloads
    const isAuthenticated = useMemo(() => {
        const credentials = getStoredCredentials();
        return !!(credentials?.api_key && credentials?.api_secret);
    }, [location.pathname]);

    if (!isAuthenticated) {
        return <Navigate to="/cheese/login" replace />;
    }

    return children;
}
