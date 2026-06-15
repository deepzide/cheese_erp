import React, { useEffect } from "react";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useHotelAccess } from "@/lib/useHotelAccess";

/**
 * Company picker with establishment-user scoping:
 * - Auto-fills the user's assigned company when empty
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
    const companyLocked = !isAdmin && userCompanies.length === 1;
    const scopedFilters =
        !isAdmin && userCompanies.length > 0 ? { name: ["in", userCompanies] } : {};

    useEffect(() => {
        if (!autoFill || isAdmin || !activeCompany || value) return;
        onChange(activeCompany);
    }, [autoFill, isAdmin, activeCompany, value, onChange]);

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
