import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getStoredCredentials } from '@/api/client';

export default function AuthGuard({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(null);
    const location = useLocation();

    useEffect(() => {
        const credentials = getStoredCredentials();
        setIsAuthenticated(!!credentials?.api_key && !!credentials?.api_secret);
    }, [location]);

    if (isAuthenticated === null) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
                <div className="w-12 h-12 border-4 border-cheese-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/cheese/login" replace />;
    }

    return children;
}
