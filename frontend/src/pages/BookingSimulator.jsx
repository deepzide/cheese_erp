import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    Calculator, Ticket as TicketIcon, BedDouble, Map as MapIcon, Loader2,
    CalendarDays, Users as UsersIcon, Sparkles, BadgePercent, CheckCircle2, XCircle, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { simulatorService } from "@/api/simulatorService";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";

const TYPES = [
    { key: "ACTIVITY", labelKey: "simulator.activity", label: "Actividad", icon: TicketIcon },
    { key: "HOTEL", labelKey: "simulator.room", label: "Habitación", icon: BedDouble },
    { key: "ROUTE", labelKey: "simulator.package", label: "Paquete", icon: MapIcon },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const money = (v, cur) => v == null ? "—" : `${cur ? cur + " " : "$"}${Number(v).toLocaleString("es-UY", { maximumFractionDigits: 2 })}`;

const DAY_LABEL = { WEEKDAY: "Lunes a viernes", WEEKEND: "Fin de semana", ALL: "Cualquier día" };

function AvailabilityBadge({ availability, t }) {
    if (!availability || availability.checked === false) {
        return <Badge variant="outline" className="gap-1"><Info className="w-3 h-3" /> {t("simulator.availabilityNotChecked", "Sin verificar")}</Badge>;
    }
    if (availability.has_slots === false && availability.available_rooms == null) {
        return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1"><Info className="w-3 h-3" /> {t("simulator.noSlots", "Sin horarios definidos")}</Badge>;
    }
    const ok = availability.enough;
    const n = availability.available_rooms != null ? availability.available_rooms : availability.best_available;
    return ok
        ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 gap-1"><CheckCircle2 className="w-3 h-3" /> {t("simulator.available", "Disponible")} ({n})</Badge>
        : <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 gap-1"><XCircle className="w-3 h-3" /> {t("simulator.notEnough", "Sin cupo suficiente")} ({n})</Badge>;
}

function PricingDetail({ pricing, currency, t }) {
    const breakdown = pricing?.price_breakdown || [];
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {pricing?.day_type && <Badge variant="outline" className="gap-1"><CalendarDays className="w-3 h-3" /> {DAY_LABEL[pricing.day_type] || pricing.day_type}</Badge>}
                {pricing?.season && (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1">
                        <Sparkles className="w-3 h-3" /> {pricing.season.season_name || t("simulator.season", "Temporada")} ({pricing.season.percent > 0 ? "+" : ""}{pricing.season.percent}%)
                    </Badge>
                )}
                {pricing?.promotion_name && (
                    <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 gap-1">
                        <BadgePercent className="w-3 h-3" /> {pricing.promotion_name} (−{money(pricing.promotion_discount, currency)})
                    </Badge>
                )}
            </div>
            {breakdown.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-[11px] uppercase text-muted-foreground border-b border-border">
                                <th className="py-1.5">{t("simulator.person", "Persona")}</th>
                                <th className="py-1.5">{t("simulator.age", "Edad")}</th>
                                <th className="py-1.5">{t("experiences.ageGroup", "Grupo etario")}</th>
                                <th className="py-1.5 text-right">{t("simulator.unitPrice", "Precio")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {breakdown.map((b, i) => (
                                <tr key={i} className="border-b border-border/40">
                                    <td className="py-1.5">{i + 1}</td>
                                    <td className="py-1.5">{b.age != null ? b.age : "—"}</td>
                                    <td className="py-1.5 text-muted-foreground">{b.age_group ? String(b.age_group).split("-").pop() : t("experiences.allAges", "Todas las edades")}</td>
                                    <td className="py-1.5 text-right font-mono">{money(b.unit_price, currency)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {pricing?.price_before_discount != null && (
                <p className="text-xs text-muted-foreground">
                    {t("simulator.subtotalBeforeDiscount", "Subtotal antes de promoción")}: <span className="line-through">{money(pricing.price_before_discount, currency)}</span>
                </p>
            )}
        </div>
    );
}

export default function BookingSimulator() {
    const { t } = useTranslation();
    const { activeEstablishment } = useActiveEstablishment();
    const [type, setType] = useState("ACTIVITY");
    const [form, setForm] = useState({
        experience: "", route: "",
        selected_date: todayStr(),
        check_in_date: todayStr(),
        check_out_date: "",
        party_size: 2,
        rooms_requested: 1,
        ages: ["", ""],
    });
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    // Keep the ages array length in sync with party size.
    useEffect(() => {
        setForm((f) => {
            const n = Math.max(1, parseInt(f.party_size) || 1);
            const ages = [...f.ages];
            while (ages.length < n) ages.push("");
            ages.length = n;
            return { ...f, ages };
        });
    }, [form.party_size]);

    const expFilter = useMemo(() => {
        const base = type === "HOTEL" ? { experience_type: "HOTEL" } : { experience_type: ["!=", "HOTEL"] };
        return activeEstablishment ? { company: activeEstablishment, ...base } : base;
    }, [type, activeEstablishment]);

    const handleSimulate = async () => {
        setLoading(true);
        setResult(null);
        try {
            const ages = form.ages.map((a) => parseInt(a)).filter((a) => !isNaN(a) && a >= 0);
            const payload = { booking_type: type, guest_ages: JSON.stringify(ages) };
            if (type === "HOTEL") {
                if (!form.experience) throw new Error(t("simulator.roomRequired", "Selecciona una habitación"));
                if (!form.check_out_date) throw new Error(t("simulator.checkoutRequired", "Ingresa el check-out"));
                Object.assign(payload, {
                    experience_id: form.experience,
                    check_in_date: form.check_in_date,
                    check_out_date: form.check_out_date,
                    rooms_requested: parseInt(form.rooms_requested) || 1,
                    party_size: parseInt(form.party_size) || 1,
                });
            } else if (type === "ACTIVITY") {
                if (!form.experience) throw new Error(t("simulator.experienceRequired", "Selecciona una experiencia"));
                Object.assign(payload, {
                    experience_id: form.experience,
                    selected_date: form.selected_date,
                    party_size: parseInt(form.party_size) || 1,
                });
            } else {
                if (!form.route) throw new Error(t("simulator.packageRequired", "Selecciona un paquete"));
                Object.assign(payload, {
                    route_id: form.route,
                    selected_date: form.selected_date,
                    party_size: parseInt(form.party_size) || 1,
                });
            }
            const res = await simulatorService.simulate(payload);
            const data = res?.data?.message || res?.data || {};
            if (data?.success === false) throw new Error(data?.error?.message || t("common.failed", "Error"));
            setResult(data?.data || data);
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Calculator className="w-6 h-6 text-cheese-600" /> {t("simulator.title", "Simulador de Reservas")}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {t("simulator.description", "Calcula el precio de una reserva aplicando día de la semana, grupos etarios, temporada y promociones, y verifica la disponibilidad. No crea tickets reales.")}
                </p>
            </div>

            <Card className="glass-surface">
                <CardHeader><CardTitle className="text-base">{t("simulator.inputs", "Datos de la simulación")}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        {TYPES.map(({ key, labelKey, label, icon: Icon }) => (
                            <button
                                key={key} type="button"
                                onClick={() => { setType(key); set({ experience: "", route: "" }); setResult(null); }}
                                className={`flex items-center justify-center gap-1.5 h-9 rounded-md border text-sm font-medium transition-colors ${type === key ? "bg-cheese-500 text-black border-cheese-500" : "bg-background border-input text-muted-foreground hover:text-foreground"}`}
                            >
                                <Icon className="w-4 h-4" /> {t(labelKey, label)}
                            </button>
                        ))}
                    </div>

                    {type === "ROUTE" ? (
                        <div className="space-y-1">
                            <Label>{t("simulator.package", "Paquete")}</Label>
                            <FrappeSearchSelect doctype="Cheese Route" label="short_description" value={form.route} onChange={(v) => set({ route: v })} filters={{ status: "ONLINE" }} placeholder={t("simulator.selectPackage", "Elegir paquete…")} />
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <Label>{type === "HOTEL" ? t("simulator.room", "Habitación") : t("simulator.experience", "Experiencia")}</Label>
                            <FrappeSearchSelect doctype="Cheese Experience" label="name" value={form.experience} onChange={(v) => set({ experience: v })} filters={expFilter} placeholder={t("simulator.fromCatalog", "Del catálogo…")} />
                        </div>
                    )}

                    {type === "HOTEL" ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1"><Label>{t("hotelReservations.checkInDate", "Check-in")}</Label><Input type="date" min={todayStr()} value={form.check_in_date} onChange={(e) => set({ check_in_date: e.target.value })} /></div>
                            <div className="space-y-1"><Label>{t("hotelReservations.checkOutDate", "Check-out")}</Label><Input type="date" min={form.check_in_date || todayStr()} value={form.check_out_date} onChange={(e) => set({ check_out_date: e.target.value })} /></div>
                            <div className="space-y-1"><Label>{t("hotelReservations.roomsRequested", "Habitaciones")}</Label><Input type="number" min="1" value={form.rooms_requested} onChange={(e) => set({ rooms_requested: e.target.value })} /></div>
                            <div className="space-y-1"><Label>{t("simulator.guests", "Huéspedes")}</Label><Input type="number" min="1" value={form.party_size} onChange={(e) => set({ party_size: e.target.value })} /></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1"><Label>{t("simulator.visitDate", "Fecha de visita")}</Label><Input type="date" value={form.selected_date} onChange={(e) => set({ selected_date: e.target.value })} /></div>
                            <div className="space-y-1"><Label>{t("simulator.people", "Personas")}</Label><Input type="number" min="1" value={form.party_size} onChange={(e) => set({ party_size: e.target.value })} /></div>
                        </div>
                    )}

                    {/* Ages per person (drives the age-group matrix and promotions) */}
                    <div className="space-y-1">
                        <Label>{t("simulator.ages", "Edades de las personas")}</Label>
                        <div className="flex flex-wrap gap-2">
                            {form.ages.map((age, i) => (
                                <div key={i} className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">{i + 1}</span>
                                    <Input
                                        type="number" min="0" className="w-16 h-8"
                                        placeholder={t("simulator.age", "Edad")}
                                        value={age}
                                        onChange={(e) => setForm((f) => { const ages = [...f.ages]; ages[i] = e.target.value; return { ...f, ages }; })}
                                    />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">{t("simulator.agesHint", "Opcional. Si no se indica una edad, se usa la tarifa base / todas las edades.")}</p>
                    </div>

                    <Button className="w-full bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={handleSimulate} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}
                        {t("simulator.simulate", "Simular precio")}
                    </Button>
                </CardContent>
            </Card>

            {result && (
                <Card className="glass-surface">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                            <span>{t("simulator.result", "Resultado")}</span>
                            <AvailabilityBadge availability={result.availability} t={t} />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {result.booking_type === "ROUTE" ? (
                            <>
                                {result.stops?.map((stop, i) => (
                                    <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-sm">{stop.experience_id}</span>
                                            <div className="flex items-center gap-2">
                                                <AvailabilityBadge availability={stop.availability} t={t} />
                                                <span className="font-mono text-sm">{money(stop.total_price, stop.currency)}</span>
                                            </div>
                                        </div>
                                        <PricingDetail pricing={stop.pricing} currency={stop.currency} t={t} />
                                    </div>
                                ))}
                                {result.mixed_currencies ? (
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold">{t("simulator.totalsMixed", "Totales por moneda (paquete multi-establecimiento)")}</p>
                                        {Object.entries(result.totals_by_currency || {}).map(([cur, val]) => (
                                            <p key={cur} className="font-mono text-lg">{money(val, cur)}</p>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between pt-2 border-t border-border">
                                        <span className="font-semibold">{t("simulator.total", "Total")}</span>
                                        <span className="font-mono text-xl font-bold">{money(result.total_price, result.currency)}</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {result.booking_type === "HOTEL" && (
                                    <p className="text-sm text-muted-foreground">
                                        {result.nights} {t("simulator.nights", "noche(s)")} × {result.rooms} {t("simulator.rooms", "habitación(es)")}
                                        {result.pricing?.price_per_night != null ? ` · ${money(result.pricing.price_per_night, result.currency)}/${t("simulator.night", "noche")}` : ""}
                                    </p>
                                )}
                                <PricingDetail pricing={result.pricing} currency={result.currency} t={t} />
                                <div className="flex items-center justify-between pt-2 border-t border-border">
                                    <span className="font-semibold">{t("simulator.total", "Total")}</span>
                                    <span className="font-mono text-xl font-bold">{money(result.total_price, result.currency)}</span>
                                </div>
                            </>
                        )}
                        {result.deposit > 0 && (
                            <p className="text-sm text-muted-foreground">
                                {t("simulator.deposit", "Seña sugerida")}: <span className="font-mono">{money(result.deposit, result.currency || (result.totals_by_currency && Object.keys(result.totals_by_currency)[0]))}</span>
                            </p>
                        )}
                        <p className="text-[11px] text-muted-foreground">{t("simulator.previewOnly", "Simulación de precio — no crea tickets reales.")}</p>
                    </CardContent>
                </Card>
            )}
        </motion.div>
    );
}
