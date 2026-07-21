import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, CalendarDays, TrendingUp, TrendingDown, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/api/client";

/**
 * Month price calendar for a Cheese Experience. Each day shows the cheapest
 * resolved price ("desde") plus season/promotion markers; clicking a day
 * expands every price of that experience for that day (per age group + base),
 * the active season and the promotions covering it. Read-only.
 *
 * Backed by pricing_controller.get_experience_price_calendar.
 */

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const pad = (n) => String(n).padStart(2, "0");
const fmtMoney = (n, cur) =>
    `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ""}`;

export default function ExperiencePriceCalendar({ experienceId }) {
    const { t, i18n } = useTranslation();
    const [monthDate, setMonthDate] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });
    const [selected, setSelected] = useState(null);
    const month = monthKey(monthDate);

    const { data, isLoading, isError } = useQuery({
        queryKey: ["experience-price-calendar", experienceId, month],
        enabled: !!experienceId,
        queryFn: async () => {
            const res = await apiRequest(
                `/api/method/cheese.api.v1.pricing_controller.get_experience_price_calendar?experience_id=${encodeURIComponent(experienceId)}&month=${month}`
            );
            const payload = res?.data?.message || res?.data || {};
            return payload?.data || payload;
        },
    });

    const daysByDate = useMemo(() => {
        const m = {};
        (data?.days || []).forEach((d) => { m[d.date] = d; });
        return m;
    }, [data]);

    const currency = data?.currency || "";
    const selectedDay = selected ? daysByDate[selected] : null;

    const y = monthDate.getFullYear();
    const mo = monthDate.getMonth();
    const firstDow = (new Date(y, mo, 1).getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(`${y}-${pad(mo + 1)}-${pad(day)}`);

    const weekdayLabels = t("priceCalendar.weekdaysShort", "Lun,Mar,Mié,Jue,Vie,Sáb,Dom").split(",");
    const monthLabel = monthDate.toLocaleDateString(i18n.language || undefined, { month: "long", year: "numeric" });

    const goPrev = () => { setSelected(null); setMonthDate(new Date(y, mo - 1, 1)); };
    const goNext = () => { setSelected(null); setMonthDate(new Date(y, mo + 1, 1)); };

    const rowLabel = (r) => {
        if (r.kind === "age_group") return `${r.age_group_name} (${r.min_age}–${r.max_age})`;
        if (r.kind === "base_other") return t("priceCalendar.otherAges", "Otras edades (base)");
        if (r.kind === "general") return t("priceCalendar.generalRow", "General");
        return t("priceCalendar.baseRow", "Precio base");
    };

    const discountLabel = (p) => {
        if (p.discount_type === "PERCENT") return `−${p.percent}%`;
        if (p.discount_type === "FREE_TICKETS")
            return t("priceCalendar.freeTickets", "{{n}} gratis", { n: p.free_tickets });
        return p.discount_type;
    };

    return (
        <Card className="border-border/60 shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-4">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                        <CalendarDays className="w-4 h-4 mr-2" /> {t("priceCalendar.title", "Calendario de precios")}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={goPrev} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label={t("priceCalendar.prevMonth", "Mes anterior")}>
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium capitalize min-w-[9rem] text-center">{monthLabel}</span>
                        <button type="button" onClick={goNext} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label={t("priceCalendar.nextMonth", "Mes siguiente")}>
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                {isError ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        {t("priceCalendar.error", "No se pudo cargar el calendario de precios.")}
                    </p>
                ) : (
                    <>
                        <div className="grid grid-cols-7 gap-1 text-[11px] font-semibold uppercase text-muted-foreground text-center">
                            {weekdayLabels.map((w, i) => <div key={i} className="py-1">{w}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {cells.map((ds, idx) => {
                                if (!ds) return <div key={`e${idx}`} />;
                                const day = daysByDate[ds];
                                const dayNum = Number(ds.slice(-2));
                                const isWeekend = day?.day_type === "WEEKEND";
                                const seasonPct = Number(day?.season?.percent) || 0;
                                const isSelected = selected === ds;
                                return (
                                    <button
                                        type="button"
                                        key={ds}
                                        onClick={() => setSelected(isSelected ? null : ds)}
                                        disabled={isLoading || !day}
                                        className={[
                                            "min-h-[64px] rounded-md border p-1.5 text-left flex flex-col justify-between transition-colors",
                                            isSelected ? "border-cheese-500 ring-1 ring-cheese-500 bg-cheese-500/10" : "border-border hover:bg-muted/60",
                                            isWeekend ? "bg-muted/40" : "",
                                        ].join(" ")}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={`text-xs font-semibold ${isWeekend ? "text-muted-foreground" : ""}`}>{dayNum}</span>
                                            <span className="flex items-center gap-0.5">
                                                {seasonPct !== 0 && (seasonPct > 0
                                                    ? <TrendingUp className="w-3 h-3 text-amber-500" />
                                                    : <TrendingDown className="w-3 h-3 text-emerald-500" />)}
                                                {day?.promo_count > 0 && <Tag className="w-3 h-3 text-cheese-600" />}
                                            </span>
                                        </div>
                                        {isLoading ? (
                                            <span className="h-3 w-10 bg-muted animate-pulse rounded" />
                                        ) : day ? (
                                            <span className="text-[11px] font-medium leading-tight">
                                                <span className="text-muted-foreground">{t("priceCalendar.from", "desde")} </span>
                                                {fmtMoney(day.min_price, currency)}
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>

                        {selectedDay ? (
                            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <p className="font-semibold text-sm">{selectedDay.date}</p>
                                    <Badge variant="outline" className="text-xs">
                                        {selectedDay.day_type === "WEEKEND" ? t("priceCalendar.weekend", "Fin de semana") : t("priceCalendar.weekday", "Lunes a viernes")}
                                    </Badge>
                                </div>

                                {selectedDay.season && Number(selectedDay.season.percent) !== 0 && (
                                    <p className={`text-xs font-medium ${Number(selectedDay.season.percent) > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                                        {t("priceCalendar.seasonLine", "Temporada \"{{name}}\": {{sign}}{{percent}}%", {
                                            name: selectedDay.season.season_name || selectedDay.season.season_id,
                                            sign: Number(selectedDay.season.percent) > 0 ? "+" : "",
                                            percent: selectedDay.season.percent,
                                        })}
                                    </p>
                                )}

                                <div className="space-y-1">
                                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px] uppercase font-semibold text-muted-foreground">
                                        <span>{t("priceCalendar.variant", "Variante")}</span>
                                        <span className="text-right">{t("priceCalendar.individual", "Individual")}</span>
                                        <span className="text-right">{t("priceCalendar.inRoute", "En ruta")}</span>
                                    </div>
                                    {(selectedDay.rows || []).map((r, i) => {
                                        const indDiff = Number(r.individual_base) !== Number(r.individual_effective);
                                        const rteDiff = Number(r.route_base) !== Number(r.route_effective);
                                        return (
                                            <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center text-sm py-1 border-t border-border/50">
                                                <span className="truncate">{rowLabel(r)}</span>
                                                <span className="text-right">
                                                    {indDiff && <span className="text-[11px] text-muted-foreground line-through mr-1">{fmtMoney(r.individual_base, "")}</span>}
                                                    <span className="font-medium">{fmtMoney(r.individual_effective, currency)}</span>
                                                </span>
                                                <span className="text-right text-muted-foreground">
                                                    {rteDiff && <span className="text-[11px] line-through mr-1">{fmtMoney(r.route_base, "")}</span>}
                                                    {fmtMoney(r.route_effective, currency)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {selectedDay.promotions?.length > 0 && (
                                    <div className="space-y-1 pt-1">
                                        <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("priceCalendar.promotions", "Promociones activas")}</p>
                                        {selectedDay.promotions.map((p) => (
                                            <div key={p.promotion_id} className="flex items-start gap-2 text-xs">
                                                <Badge className="bg-cheese-500/15 text-cheese-700 dark:text-cheese-400 shrink-0">
                                                    <Tag className="w-3 h-3 mr-1" /> {discountLabel(p)}
                                                </Badge>
                                                <span className="min-w-0">
                                                    <span className="font-medium">{p.promo_name || p.promotion_id}</span>
                                                    {p.requirements?.length > 0 && (
                                                        <span className="text-muted-foreground">
                                                            {" — "}
                                                            {p.requirements.map((req, ri) => (
                                                                <span key={ri}>
                                                                    {ri > 0 ? ", " : ""}
                                                                    {t("priceCalendar.reqLine", "{{n}}+ {{group}}", {
                                                                        n: req.min_people,
                                                                        group: req.age_group_name
                                                                            ? `${req.age_group_name} (${req.min_age}–${req.max_age})`
                                                                            : t("priceCalendar.anyAge", "personas"),
                                                                    })}
                                                                </span>
                                                            ))}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground text-center py-2">
                                {t("priceCalendar.clickHint", "Haz clic en un día para ver todos sus precios.")}
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
