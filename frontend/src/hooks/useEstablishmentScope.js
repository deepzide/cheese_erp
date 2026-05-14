import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export function useEstablishmentScope(defaultFilter = "all") {
    const { isAdmin, userCompany } = useAuth();
    const [establishmentFilter, setEstablishmentFilter] = useState(
        !isAdmin && userCompany ? userCompany : defaultFilter
    );

    const scopeCompanyId = useMemo(() => {
        if (!isAdmin && userCompany) {
            return userCompany;
        }
        if (establishmentFilter && establishmentFilter !== "all") {
            return establishmentFilter;
        }
        return null;
    }, [isAdmin, userCompany, establishmentFilter]);

    const matchesScope = (companyValue) => {
        if (!scopeCompanyId) {
            return true;
        }
        return companyValue === scopeCompanyId;
    };

    const matchesExperienceScope = (experienceId, experienceCompanyById) => {
        if (!scopeCompanyId) {
            return true;
        }
        if (!experienceId) {
            return false;
        }
        return experienceCompanyById?.[experienceId] === scopeCompanyId;
    };

    return {
        isAdmin,
        userCompany,
        establishmentFilter,
        setEstablishmentFilter,
        scopeCompanyId,
        matchesScope,
        matchesExperienceScope,
        showEstablishmentFilter: isAdmin,
    };
}
