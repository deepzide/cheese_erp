import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, X, Loader2, ChevronDown } from "lucide-react";
import { apiRequest } from "@/api/client";

/**
 * FrappeSearchSelect — A searchable select that fetches live Frappe doctype records.
 *
 * Props:
 *   doctype    - The Frappe doctype to search, e.g. "Cheese Contact"
 *   label      - Display field to show (e.g. "full_name")
 *   value      - Current selected value (the `name` field)
 *   onChange   - (name) => void
 *   filters    - Optional additional Frappe filters
 *   placeholder
 *   disabled
 */
export default function FrappeSearchSelect({
    doctype,
    label = "name",
    value,
    onChange,
    filters = {},
    placeholder = "Search...",
    disabled = false,
}) {
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Fetch options
    const { data: options = [], isLoading } = useQuery({
        queryKey: ["frappe-search", doctype, searchTerm, JSON.stringify(filters)],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.append('fields', JSON.stringify(["name", label]));
            params.append('limit_page_length', '20');
            params.append('order_by', 'modified desc');

            // Build filters array
            const frappeFilters = [];
            // Add custom filters
            Object.entries(filters).forEach(([key, val]) => {
                if (val != null && val !== '') frappeFilters.push([doctype, key, '=', val]);
            });
            // Add search term filter
            if (searchTerm) {
                frappeFilters.push([doctype, label, 'like', `%${searchTerm}%`]);
            }
            if (frappeFilters.length > 0) {
                params.append('filters', JSON.stringify(frappeFilters));
            }

            const res = await apiRequest(`/api/resource/${encodeURIComponent(doctype)}?${params}`);
            return res?.data?.data || [];
        },
        enabled: open,
        staleTime: 10000,
    });

    // Fetch selected value display label
    const { data: selectedDoc } = useQuery({
        queryKey: ["frappe-doc", doctype, value],
        queryFn: async () => {
            if (!value) return null;
            const res = await apiRequest(`/api/resource/${doctype}/${value}`);
            return res?.data?.data || null;
        },
        enabled: !!value,
        staleTime: 30000,
    });

    const displayLabel = selectedDoc ? (selectedDoc[label] || selectedDoc.name) : value;

    return (
        <div ref={ref} className="relative">
            {/* Trigger */}
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(!open)}
                className={`w-full flex items-center justify-between h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background transition-colors
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-cheese-400 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer'}
                    ${open ? 'border-cheese-400 ring-2 ring-ring ring-offset-2' : ''}`}
            >
                <span className={value ? "text-foreground" : "text-muted-foreground"}>
                    {value ? displayLabel : placeholder}
                </span>
                <div className="flex items-center gap-1">
                    {value && !disabled && (
                        <span
                            onClick={(e) => { e.stopPropagation(); onChange(""); setSearchTerm(""); }}
                            className="p-0.5 rounded hover:bg-muted cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95">
                    {/* Search Input */}
                    <div className="p-2 border-b border-border">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder={`Search ${doctype.replace('Cheese ', '')}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 h-8 text-sm"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Options */}
                    <div className="max-h-48 overflow-y-auto p-1">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                            </div>
                        ) : options.length > 0 ? (
                            options.map((opt) => {
                                const isSelected = opt.name === value;
                                return (
                                    <button
                                        key={opt.name}
                                        type="button"
                                        onClick={() => { onChange(opt.name); setOpen(false); setSearchTerm(""); }}
                                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between
                                            ${isSelected
                                                ? 'bg-cheese-100 dark:bg-cheese-900/30 text-cheese-700 dark:text-cheese-400 font-medium'
                                                : 'hover:bg-muted text-foreground'}`}
                                    >
                                        <span className="truncate">
                                            {opt[label] || opt.name}
                                            {opt[label] && opt[label] !== opt.name && (
                                                <span className="ml-2 text-[10px] font-mono text-muted-foreground">{opt.name}</span>
                                            )}
                                        </span>
                                        {isSelected && <Badge className="text-[9px] bg-cheese-500/20 text-cheese-700 dark:text-cheese-400">selected</Badge>}
                                    </button>
                                );
                            })
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">No results found</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
