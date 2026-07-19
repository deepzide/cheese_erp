import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getStoredCredentials } from "@/api/client";
import { useHotelAccess } from "@/lib/useHotelAccess";

/**
 * Global establishment scope (Viventi redesign, E1-3).
 *
 * One selector rules the whole app: the superadmin picks "Toda la ruta"
 * (activeEstablishment === "", consolidated view) or a single establishment,
 * and every list/creation screen reads the scope from here instead of
 * carrying its own CompanySelect. Establishment users are always locked to
 * their own company. The choice persists per user in localStorage.
 */
const ActiveEstablishmentContext = createContext(null);

const storageKey = (userId) => `cheese.activeEstablishment.${userId || "anon"}`;

export function ActiveEstablishmentProvider({ children }) {
    const { isAdmin, userCompanies } = useHotelAccess();
    const ownCompany = (Array.isArray(userCompanies) && userCompanies[0]) || "";
    const credentials = getStoredCredentials();
    const userId = credentials?.user || credentials?.email || "";

    const [selected, setSelected] = useState(() => {
        try {
            return localStorage.getItem(storageKey(userId)) || "";
        } catch {
            return "";
        }
    });

    const { data: establishments = [] } = useQuery({
        queryKey: ["establishment-profiles", userId],
        enabled: !!userId,
        staleTime: 60000,
        queryFn: async () => {
            const res = await apiRequest(
                "/api/method/cheese.api.v1.establishment_controller.get_establishment_profiles"
            );
            const payload = res?.data?.message || res?.data || {};
            return Array.isArray(payload?.data?.establishments) ? payload.data.establishments : [];
        },
    });

    // Drop a persisted selection that no longer exists (renamed/archived company).
    useEffect(() => {
        if (selected && establishments.length && !establishments.some((e) => e.company_id === selected)) {
            setSelected("");
        }
    }, [selected, establishments]);

    const setActiveEstablishment = useCallback(
        (value) => {
            setSelected(value || "");
            try {
                localStorage.setItem(storageKey(userId), value || "");
            } catch { /* storage full/blocked: selection just won't persist */ }
        },
        [userId]
    );

    // Non-admins are always scoped to their own company, whatever is stored.
    const activeEstablishment = isAdmin ? selected : ownCompany;

    const activeProfile = useMemo(
        () => establishments.find((e) => e.company_id === activeEstablishment) || null,
        [establishments, activeEstablishment]
    );

    const value = useMemo(
        () => ({
            isAdmin,
            establishments,
            activeEstablishment,
            setActiveEstablishment,
            isAllEstablishments: isAdmin && !activeEstablishment,
            activeProfile,
        }),
        [isAdmin, establishments, activeEstablishment, setActiveEstablishment, activeProfile]
    );

    return (
        <ActiveEstablishmentContext.Provider value={value}>
            {children}
        </ActiveEstablishmentContext.Provider>
    );
}

export function useActiveEstablishment() {
    const ctx = useContext(ActiveEstablishmentContext);
    if (ctx) return ctx;
    // Screens rendered outside the provider (login) fall back to unscoped.
    return {
        isAdmin: false,
        establishments: [],
        activeEstablishment: "",
        setActiveEstablishment: () => { },
        isAllEstablishments: false,
        activeProfile: null,
    };
}

export default ActiveEstablishmentContext;
