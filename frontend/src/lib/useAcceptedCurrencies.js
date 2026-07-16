import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/api/client";
import { useHotelAccess } from "@/lib/useHotelAccess";

export const ALL_CURRENCIES = ["UYU", "USD", "EUR", "BRL", "ARS"];

/**
 * Currencies accepted by an establishment (empty config = all supported).
 * Without companyId it resolves the authenticated user's establishment;
 * admins without one see every currency.
 */
export function useAcceptedCurrencies(companyId) {
    const { userCompanies } = useHotelAccess();
    const target = companyId || (Array.isArray(userCompanies) && userCompanies[0]) || "";
    const { data } = useQuery({
        queryKey: ["accepted-currencies", target],
        queryFn: async () => {
            const res = await apiRequest(
                "/api/method/cheese.api.v1.establishment_controller.get_establishment_details?company_id=" + encodeURIComponent(target)
            );
            const payload = res?.data?.message?.data || res?.data?.data || {};
            const list = String(payload.accepted_currencies || "")
                .split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
                .filter((c) => ALL_CURRENCIES.includes(c));
            return list.length ? list : ALL_CURRENCIES;
        },
        enabled: !!target,
        staleTime: 60000,
    });
    return target ? (data || ALL_CURRENCIES) : ALL_CURRENCIES;
}
