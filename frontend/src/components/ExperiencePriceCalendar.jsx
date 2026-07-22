import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CalendarDays, TrendingUp, TrendingDown, Tag, Sparkles, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiRequest } from "@/api/client";

/**
 * Month price calendar for a Cheese Experience. Each day shows the cheapest
 * resolved price ("desde") plus season/promotion/custom markers; clicking a day
 * lists every configured price of the experience (base individual/route price
 * plus each weekday/weekend × age-group combination, only the values entered),
 * the active season/promotions and any custom price for that date. Shift+click a
 * second day to select a range and create a custom price for it.
 *
 * Backed by pricing_controller.get_experience_price_calendar and
 * custom_price_controller.create_custom_price.
 */

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const pad = (n) => String(n).padStart(2, "0");
const fmtMoney = (n, cur) =>
    `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ""}`;

export default function ExperiencePriceCalendar({ experienceId }) {
    const { t, i18n } = useTranslation();
    const queryClient = useQueryClient();
    const [monthDate, setMonthDate] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });
    const [selected, setSelected] = useState(null);      // day whose detail is shown
    const [rangeStart, setRangeStart] = useState(null);  // custom-price range anchor
    const [rangeEnd, setRangeEnd] = useState(null);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
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

    const ageGroupMap = useMemo(() => {
        const m = {};
        (data?.age_groups || []).forEach((g) => { m[g.name] = g; });
        return m;
    }, [data]);

    // Configured price cases of the experience (day-agnostic): base individual /
    // in-route price plus every day-type × age-group line. Only values actually
    // entered are kept, so nothing empty is ever shown.
    const priceCases = useMemo(() => {
        const exp = data?.experience || {};
        const isHotel = exp.experience_type === "HOTEL";
        const caseLabel = (l) => {
            const day = l.day_type === "WEEKDAY" ? t("priceCalendar.weekday", "Lunes a viernes")
                : l.day_type === "WEEKEND" ? t("priceCalendar.weekend", "Fin de semana") : null;
            let age = null;
            if (l.age_group) {
                const g = ageGroupMap[l.age_group];
                age = g ? `${g.group_name || l.age_group_name} (${g.min_age}–${g.max_age})` : (l.age_group_name || l.age_group);
            }
            if (day && age) return `${day} · ${age}`;
            return day || age || t("priceCalendar.anyDayAllAges", "General");
        };
        const items = [];
        const baseInd = isHotel ? Number(exp.price_per_night) : Number(exp.individual_price);
        const baseRte = Number(exp.route_price);
        if (baseInd > 0 || baseRte > 0) {
            items.push({
                key: "base",
                label: isHotel ? t("priceCalendar.perNightCase", "Precio por noche") : t("priceCalendar.baseCase", "Precio base"),
                individual: baseInd > 0 ? baseInd : undefined,
                individualLabel: isHotel ? t("priceCalendar.perNight", "Por noche") : t("priceCalendar.individual", "Individual"),
                route: baseRte > 0 ? baseRte : undefined,
            });
        }
        (exp.price_lines || []).forEach((l, i) => {
            const ind = Number(l.price) || 0;
            const rte = Number(l.route_price) || 0;
            if (ind <= 0 && rte <= 0) return;
            items.push({
                key: `line-${i}`,
                label: caseLabel(l),
                individual: ind > 0 ? ind : undefined,
                individualLabel: t("priceCalendar.individual", "Individual"),
                route: rte > 0 ? rte : undefined,
            });
        });
        return items;
    }, [data, ageGroupMap, t]);

    const y = monthDate.getFullYear();
    const mo = monthDate.getMonth();
    const firstDow = (new Date(y, mo, 1).getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(`${y}-${pad(mo + 1)}-${pad(day)}`);

    const weekdayLabels = t("priceCalendar.weekdaysShort", "Lun,Mar,Mié,Jue,Vie,Sáb,Dom").split(",");
    const monthLabel = monthDate.toLocaleDateString(i18n.language || undefined, { month: "long", year: "numeric" });

    // Range (ISO strings compare lexicographically).
    const rangeLo = rangeStart && rangeEnd ? (rangeStart <= rangeEnd ? rangeStart : rangeEnd) : rangeStart;
    const rangeHi = rangeStart && rangeEnd ? (rangeStart <= rangeEnd ? rangeEnd : rangeStart) : rangeStart;
    const inRange = (ds) => rangeStart && rangeHi && ds >= rangeLo && ds <= rangeHi;
    const clearRange = () => { setRangeStart(null); setRangeEnd(null); };

    const handleDayClick = (ds, shift) => {
        if (shift && rangeStart) {
            setRangeEnd(ds);
        } else {
            setRangeStart(ds);
            setRangeEnd(null);
        }
        setSelected(ds);
    };

    const goPrev = () => { setSelected(null); clearRange(); setMonthDate(new Date(y, mo - 1, 1)); };
    const goNext = () => { setSelected(null); clearRange(); setMonthDate(new Date(y, mo + 1, 1)); };

    const discountLabel = (p) => {
        if (p.discount_type === "PERCENT") return `−${p.percent}%`;
        if (p.discount_type === "FREE_TICKETS")
            return t("priceCalendar.freeTickets", "{{n}} gratis", { n: p.free_tickets });
        return p.discount_type;
    };

    // ---- Custom price form ----
    const lineLabel = (l) => {
        const day = l.day_type === "WEEKDAY" ? t("priceCalendar.weekday", "Lunes a viernes")
            : l.day_type === "WEEKEND" ? t("priceCalendar.weekend", "Fin de semana")
                : t("priceCalendar.anyDay", "Cualquier día");
        const age = l.age_group_name ? l.age_group_name : t("experiences.allAges", "Todas las edades");
        return `${day} · ${age}`;
    };

    const openForm = () => {
        const exp = data?.experience || {};
        const isHotel = exp.experience_type === "HOTEL";
        setForm({
            is_hotel: isHotel,
            date_from: rangeLo,
            date_to: rangeHi,
            custom_price_name: "",
            individual_price: isHotel ? "" : String(exp.individual_price ?? ""),
            price_per_night: isHotel ? String(exp.price_per_night ?? "") : "",
            route_price: String(exp.route_price ?? ""),
            lines: (exp.price_lines || []).map((l) => ({
                day_type: l.day_type, age_group: l.age_group, age_group_name: l.age_group_name,
                price: String(l.price ?? ""), route_price: String(l.route_price ?? ""),
            })),
            participates_in_promotions: false,
            affected_by_seasons: false,
        });
        setFormOpen(true);
    };

    const setLine = (idx, field, value) =>
        setForm((f) => ({ ...f, lines: f.lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)) }));

    const handleSave = async () => {
        if (!form?.date_from || !form?.date_to) return;
        try {
            setSaving(true);
            await apiRequest("/api/method/cheese.api.v1.custom_price_controller.create_custom_price", {
                method: "POST",
                body: JSON.stringify({
                    experience_id: experienceId,
                    date_from: form.date_from,
                    date_to: form.date_to,
                    custom_price_name: form.custom_price_name || undefined,
                    individual_price: Number(form.individual_price) || 0,
                    price_per_night: Number(form.price_per_night) || 0,
                    route_price: Number(form.route_price) || 0,
                    price_lines: form.lines.map((l) => ({
                        day_type: l.day_type, age_group: l.age_group || null,
                        price: Number(l.price) || 0, route_price: Number(l.route_price) || 0,
                    })),
                    participates_in_promotions: form.participates_in_promotions ? 1 : 0,
                    affected_by_seasons: form.affected_by_seasons ? 1 : 0,
                }),
            });
            toast.success(t("priceCalendar.customCreated", "Precio personalizado creado"));
            setFormOpen(false);
            clearRange();
            queryClient.invalidateQueries({ queryKey: ["experience-price-calendar", experienceId] });
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setSaving(false);
        }
    };

    const hasCustom = !!selectedDay?.custom_price;

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
                        <p className="text-[11px] text-muted-foreground">
                            {t("priceCalendar.shiftHint", "Haz clic en un día para ver sus precios. Mantén Shift y haz clic en otra fecha para seleccionar un rango y crear un precio personalizado.")}
                        </p>
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
                                const isDetail = selected === ds;
                                const inRng = inRange(ds);
                                const stateClass = isDetail
                                    ? "border-cheese-500 ring-1 ring-cheese-500 bg-cheese-500/10"
                                    : inRng
                                        ? "border-cheese-400/70 bg-cheese-500/5"
                                        : day?.custom_price
                                            ? "border-purple-400/50 hover:bg-muted/60"
                                            : "border-border hover:bg-muted/60";
                                return (
                                    <button
                                        type="button"
                                        key={ds}
                                        onClick={(e) => handleDayClick(ds, e.shiftKey)}
                                        disabled={isLoading || !day}
                                        className={[
                                            "min-h-[64px] rounded-md border p-1.5 text-left flex flex-col justify-between transition-colors",
                                            isWeekend && !isDetail && !inRng ? "bg-muted/40" : "",
                                            stateClass,
                                        ].join(" ")}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={`text-xs font-semibold ${isWeekend ? "text-muted-foreground" : ""}`}>{dayNum}</span>
                                            <span className="flex items-center gap-0.5">
                                                {day?.custom_price && <Sparkles className="w-3 h-3 text-purple-500" />}
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

                        {rangeStart && (
                            <div className="flex items-center justify-between gap-2 rounded-md border border-cheese-500/40 bg-cheese-500/5 px-3 py-2 flex-wrap">
                                <span className="text-xs">
                                    {rangeEnd
                                        ? t("priceCalendar.rangeSelected", "Rango seleccionado: {{from}} → {{to}}", { from: rangeLo, to: rangeHi })
                                        : t("priceCalendar.rangeSingle", "Fecha: {{from}} — mantén Shift y haz clic en otra para un rango.", { from: rangeLo })}
                                </span>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" onClick={clearRange}>
                                        <X className="w-3.5 h-3.5 mr-1" /> {t("common.clear", "Limpiar")}
                                    </Button>
                                    <Button size="sm" className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" disabled={!data?.experience} onClick={openForm}>
                                        <Plus className="w-3.5 h-3.5 mr-1" /> {t("priceCalendar.createCustom", "Crear precio personalizado")}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {selectedDay ? (
                            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <p className="font-semibold text-sm">{selectedDay.date}</p>
                                    <Badge variant="outline" className="text-xs">
                                        {selectedDay.day_type === "WEEKEND" ? t("priceCalendar.weekend", "Fin de semana") : t("priceCalendar.weekday", "Lunes a viernes")}
                                    </Badge>
                                </div>

                                {hasCustom && (
                                    <div className="rounded-md border border-purple-400/40 bg-purple-500/5 px-3 py-2 text-xs space-y-0.5">
                                        <p className="font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                                            <Sparkles className="w-3.5 h-3.5" /> {t("priceCalendar.customActive", "Precio personalizado")}
                                            {selectedDay.custom_price.custom_price_name ? ` — ${selectedDay.custom_price.custom_price_name}` : ""}
                                        </p>
                                        <p className="text-muted-foreground">
                                            {t("priceCalendar.customPromos", "Promociones")}: {selectedDay.custom_price.participates_in_promotions ? t("common.yes", "Sí") : t("common.no", "No")}
                                            {" · "}
                                            {t("priceCalendar.customSeasons", "Temporada")}: {selectedDay.custom_price.affected_by_seasons ? t("common.yes", "Sí") : t("common.no", "No")}
                                        </p>
                                    </div>
                                )}

                                {selectedDay.season && Number(selectedDay.season.percent) !== 0 && (
                                    <p className={`text-xs font-medium ${selectedDay.season_applies ? (Number(selectedDay.season.percent) > 0 ? "text-amber-600" : "text-emerald-600") : "text-muted-foreground line-through"}`}>
                                        {t("priceCalendar.seasonLine", "Temporada \"{{name}}\": {{sign}}{{percent}}%", {
                                            name: selectedDay.season.season_name || selectedDay.season.season_id,
                                            sign: Number(selectedDay.season.percent) > 0 ? "+" : "",
                                            percent: selectedDay.season.percent,
                                        })}
                                        {!selectedDay.season_applies && ` (${t("priceCalendar.seasonNotApplied", "no aplica a este precio personalizado")})`}
                                    </p>
                                )}

                                {priceCases.length > 0 && (() => {
                                    // Season adjusts the configured prices for this date; a custom price
                                    // replaces them, so we don't apply the season factor on custom days.
                                    const pct = hasCustom ? 0 : (selectedDay.season_applies ? Number(selectedDay.season?.percent) || 0 : 0);
                                    const factor = 1 + pct / 100;
                                    const amount = (label, value) => (
                                        <span className="flex items-baseline justify-end gap-1.5 leading-tight">
                                            <span className="text-[11px] text-muted-foreground">{label}</span>
                                            {pct !== 0 ? (
                                                <>
                                                    <span className="text-xs text-muted-foreground line-through">{fmtMoney(value, "")}</span>
                                                    <span className="font-semibold">{fmtMoney(value * factor, currency)}</span>
                                                </>
                                            ) : (
                                                <span className="font-semibold">{fmtMoney(value, currency)}</span>
                                            )}
                                        </span>
                                    );
                                    return (
                                        <div className="space-y-1">
                                            <p className="text-[11px] uppercase font-semibold text-muted-foreground">
                                                {t("priceCalendar.pricesTitle", "Precios de la experiencia")}
                                                {pct !== 0 && (
                                                    <span className="ml-1 normal-case font-normal text-muted-foreground lowercase">
                                                        {t("priceCalendar.withSeasonNote", "(con temporada aplicada)")}
                                                    </span>
                                                )}
                                            </p>
                                            <div className="divide-y divide-border/50">
                                                {priceCases.map((it) => (
                                                    <div key={it.key} className="flex items-start justify-between gap-3 py-1.5">
                                                        <span className="text-sm text-muted-foreground pt-0.5">{it.label}</span>
                                                        <span className="flex flex-col items-end gap-0.5 text-right">
                                                            {it.individual != null && amount(it.individualLabel, it.individual)}
                                                            {it.route != null && amount(t("priceCalendar.inRoute", "En paquete"), it.route)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {selectedDay.promotions?.length > 0 && (
                                    <div className="space-y-1 pt-1">
                                        <p className="text-[11px] uppercase font-semibold text-muted-foreground">
                                            {t("priceCalendar.promotions", "Promociones activas")}
                                            {hasCustom && !selectedDay.promotions_apply && ` — ${t("priceCalendar.promosNotApplied", "no aplican a este precio personalizado")}`}
                                        </p>
                                        {selectedDay.promotions.map((p) => (
                                            <div key={p.promotion_id} className={`flex items-start gap-2 text-xs ${hasCustom && !selectedDay.promotions_apply ? "opacity-50" : ""}`}>
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

            {/* Create custom price */}
            <Dialog open={formOpen} onOpenChange={(o) => { if (!o) setFormOpen(false); }}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-500" /> {t("priceCalendar.createCustom", "Crear precio personalizado")}
                        </DialogTitle>
                    </DialogHeader>
                    {form && (
                        <div className="space-y-4">
                            <p className="text-xs text-muted-foreground">
                                {t("priceCalendar.customFormHint", "Este precio reemplaza los precios de la experiencia durante el rango indicado. Cada campo viene con el precio actual; edítalo para sobreescribirlo.")}
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label>{t("common.from", "Desde")}</Label>
                                    <Input type="date" value={form.date_from} onChange={(e) => setForm((f) => ({ ...f, date_from: e.target.value }))} />
                                </div>
                                <div className="space-y-1">
                                    <Label>{t("common.to", "Hasta")}</Label>
                                    <Input type="date" value={form.date_to} onChange={(e) => setForm((f) => ({ ...f, date_to: e.target.value }))} />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label>{t("priceCalendar.customLabel", "Nombre (opcional)")}</Label>
                                <Input placeholder={t("priceCalendar.customLabelPh", "Ej: Feriado Semana de Turismo")} value={form.custom_price_name} onChange={(e) => setForm((f) => ({ ...f, custom_price_name: e.target.value }))} />
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">{t("priceCalendar.basePrices", "Precios base")}</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {form.is_hotel ? (
                                        <div className="space-y-1">
                                            <Label>{t("experiences.pricePerNight", "Precio por noche")} ({currency})</Label>
                                            <Input type="number" step="0.01" value={form.price_per_night} onChange={(e) => setForm((f) => ({ ...f, price_per_night: e.target.value }))} />
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <Label>{t("experiences.individualPrice", "Precio individual")} ({currency})</Label>
                                            <Input type="number" step="0.01" value={form.individual_price} onChange={(e) => setForm((f) => ({ ...f, individual_price: e.target.value }))} />
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                        <Label>{t("experiences.routePrice", "Precio en paquete")} ({currency})</Label>
                                        <Input type="number" step="0.01" value={form.route_price} onChange={(e) => setForm((f) => ({ ...f, route_price: e.target.value }))} />
                                    </div>
                                </div>
                            </div>

                            {form.lines.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("priceCalendar.matrixPrices", "Precios por día y grupo etario")}</p>
                                    <div className="space-y-2">
                                        {form.lines.map((l, i) => (
                                            <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 items-center">
                                                <span className="text-xs truncate">{lineLabel(l)}</span>
                                                <Input type="number" step="0.01" placeholder={t("priceCalendar.individual", "Individual")} value={l.price} onChange={(e) => setLine(i, "price", e.target.value)} />
                                                <Input type="number" step="0.01" placeholder={t("priceCalendar.inRoute", "En paquete")} value={l.route_price} onChange={(e) => setLine(i, "route_price", e.target.value)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2 border-t border-border pt-3">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" className="h-4 w-4 accent-cheese-500" checked={form.participates_in_promotions} onChange={(e) => setForm((f) => ({ ...f, participates_in_promotions: e.target.checked }))} />
                                    {t("priceCalendar.flagPromos", "Este precio puede ser afectado por promociones")}
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" className="h-4 w-4 accent-cheese-500" checked={form.affected_by_seasons} onChange={(e) => setForm((f) => ({ ...f, affected_by_seasons: e.target.checked }))} />
                                    {t("priceCalendar.flagSeasons", "Este precio puede ser afectado por precios de temporada")}
                                </label>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setFormOpen(false)}>{t("common.cancel", "Cancelar")}</Button>
                        <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={handleSave} disabled={saving}>
                            {saving ? t("common.saving", "Guardando…") : t("common.create", "Crear")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
