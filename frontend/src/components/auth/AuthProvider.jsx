import React, { createContext, useContext, useMemo } from 'react';
import { getStoredCredentials } from '@/api/client';
import { useLocation } from 'react-router-dom';

const AuthContext = createContext(null);

/**
 * Provides authentication context with user info, company, and role data.
 * Reads from stored credentials (localStorage) on every route change.
 */
export function AuthProvider({ children }) {
    const location = useLocation();

    const value = useMemo(() => {
        const credentials = getStoredCredentials();
        if (!credentials?.api_key) {
            return {
                currentUser: null,
                userCompany: null,
                userCompanyName: null,
                companies: [],
                isAdmin: false,
                isAuthenticated: false,
            };
        }

        const companies = credentials.companies || [];
        // First company is the user's primary company
        const primaryCompany = companies.length > 0 ? companies[0] : null;

        return {
            currentUser: credentials,
            userCompany: primaryCompany?.id || primaryCompany || null,
            userCompanyName: primaryCompany?.name || primaryCompany?.id || null,
            companies,
            isAdmin: credentials.is_admin === true || credentials.is_admin === 'true',
            isAuthenticated: true,
        };
    }, [location.pathname]); // Re-evaluate on route change

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Hook to access auth context.
 * Returns { currentUser, userCompany, userCompanyName, companies, isAdmin, isAuthenticated }
 */
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === null) {
        // Fallback for components rendered outside AuthProvider
        return {
            currentUser: null,
            userCompany: null,
            userCompanyName: null,
            companies: [],
            isAdmin: true, // Default to admin for safety outside provider
            isAuthenticated: false,
        };
    }
    return context;
}

export default AuthProvider;
