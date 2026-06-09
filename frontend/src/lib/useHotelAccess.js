import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getStoredCredentials } from "@/api/client";

const ADMIN_FALLBACK_ROLES = new Set([
    "Administrator",
    "System Manager",
    "Route Administrator",
    "Central Admin",
]);

function extractPayload(response) {
    return response?.data?.message?.data || response?.data?.data || response?.data?.message || response?.data || {};
}

export function useHotelAccess() {
    const credentials = getStoredCredentials();
    const userId = credentials?.user || credentials?.email || credentials?.name || "";
    const roles = Array.isArray(credentials?.roles) ? credentials.roles : [];
    const isAdminFallback = userId === "Administrator" || roles.some((r) => ADMIN_FALLBACK_ROLES.has(r));

    const userQuery = useQuery({
        queryKey: ["current-user-profile", userId],
        enabled: !!userId,
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchInterval: 30000,
        queryFn: async () => {
            const res = await apiRequest(
                `/api/method/cheese.api.v1.user_controller.get_user?user_id=${encodeURIComponent(userId)}`
            );
            return extractPayload(res);
        },
    });

    const userCompanies = useMemo(() => {
        const companies = userQuery?.data?.companies;
        if (Array.isArray(companies) && companies.length > 0) return companies;
        return [];
    }, [userQuery?.data?.companies]);

    const activeCompany = userCompanies[0] || "";

    const establishmentQuery = useQuery({
        queryKey: ["active-establishment-profile", activeCompany],
        enabled: !!activeCompany,
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchInterval: 5000,
        queryFn: async () => {
            const res = await apiRequest(
                `/api/method/cheese.api.v1.establishment_controller.get_establishment_details?company_id=${encodeURIComponent(activeCompany)}`
            );
            return extractPayload(res);
        },
    });

    const hasHotelAccess = useMemo(() => {
        if (isAdminFallback) return true;
        if (activeCompany) {
            return Boolean(establishmentQuery?.data?.is_hotel || establishmentQuery?.data?.cheese_is_hotel);
        }
        return false;
    }, [isAdminFallback, activeCompany, establishmentQuery?.data?.is_hotel, establishmentQuery?.data?.cheese_is_hotel]);

    const establishmentName = useMemo(() => {
        if (activeCompany) {
            return (
                establishmentQuery?.data?.company_name ||
                establishmentQuery?.data?.name ||
                activeCompany
            );
        }
        if (isAdminFallback) return "All Establishments";
        return "";
    }, [activeCompany, establishmentQuery?.data?.company_name, establishmentQuery?.data?.name, isAdminFallback]);

    const companyLocked = !isAdminFallback && userCompanies.length === 1;

    return {
        hasHotelAccess,
        isLoading: userQuery.isLoading || establishmentQuery.isLoading,
        activeCompany,
        userCompanies,
        establishmentName,
        isAdmin: isAdminFallback,
        companyLocked,
    };
}

/** Auto-fill a company field/filter for establishment users. */
export function useAutoFillCompany(value, onChange, { enabled = true } = {}) {
    const { activeCompany, isAdmin } = useHotelAccess();

    useEffect(() => {
        if (!enabled || isAdmin || !activeCompany || value) return;
        onChange(activeCompany);
    }, [enabled, isAdmin, activeCompany, value, onChange]);
}
