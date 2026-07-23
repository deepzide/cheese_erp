import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BedDouble, RefreshCw, DoorOpen, Users, Moon, ImagePlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFrappeList } from "@/lib/useApiData";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";

const STATUS_BADGE = {
    ONLINE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    OFFLINE: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
};

const DAY_TYPE_LABEL = {
    ALL: "Cualquier día",
    WEEKDAY: "Lun-Vie",
    WEEKEND: "Fin de semana",
};

export default function RoomTypes() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { activeEstablishment } = useActiveEstablishment();

    const filters = { experience_type: "HOTEL" };
    if (activeEstablishment) filters.company = activeEstablishment;

    const { data: roomTypes = [], isLoading, refetch } = useFrappeList("Cheese Experience", {
        filters,
        fields: ["name", "company", "status", "image", "price_per_night", "route_price", "room_size", "max_occupancy_per_unit", "min_nights_stay", "currency", "differentiate_by_weekday", "differentiate_by_age_group"],
        pageSize: 200,
        orderBy: "company asc, name asc",
    });

    const roomTypeNames = useMemo(() => (roomTypes || []).map((rt) => rt.name), [roomTypes]);

    // All price-matrix lines of the room types in scope (weekday/range x age group).
    const { data: priceLines = [] } = useFrappeList("Cheese Experience Price", {
        enabled: roomTypeNames.length > 0,
        filters: { parenttype: "Cheese Experience", parent: ["in", roomTypeNames.length ? roomTypeNames : ["__none__"]] },
        fields: ["parent", "day_type", "day_range", "age_group", "price", "route_price"],
        pageSize: 1000,
    });

    const { data: rooms = [] } = useFrappeList("Cheese Hotel Room", {
        filters: activeEstablishment ? { company: activeEstablishment } : {},
        fields: ["name", "room_type"],
        pageSize: 1000,
    });

    const { data: ageGroups = [] } = useFrappeList("Cheese Age Group", {
        filters: activeEstablishment ? { company: activeEstablishment } : {},
        fields: ["name", "group_name"],
        pageSize: 500,
    });
    const { data: dayRanges = [] } = useFrappeList("Cheese Day Range", {
        filters: activeEstablishment ? { company: activeEstablishment } : {},
        fields: ["name", "range_name"],
        pageSize: 500,
    });

    const ageLabel = useMemo(() => {
        const m = {};
        (ageGroups || []).forEach((g) => { m[g.name] = g.group_name || g.name; });
        return m;
    }, [ageGroups]);
    const rangeLabel = useMemo(() => {
        const m = {};
        (dayRanges || []).forEach((r) => { m[r.name] = r.range_name || r.name; });
        return m;
    }, [dayRanges]);

    const linesByType = useMemo(() => {
        const map = {};
        (priceLines || []).forEach((l) => {
            if (!(Number(l.price) > 0 || Number(l.route_price) > 0)) return;
            (map[l.parent] = map[l.parent] || []).push(l);
        });
        return map;
    }, [priceLines]);

    const roomCountByType = useMemo(() => {
        const map = {};
        (rooms || []).forEach((r) => { map[r.room_type] = (map[r.room_type] || 0) + 1; });
        return map;
    }, [rooms]);

    const grouped = useMemo(() => {
        const map = {};
        (roomTypes || []).forEach((rt) => { (map[rt.company] = map[rt.company] || []).push(rt); });
        return map;
    }, [roomTypes]);

    const money = (v, cur) => `${cur || "UYU"} ${Number(v).toLocaleString("es-UY")}`;
    const dayLabel = (l) => (l.day_range ? (rangeLabel[l.day_range] || l.day_range) : (DAY_TYPE_LABEL[l.day_type] || l.day_type || "Cualquier día"));
    const lineLabel = (l) => {
        const day = dayLabel(l);
        const age = l.age_group ? ` · ${ageLabel[l.age_group] || l.age_group}` : "";
        return `${day}${age}`;
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <BedDouble className="w-6 h-6 text-cheese-600" />
                        {t("roomTypes.title", "Tipos de Habitaciones")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("roomTypes.description", "Tipos de habitación por hotel: tarifas, capacidad y habitaciones físicas creadas.")}
                    </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading}>
                    <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
            </div>

            {!isLoading && roomTypes.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                    {t("roomTypes.empty", "No hay tipos de habitación registrados para este alcance.")}
                </CardContent></Card>
            ) : (
                Object.entries(grouped).map(([company, types]) => (
                    <div key={company} className="space-y-2">
                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            🏨 {company} · {types.length} {t("roomTypes.types", "tipos")}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {types.map((rt) => {
                                const lines = linesByType[rt.name] || [];
                                return (
                                    <Card
                                        key={rt.name}
                                        className="glass-surface cursor-pointer hover:ring-2 hover:ring-cheese-400/60 transition-all overflow-hidden"
                                        onClick={() => navigate(`/cheese/experiences/${encodeURIComponent(rt.name)}`)}
                                    >
                                        {/* Image preview */}
                                        <div className="h-36 bg-muted/40 flex items-center justify-center overflow-hidden">
                                            {rt.image ? (
                                                <img src={rt.image} alt={rt.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <ImagePlus className="w-8 h-8 text-muted-foreground/30" />
                                            )}
                                        </div>
                                        <CardContent className="p-4 space-y-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <span className="font-semibold text-foreground">{rt.name}</span>
                                                <Badge className={STATUS_BADGE[rt.status] || STATUS_BADGE.OFFLINE}>{rt.status}</Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <DoorOpen className="w-3.5 h-3.5 text-cheese-600" />
                                                    {t("roomTypes.roomsCreated", "{{n}} habitaciones", { n: roomCountByType[rt.name] || 0 })}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Users className="w-3.5 h-3.5 text-cheese-600" />
                                                    {t("roomTypes.capacity", "{{n}} huéspedes/hab.", { n: rt.room_size || rt.max_occupancy_per_unit || "—" })}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Moon className="w-3.5 h-3.5 text-cheese-600" />
                                                    {t("roomTypes.minNights", "Mín. {{n}} noche(s)", { n: rt.min_nights_stay || 1 })}
                                                </span>
                                            </div>

                                            {/* All prices: base + matrix lines */}
                                            <div className="rounded-md border border-border/60 divide-y divide-border/40 text-xs">
                                                <div className="flex items-center justify-between px-2.5 py-1.5">
                                                    <span className="text-muted-foreground">{t("roomTypes.basePrice", "Precio base/noche")}</span>
                                                    <span className="font-medium text-foreground">{rt.price_per_night ? money(rt.price_per_night, rt.currency) : "—"}</span>
                                                </div>
                                                {rt.route_price ? (
                                                    <div className="flex items-center justify-between px-2.5 py-1.5">
                                                        <span className="text-muted-foreground">{t("roomTypes.routePrice", "Precio en paquete")}</span>
                                                        <span className="font-medium text-foreground">{money(rt.route_price, rt.currency)}</span>
                                                    </div>
                                                ) : null}
                                                {lines.map((l, i) => (
                                                    <div key={i} className="flex items-center justify-between px-2.5 py-1.5">
                                                        <span className="text-muted-foreground truncate pr-2">{lineLabel(l)}</span>
                                                        <span className="font-medium text-foreground whitespace-nowrap">
                                                            {Number(l.price) > 0 ? money(l.price, rt.currency) : ""}
                                                            {Number(l.route_price) > 0 ? ` · ${money(l.route_price, rt.currency)} pkg` : ""}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>

                                            {(roomCountByType[rt.name] || 0) === 0 && (
                                                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                                                    {t("roomTypes.noRoomsWarning", "Sin habitaciones físicas: no se pueden crear reservas hasta crearlas en Habitaciones.")}
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}
        </motion.div>
    );
}
