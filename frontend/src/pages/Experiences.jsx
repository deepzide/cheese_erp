import React, { useState, useMemo } from "react";
import { useAutoFillCompany, useHotelAccess } from "@/lib/useHotelAccess";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Search, Plus, DollarSign, Calendar, Ticket, Shield, FileText, MoreHorizontal, AlertCircle, RefreshCw, Loader2, Eye, BedDouble, LayoutGrid, Table2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { experienceService } from "@/api/experienceService";
import { useFrappeUpdate, useFrappeList } from "@/lib/useApiData";

const DAY_TYPE_LABEL = { ALL: "Cualquier día", WEEKDAY: "Lun-Vie", WEEKEND: "Fin de semana" };

const STATUS_BADGE = {
    ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    INACTIVE: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
    DRAFT: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
};

export default function Experiences() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const { companyLocked } = useHotelAccess();
    const [companyFilter, setCompanyFilter] = useState("all");
    const [selectedExperience, setSelectedExperience] = useState(null);
    const [view, setView] = useState("cards"); // "cards" | "table"
    const [showRoomTypes, setShowRoomTypes] = useState(false);

    useAutoFillCompany(companyFilter === "all" ? "" : companyFilter, (v) => setCompanyFilter(v));

    const { activeEstablishment } = useActiveEstablishment();
    const { data: expRaw, isLoading, error, refetch } = useQuery({
        queryKey: ['experiences', activeEstablishment],
        queryFn: async () => {
            const result = await experienceService.listExperiences({ page_size: 100, establishment_id: activeEstablishment || undefined });
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || [];
        },
    });

    // Room types (HOTEL experiences) live in their own menu; hidden here unless
    // the "show room types" checkbox is enabled.
    const experiences = (Array.isArray(expRaw) ? expRaw : []).filter((e) => showRoomTypes || e.experience_type !== "HOTEL");

    // All price-matrix lines of the experiences in scope (weekday/range x age group).
    const experienceNames = useMemo(() => experiences.map((e) => e.name), [experiences]);
    const { data: priceLines = [] } = useFrappeList("Cheese Experience Price", {
        enabled: experienceNames.length > 0,
        filters: { parenttype: "Cheese Experience", parent: ["in", experienceNames.length ? experienceNames : ["__none__"]] },
        fields: ["parent", "day_type", "day_range", "age_group", "price", "route_price"],
        pageSize: 2000,
    });
    const { data: ageGroups = [] } = useFrappeList("Cheese Age Group", {
        filters: activeEstablishment ? { company: activeEstablishment } : {},
        fields: ["name", "group_name"],
        pageSize: 1000,
    });
    const { data: dayRanges = [] } = useFrappeList("Cheese Day Range", {
        filters: activeEstablishment ? { company: activeEstablishment } : {},
        fields: ["name", "range_name"],
        pageSize: 1000,
    });

    const ageLabel = useMemo(() => Object.fromEntries((ageGroups || []).map((g) => [g.name, g.group_name || g.name])), [ageGroups]);
    const rangeLabel = useMemo(() => Object.fromEntries((dayRanges || []).map((r) => [r.name, r.range_name || r.name])), [dayRanges]);
    const linesByExp = useMemo(() => {
        const map = {};
        (priceLines || []).forEach((l) => {
            if (!(Number(l.price) > 0 || Number(l.route_price) > 0)) return;
            (map[l.parent] = map[l.parent] || []).push(l);
        });
        return map;
    }, [priceLines]);

    const money = (v, cur) => `${cur || "UYU"} ${Number(v).toLocaleString("es-UY")}`;
    const dayLabel = (l) => (l.day_range ? (rangeLabel[l.day_range] || l.day_range) : (DAY_TYPE_LABEL[l.day_type] || l.day_type || "Cualquier día"));
    const lineLabel = (l) => `${dayLabel(l)}${l.age_group ? ` · ${ageLabel[l.age_group] || l.age_group}` : ""}`;
    // Full price list for an experience: base + package + every matrix line.
    const allPrices = (exp) => {
        const cur = exp.currency;
        const out = [];
        if (exp.individual_price) out.push({ label: t("experiences.individualPrice", "Precio individual"), value: money(exp.individual_price, cur) });
        if (exp.route_price) out.push({ label: t("experiences.routePrice", "Precio en ruta"), value: money(exp.route_price, cur) });
        (linesByExp[exp.name] || []).forEach((l) => {
            const parts = [];
            if (Number(l.price) > 0) parts.push(money(l.price, cur));
            if (Number(l.route_price) > 0) parts.push(`${money(l.route_price, cur)} ${t("experiences.inRouteShort", "ruta")}`);
            out.push({ label: lineLabel(l), value: parts.join(" · ") });
        });
        return out;
    };

    const uniqueCompanies = Array.from(
        new Set(
            (experiences || [])
                .map((e) => e.company)
                .filter((c) => c && c.trim() !== "")
        )
    );

    // Status update mutation for experiences
    const updateExperienceMutation = useFrappeUpdate("Cheese Experience");

    const updateStatus = (experienceId, newStatus) => {
        updateExperienceMutation.mutate(
            { name: experienceId, data: { status: newStatus } },
            {
                onSuccess: () => {
                    toast.success(
                        newStatus === "ONLINE"
                            ? t("experiences.published", "Experience published online")
                            : t("experiences.offline", "Experience taken offline")
                    );
                    queryClient.invalidateQueries({ queryKey: ['experiences'] });
                },
                onError: (err) => {
                    toast.error(err?.message || t("experiences.updateStatusFailed", "Failed to update experience status"));
                },
            }
        );
    };

    // Fetch time slots when an experience is selected
    const { data: slotsRaw, isLoading: slotsLoading } = useQuery({
        queryKey: ['experience-slots', selectedExperience?.name],
        queryFn: async () => {
            const result = await experienceService.listTimeSlots(selectedExperience.name);
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || [];
        },
        enabled: !!selectedExperience,
    });

    const slots = Array.isArray(slotsRaw) ? slotsRaw : [];

    const filtered = experiences.filter(e => {
        if (companyFilter !== "all" && e.company !== companyFilter) {
            return false;
        }
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (e.experience_info || e.name || '').toLowerCase().includes(term);
        }
        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("experiences.loadFailed", "Failed to load experiences")}</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Sparkles className="w-6 h-6 text-cheese-600" /> {t("nav.experiences", "Experiences")}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} ${t("experiences.items", "experiences")}`}</p>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t("common.search", "Search") + "..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 w-56 h-9"
                        />
                    </div>
                    <Select
                        value={companyFilter}
                        onValueChange={setCompanyFilter}
                        disabled={companyLocked}
                    >
                        <SelectTrigger className="w-40 h-9 text-xs">
                            <SelectValue placeholder={t("experiences.allCompanies", "All Companies")} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t("experiences.allCompanies", "All Companies")}</SelectItem>
                            {uniqueCompanies.map((company) => (
                                <SelectItem key={company} value={company}>
                                    {company}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={showRoomTypes}
                            onChange={(e) => setShowRoomTypes(e.target.checked)}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        {t("experiences.showRoomTypes", "Mostrar tipos de habitación")}
                    </label>
                    {/* Card / table view toggle */}
                    <div className="inline-flex rounded-md border border-input overflow-hidden h-9">
                        <button
                            type="button"
                            onClick={() => setView("cards")}
                            className={`px-2.5 flex items-center gap-1 text-xs ${view === "cards" ? "bg-cheese-500 text-black font-semibold" : "bg-background text-muted-foreground hover:bg-muted"}`}
                            title={t("experiences.viewCards", "Tarjetas")}
                        >
                            <LayoutGrid className="w-4 h-4" /> {t("experiences.viewCards", "Tarjetas")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setView("table")}
                            className={`px-2.5 flex items-center gap-1 text-xs border-l border-input ${view === "table" ? "bg-cheese-500 text-black font-semibold" : "bg-background text-muted-foreground hover:bg-muted"}`}
                            title={t("experiences.viewTable", "Tabla")}
                        >
                            <Table2 className="w-4 h-4" /> {t("experiences.viewTable", "Tabla")}
                        </button>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => refetch()}
                        className="h-9 w-9"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button
                        className="cheese-gradient text-black font-semibold border-0 h-9"
                        onClick={() => navigate("/cheese/experiences/new")}
                    >
                        <Plus className="w-4 h-4 mr-1" /> {t("experiences.newExperience", "New Experience")}
                    </Button>
                </div>
            </div>

            {view === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-5 space-y-3">
                        <Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-8 w-full" />
                    </CardContent></Card>
                )) : filtered.map((exp) => (
                    <motion.div key={exp.name} whileHover={{ y: -3 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={(e) => {
                            if (!e.target.closest('[role="menuitem"]') && !e.target.closest('button') && !e.target.closest('a')) {
                                navigate(`/cheese/experiences/${exp.name}`);
                            }
                        }}>
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                                            <Sparkles className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-foreground line-clamp-1">{exp.experience_info || exp.name}</h3>
                                            <span className="text-xs text-muted-foreground">{exp.name}</span>
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="w-4 h-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/experiences/${exp.name}`); }}><Eye className="w-3 h-3 mr-2" /> {t("common.viewDetails", "View Details")}</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/calendar?experience=${exp.name}`); }}><Calendar className="w-3 h-3 mr-2" /> {t("experiences.viewSlots", "View Slots")}</DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/tickets?experience=${exp.name}`); }}><Ticket className="w-3 h-3 mr-2" /> {t("experiences.viewTickets", "View Tickets")}</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/booking-policy?experience=${exp.name}`); }}><Shield className="w-3 h-3 mr-2" /> {t("experiences.bookingPolicy", "Booking Policy")}</DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/documents?entity_type=${encodeURIComponent("Cheese Experience")}&entity_id=${encodeURIComponent(exp.name)}&company=${encodeURIComponent(exp.company || "")}`); }}><FileText className="w-3 h-3 mr-2" /> {t("nav.documents", "Documents")}</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            {exp.status === "ONLINE" ? (
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateStatus(exp.name, "OFFLINE");
                                                    }}
                                                >
                                                    {t("experiences.takeOffline", "Take Offline")}
                                                </DropdownMenuItem>
                                            ) : (
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateStatus(exp.name, "ONLINE");
                                                    }}
                                                >
                                                    {t("experiences.publishOnline", "Publish Online")}
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                {exp.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{exp.description}</p>}
                                {/* All entered prices: base + package + matrix lines */}
                                <div className="rounded-md border border-border/60 divide-y divide-border/40 text-xs mb-3">
                                    {allPrices(exp).length === 0 ? (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground">
                                            <DollarSign className="w-3.5 h-3.5" /> {t("experiences.noPrices", "Sin precios ingresados")}
                                        </div>
                                    ) : (
                                        allPrices(exp).map((p, i) => (
                                            <div key={i} className="flex items-center justify-between px-2.5 py-1.5">
                                                <span className="text-muted-foreground truncate pr-2">{p.label}</span>
                                                <span className="font-medium text-foreground whitespace-nowrap">{p.value}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="flex items-center justify-between">
                                    <Badge className={STATUS_BADGE[exp.status] || STATUS_BADGE.DRAFT}>{exp.status ? t(`status.${exp.status}`, exp.status) : t("status.DRAFT", "DRAFT")}</Badge>
                                    {exp.deposit_required && <Badge variant="outline" className="text-[10px]">{t("experiences.depositRequired", "Deposit Required")}</Badge>}
                                </div>
                                {Number(exp.is_room) === 1 && (
                                    <div className="mt-2">
                                        <Badge variant="outline" className="text-[10px] inline-flex items-center gap-1">
                                            <BedDouble className="w-3 h-3" />
                                            {t("experiences.roomSizeBadge", "Room · max {{count}} guests", { count: exp.room_size || 0 })}
                                        </Badge>
                                    </div>
                                )}
                                {exp.company && (
                                    <div className="mt-2 pt-2 border-t border-border">
                                        <span className="text-[10px] text-muted-foreground">{exp.company}</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>
            ) : (
                <Card className="border border-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                    <th className="text-left px-4 py-3 font-semibold">{t("experiences.colExperience", "Experiencia")}</th>
                                    <th className="text-left px-4 py-3 font-semibold">{t("experiences.company", "Establecimiento")}</th>
                                    <th className="text-left px-4 py-3 font-semibold">{t("experiences.colPrices", "Precios")}</th>
                                    <th className="text-center px-4 py-3 font-semibold">{t("common.status", "Estado")}</th>
                                    <th className="text-center px-4 py-3 font-semibold">{t("experiences.depositShort", "Depósito")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {isLoading ? (
                                    <tr><td colSpan={5} className="px-4 py-6"><Skeleton className="h-6 w-full" /></td></tr>
                                ) : filtered.map((exp) => {
                                    const prices = allPrices(exp);
                                    return (
                                        <tr key={exp.name} className="hover:bg-muted/10 cursor-pointer" onClick={() => navigate(`/cheese/experiences/${exp.name}`)}>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-foreground">{exp.experience_info || exp.name}</div>
                                                <div className="text-[11px] font-mono text-muted-foreground">{exp.name}</div>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">{exp.company || "—"}</td>
                                            <td className="px-4 py-3">
                                                {prices.length === 0 ? (
                                                    <span className="text-muted-foreground">—</span>
                                                ) : (
                                                    <div className="flex flex-col gap-0.5">
                                                        {prices.map((p, i) => (
                                                            <span key={i} className="whitespace-nowrap">
                                                                <span className="text-muted-foreground">{p.label}:</span>{" "}
                                                                <span className="font-medium text-foreground">{p.value}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge className={STATUS_BADGE[exp.status] || STATUS_BADGE.DRAFT}>{exp.status ? t(`status.${exp.status}`, exp.status) : t("status.DRAFT", "DRAFT")}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-center text-muted-foreground">
                                                {exp.deposit_required ? t("common.yes", "Sí") : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><Sparkles className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">{t("experiences.noneFound", "No experiences found")}</p></div>
            )}

            {/* Detail Dialog with Time Slots */}
            <Dialog open={!!selectedExperience} onOpenChange={(open) => !open && setSelectedExperience(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-cheese-600" /> {selectedExperience?.experience_info || selectedExperience?.name}</DialogTitle>
                        <DialogDescription>{selectedExperience?.name}</DialogDescription>
                    </DialogHeader>
                    {selectedExperience && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><p className="text-xs text-muted-foreground">{t("common.status", "Status")}</p><Badge className={STATUS_BADGE[selectedExperience.status]}>{selectedExperience.status ? t(`status.${selectedExperience.status}`, selectedExperience.status) : t("status.DRAFT", "DRAFT")}</Badge></div>
                                <div>
                                    <p className="text-xs text-muted-foreground">
                                        {selectedExperience.experience_type === "HOTEL"
                                            ? t("experiences.pricePerNight", "Price per Night")
                                            : t("experiences.individualPrice", "Individual Price")}
                                    </p>
                                    <p className="font-semibold">
                                        ${selectedExperience.experience_type === "HOTEL"
                                            ? (selectedExperience.price_per_night || 0)
                                            : (selectedExperience.individual_price || 0)}
                                    </p>
                                </div>
                                <div><p className="text-xs text-muted-foreground">{t("experiences.routePrice", "Route Price")}</p><p className="font-semibold">${selectedExperience.route_price || 0}</p></div>
                                <div><p className="text-xs text-muted-foreground">{t("experiences.company", "Company")}</p><p className="text-sm">{selectedExperience.company || '—'}</p></div>
                            </div>
                            {selectedExperience.description && <div><p className="text-xs text-muted-foreground mb-1">{t("common.description", "Description")}</p><p className="text-sm">{selectedExperience.description}</p></div>}

                            {/* Time Slots */}
                            <div>
                                <p className="text-xs text-muted-foreground mb-2">{t("experiences.timeSlots", "Time Slots")}</p>
                                {slotsLoading ? (
                                    <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                                ) : slots.length > 0 ? (
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                        {slots.map((slot) => (
                                            <div key={slot.name} className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                                    <span className="font-medium">{slot.date_from || slot.date}</span>
                                                    <span className="text-muted-foreground">{slot.time_from || slot.time}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span>
                                                        {slot.reserved_capacity != null ? slot.reserved_capacity : (slot.booked || 0)}
                                                        /
                                                        {slot.max_capacity != null ? slot.max_capacity : (slot.capacity || '—')}
                                                    </span>
                                                    <Badge
                                                        variant={(slot.slot_status || slot.status) === 'OPEN' ? 'outline' : 'secondary'}
                                                        className="text-[10px]"
                                                    >
                                                        {(slot.slot_status || slot.status) ? t(`status.${slot.slot_status || slot.status}`, slot.slot_status || slot.status) : '—'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-4">{t("experiences.noTimeSlots", "No time slots configured")}</p>
                                )}
                            </div>

                            <DialogFooter className="gap-2">
                                <Button variant="outline" onClick={() => navigate(`/cheese/booking-policy?experience=${selectedExperience.name}`)}><Shield className="w-4 h-4 mr-1" /> {t("experiences.policy", "Policy")}</Button>
                                <Button variant="outline" onClick={() => navigate(`/cheese/surveys?experience=${selectedExperience.name}`)}>{t("nav.surveys", "Surveys")}</Button>
                                <Button variant="outline" onClick={() => navigate(`/cheese/calendar?experience=${selectedExperience.name}`)}><Calendar className="w-4 h-4 mr-1" /> {t("nav.calendar", "Calendar")}</Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
