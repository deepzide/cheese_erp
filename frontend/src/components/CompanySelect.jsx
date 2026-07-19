import React, { useEffect } from "react";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useHotelAccess } from "@/lib/useHotelAccess";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";

/**
 * Company picker with establishment-user scoping:
 * - Auto-fills the user's assigned company when empty
 * - For admins, auto-fills from the global establishment selector when one
 *   is active (creation modals inherit the app-wide scope)
 * - Restricts options to assigned companies for non-admins
 * - Locks the field when the user has exactly one company
 */
export default function CompanySelect({
    value,
    onChange,
    label = "name",
    filters = {},
    placeholder,
    disabled = false,
    autoFill = true,
}) {
    const { activeCompany, userCompanies, isAdmin } = useHotelAccess();
    const { activeEstablishment } = useActiveEstablishment();
    const companyLocked = !isAdmin && userCompanies.length === 1;
    const scopedFilters =
        !isAdmin && userCompanies.length > 0 ? { name: ["in", userCompanies] } : {};

    useEffect(() => {
        if (!autoFill || value) return;
        if (!isAdmin && activeCompany) {
            onChange(activeCompany);
        } else if (isAdmin && activeEstablishment) {
            onChange(activeEstablishment);
        }
    }, [autoFill, isAdmin, activeCompany, activeEstablishment, value, onChange]);

    const mergedFilters = { ...scopedFilters, ...filters };

    return (
        <FrappeSearchSelect
            doctype="Company"
            label={label}
            value={value}
            onChange={onChange}
            filters={mergedFilters}
            placeholder={placeholder}
            disabled={disabled || companyLocked}
        />
    );
}
