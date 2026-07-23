import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, RefreshCw, Hotel, ChevronLeft, ChevronRight, BedDouble, AlertCircle } from "lucide-react";
import { hotelService } from "@/api/hotelService";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";

const DOW = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const DAYS = 14;

const todayStr = () => new Date().toISOString().split("T")[0];
const addDaysStr = (dateStr, n) => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
};
const isWeekend = (dateStr) => {
    const g = new Date(`${dateStr}T00:00:00`).getDay();
    return g === 0 || g === 6;
};

export default function HotelAvailabilityGrid() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const { activeEstablishment } = useActiveEstablishment();

    const [hotelId, setHotelId] = useState(searchParams.get("hotel") || "");
    const [dateFrom, setDateFrom] = useState(todayStr());

    const { data: hotelsPayload } = useQuery({
        queryKey: ["hotel-experiences-list"],
        queryFn: async () => {
            const res = await hotelService.listHotels({ page: 1, page_size: 200 });
            return res?.data?.message || res?.data || {};
        },
    });
    const allHotels = Array.isArray(hotelsPayload?.data) ? hotelsPayload.data : [];
    const hotels = activeEstablishment ? allHotels.filter((h) => h.name === activeEstablishment) : allHotels;

    // Default to the URL hotel, then the global scope, then the first hotel.
    useEffect(() => {
        if (hotelId && hotels.some((h) => h.name === hotelId)) return;
        const fallback = searchParams.get("hotel") || activeEstablishment || hotels[0]?.name || "";
        if (fallback && hotels.some((h) => h.name === fallback)) setHotelId(fallback);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hotels.length, activeEstablishment]);

    const { data: payload, isLoading, error, refetch } = useQuery({
        queryKey: ["hotel-availability-matrix", hotelId, dateFrom],
        queryFn: async () => {
            const res = await hotelService.getHotelAvailabilityMatrix(hotelId, { date_from: dateFrom, days: DAYS });
            return res?.data?.message?.data || res?.data?.data || {};
        },
        enabled: !!hotelId,
    });

    const dates = Array.isArray(payload?.dates) ? payload.dates : [];
    const roomTypes = Array.isArray(payload?.room_types) ? payload.room_types : [];
    const today = todayStr();

    const gridCols = { gridTemplateColumns: `190px repeat(${dates.length || DAYS}, 56px)` };

    const headCell = (d) => {
        const dt = new Date(`${d}T00:00:00`);
        return (
            <div
                key={d}
                className={`text-center py-1.5 text-[10px] font-semibold border-b border-border ${isWeekend(d) ? "bg-cheese-50 dark:bg-cheese-950/20" : ""} ${d === today ? "text-cheese-700 dark:text-cheese-400" : "text-muted-foreground"}`}
            >
                <span className="block opacity-70">{DOW[dt.getDay()]}</span>
                <span className="text-sm">{dt.getDate()}</span>
            </div>
        );
    };

    const fmtRate = (rate, currency) =>
        rate ? `${Number(rate).toLocaleString("es-UY", { maximumFractionDigits: 0 })}` : "—";

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Hotel className="w-6 h-6 text-cheese-600" /> {t("hotelAvailGrid.title", "Disponibilidad Hotelera")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("hotelAvailGrid.subtitle", "Disponibilidad y tarifa por tipo de habitación para los próximos 14 días")}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <Select value={hotelId} onValueChange={setHotelId}>
                        <SelectTrigger className="w-56 h-9">
                            <SelectValue placeholder={t("hotelAvailGrid.selectHotel", "Selecciona un hotel…")} />
                        </SelectTrigger>
                        <SelectContent>
                            {hotels.map((h) => (
                                <SelectItem key={h.name} value={h.name}>🏨 {h.company_name || h.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setDateFrom(addDaysStr(dateFrom, -7))}>
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Input type="date" value={dateFrom} onChange={(e) => e.target.value && setDateFrom(e.target.value)} className="h-9 w-40" />
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setDateFrom(addDaysStr(dateFrom, 7))}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {!hotelId ? (
                <div className="text-center py-16">
                    <Hotel className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-muted-foreground">{t("hotelAvailGrid.selectHotelTitle", "Selecciona un hotel")}</h3>
                </div>
            ) : error ? (
                <div className="p-6 flex flex-col items-center text-center">
                    <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                    <p className="text-sm text-muted-foreground">{t("hotelAvailGrid.loadFailed", "No se pudo cargar la disponibilidad")}</p>
                </div>
            ) : isLoading ? (
                <Card><CardContent className="p-6 space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </CardContent></Card>
            ) : roomTypes.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                    {t("hotelAvailGrid.noRoomTypes", "Este hotel no tiene tipos de habitación.")}
                </CardContent></Card>
            ) : (
                <Card className="border border-border overflow-hidden">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                            <CalendarDays className="w-4 h-4" /> {t("hotelAvailGrid.gridTitle", "Disponibilidad y tarifas")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <div className="grid min-w-max" style={gridCols}>
                                {/* Header */}
                                <div className="py-1.5 px-3 text-[10px] font-semibold uppercase text-muted-foreground border-b border-border flex items-end">
                                    {t("hotelAvailGrid.roomTypeCol", "Tipo de habitación")}
                                </div>
                                {dates.map(headCell)}

                                {/* Total availability row */}
                                <div className="py-2 px-3 text-xs font-semibold text-foreground border-b border-border/60 bg-muted/30">
                                    {t("hotelAvailGrid.totalAvailability", "Disponibilidad total")}
                                </div>
                                {dates.map((d, i) => {
                                    const total = roomTypes.reduce((acc, rt) => acc + (rt.days?.[i]?.available ?? 0), 0);
                                    return (
                                        <div key={d} className={`py-2 text-center text-xs font-bold border-b border-border/60 bg-muted/30 ${isWeekend(d) ? "bg-cheese-50 dark:bg-cheese-950/20" : ""}`}>
                                            {total}
                                        </div>
                                    );
                                })}

                                {roomTypes.map((rt) => (
                                    <React.Fragment key={rt.room_type}>
                                        {/* Group header */}
                                        <div className="py-2 px-3 text-xs font-semibold text-cheese-700 dark:text-cheese-400 bg-cheese-50/60 dark:bg-cheese-950/20 border-b border-border/60 flex items-center gap-1" style={{ gridColumn: `1 / span ${dates.length + 1}` }}>
                                            <BedDouble className="w-3.5 h-3.5" />
                                            {rt.room_type} · {rt.total_rooms} {t("hotelAvailGrid.rooms", "hab")}
                                            {rt.min_nights_stay > 1 ? ` · ${t("hotelAvailGrid.minNights", "mín {{n}} noches", { n: rt.min_nights_stay })}` : ""}
                                        </div>
                                        {/* Available row */}
                                        <div className="py-1.5 px-3 pl-6 text-xs text-muted-foreground border-b border-border/40">
                                            {t("hotelAvailGrid.availableRow", "Disponibles")}
                                        </div>
                                        {rt.days.map((day) => (
                                            <div
                                                key={day.date}
                                                title={`${day.available}/${rt.active_rooms}`}
                                                className={`py-1.5 text-center text-xs font-semibold border-b border-border/40 ${isWeekend(day.date) ? "bg-cheese-50/60 dark:bg-cheese-950/10" : ""} ${rt.active_rooms === 0
                                                    ? "text-muted-foreground/50"
                                                    : day.available === 0
                                                        ? "bg-red-500/15 text-red-700 dark:text-red-400"
                                                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}
                                            >
                                                {rt.active_rooms === 0 ? "✕" : day.available}
                                            </div>
                                        ))}
                                        {/* Rate row */}
                                        <div className="py-1.5 px-3 pl-6 text-xs text-muted-foreground border-b border-border/60">
                                            {t("hotelAvailGrid.rateRow", "Tarifa/noche")} <span className="opacity-60">({rt.currency})</span>
                                        </div>
                                        {rt.days.map((day) => (
                                            <div key={day.date} className={`py-1.5 text-center text-[11px] tabular-nums text-muted-foreground border-b border-border/60 ${isWeekend(day.date) ? "bg-cheese-50/60 dark:bg-cheese-950/10" : ""}`}>
                                                {fmtRate(day.rate, rt.currency)}
                                            </div>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground px-4 py-3 border-t border-border">
                            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500/30" /> {t("hotelAvailGrid.legendAvailable", "Disponible")}</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500/30" /> {t("hotelAvailGrid.legendFull", "Completo")}</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-cheese-100 dark:bg-cheese-950/40 border border-border" /> {t("hotelAvailGrid.legendWeekend", "Fin de semana")}</span>
                            <span className="flex items-center gap-1">✕ {t("hotelAvailGrid.legendNoRooms", "Sin habitaciones activas")}</span>
                        </div>
                    </CardContent>
                </Card>
            )}
        </motion.div>
    );
}
