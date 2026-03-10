import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";

export default function EditableField({
    label,
    value,
    type = "text",
    editMode,
    onChange,
    placeholder = "—",
    doctype = null, // If provided, uses FrappeSearchSelect
    searchLabel = "name"
}) {
    // When not editing, show the display value
    if (!editMode) {
        return (
            <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <div className="font-medium text-sm border-b border-transparent py-2 min-h-[38px] break-words">
                    {value || <span className="text-muted-foreground italic">Empty</span>}
                </div>
            </div>
        );
    }

    // When editing, show the appropriate input
    return (
        <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            {doctype ? (
                <FrappeSearchSelect
                    doctype={doctype}
                    label={searchLabel}
                    value={value || ""}
                    onChange={onChange}
                    placeholder={`Select ${label}...`}
                />
            ) : (
                <Input
                    type={type}
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="h-9 transition-all focus-visible:ring-1 focus-visible:ring-primary"
                />
            )}
        </div>
    );
}
