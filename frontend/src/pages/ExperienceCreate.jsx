import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Sparkles, ArrowLeft, Check, ChevronLeft, ChevronRight, Bot, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import { useAcceptedCurrencies } from "@/lib/useAcceptedCurrencies";
import CompanySelect from "@/components/CompanySelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const EMPTY = {
    experience_type: "ACTIVITY",
    company: "",
    experience_info: "",
    event_duration_hours: "",
    currency: "UYU",
    individual_price: "",
    route_price: "",
    price_per_night: "",
    max_occupancy_per_unit: "",
    min_nights_stay: 1,
    is_room: false,
    room_size: "",
    differentiate_by_weekday: 0,
    differentiate_by_age_group: 0,
    deposit_required: false,
    deposit_type: "%",
    deposit_value: "",
    deposit_ttl_hours: 48,
    package_mode: "Both",
    manual_confirmation: 0,
    description: "",
    includes: "",
    not_includes: "",
    schedule_info: "",
    location_info: "",
    target_audience: "",
};

function Stepper({ labels, current }) {
    return (
        <div className="flex items-center gap-0 overflow-x-auto pb-1">
            {labels.map((label, i) => (
                <React.Fragment key={label}>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${i === current ? "bg-cheese-500 text-black" : i < current ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                            {i < current ? <Check className="w-4 h-4" /> : i + 1}
                        </span>
                        <span className={`text-sm ${i === current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
                    </div>
                    {i < labels.length - 1 && <span className="mx-3 h-px w-8 bg-border shrink-0" />}
                </React.Fragment>
            ))}
        </div>
    );
}

function Pill({ active, title, desc, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`text-left flex-1 min-w-[130px] rounded-lg border px-3 py-2 transition-colors ${active ? "border-cheese-500 bg-cheese-500/10" : "border-border hover:border-cheese-400"}`}
        >
            <div className="text-sm font-medium text-foreground">{title}</div>
            {desc && <div className="text-[11px] text-muted-foreground">{desc}</div>}
        </button>
    );
}

export default function ExperienceCreate() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const createMutation = useFrappeCreate("Cheese Experience");

    const [form, setForm] = useState(EMPTY);
    const [step, setStep] = useState(0);
    const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

    const isHotel = form.experience_type === "HOTEL";
    const acceptedCurrencies = useAcceptedCurrencies(form.company);

    const labels = useMemo(() => [
        t("experiences.stepBasics", "Datos básicos"),
        t("experiences.stepPricing", "Precios y reglas"),
        t("experiences.stepContent", "Contenido y fotos"),
        t("experiences.stepReview", "Revisar"),
    ], [t]);
    const n = labels.length;

    const validateStep = () => {
        if (step === 0) {
            if (!form.company) { toast.error(t("experiences.wizPickCompany", "Elegí el establecimiento.")); return false; }
            if (!form.experience_info.trim()) { toast.error(t("experiences.wizName", "Poné un nombre para la experiencia.")); return false; }
        }
        if (step === 1) {
            if (isHotel && !form.price_per_night) { toast.error(t("experiences.wizPricePerNight", "Ingresá el precio por noche.")); return false; }
            if (!isHotel && !form.individual_price) { toast.error(t("experiences.wizPricePerPerson", "Ingresá el precio por persona.")); return false; }
        }
        return true;
    };

    const next = () => { if (validateStep()) setStep((s) => Math.min(s + 1, n - 1)); };
    const back = () => setStep((s) => Math.max(s - 1, 0));

    const submit = (status) => {
        if (!validateStep()) return;
        const hours = parseFloat(form.event_duration_hours) || 0;
        const payload = {
            name: form.experience_info,
            experience_info: form.experience_info,
            experience_type: form.experience_type,
            company: form.company,
            status,
            package_mode: form.package_mode,
            currency: form.currency || "UYU",
            differentiate_by_weekday: form.differentiate_by_weekday,
            differentiate_by_age_group: form.differentiate_by_age_group,
            individual_price: form.individual_price ? Number(form.individual_price) : 0,
            route_price: form.route_price ? Number(form.route_price) : 0,
            event_duration: hours > 0 ? Math.round(hours * 3600) : 0,
            price_per_night: form.price_per_night ? Number(form.price_per_night) : 0,
            max_occupancy_per_unit: form.max_occupancy_per_unit ? Number(form.max_occupancy_per_unit) : 0,
            min_nights_stay: form.min_nights_stay ? Number(form.min_nights_stay) : 1,
            is_room: isHotel && form.is_room ? 1 : 0,
            room_size: form.room_size ? Number(form.room_size) : 0,
            deposit_required: form.deposit_required ? 1 : 0,
            deposit_type: form.deposit_type,
            deposit_value: form.deposit_value ? Number(form.deposit_value) : 0,
            deposit_ttl_hours: form.deposit_ttl_hours ? Number(form.deposit_ttl_hours) : 48,
            manual_confirmation: form.manual_confirmation ? 1 : 0,
            description: form.description || "",
            includes: form.includes || "",
            not_includes: form.not_includes || "",
            schedule_info: form.schedule_info || "",
            location_info: form.location_info || "",
            target_audience: form.target_audience || "",
        };
        createMutation.mutate(payload, {
            onSuccess: (res) => {
                const rp = res?.message || res;
                const name = rp?.name || rp?.data?.name;
                toast.success(status === "ONLINE"
                    ? t("experiences.published2", "Experiencia publicada")
                    : t("experiences.draftSaved", "Borrador guardado"));
                navigate(name ? `/cheese/experiences/${name}` : "/cheese/experiences");
            },
            onError: (err) => toast.error(err?.message || t("experiences.createError", "No se pudo crear la experiencia")),
        });
    };

    const textArea = (field, label, hint) => (
        <div className="space-y-1.5">
            <Label>{label}{hint && <span className="text-xs text-muted-foreground ml-1">{hint}</span>}</Label>
            <textarea
                value={form[field]}
                onChange={(e) => set(field, e.target.value)}
                className="w-full min-h-[72px] p-2.5 text-sm border rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
        </div>
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate("/cheese/experiences")}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-cheese-600" />
                        {isHotel ? t("experiences.newRoom", "Nueva habitación") : t("experiences.newActivity", "Nueva actividad")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">{t("experiences.stepOf", "Paso {{i}} de {{n}}", { i: step + 1, n })}</p>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-6">
                <Stepper labels={labels} current={step} />

                {/* Step 1 — Basics */}
                {step === 0 && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>{t("experiences.type", "Tipo")}</Label>
                                <select value={form.experience_type} onChange={(e) => set("experience_type", e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                                    <option value="ACTIVITY">{t("experiences.activity", "Actividad")}</option>
                                    <option value="HOTEL">{t("nav.hotels", "Habitación (Hotel)")}</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t("experiences.providerCompany", "Establecimiento")} <span className="text-red-500">*</span></Label>
                                <CompanySelect value={form.company} onChange={(v) => set("company", v)} placeholder={t("experiences.selectProvider", "Elegir…")} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t("experiences.experienceName", "Nombre")} <span className="text-red-500">*</span> <span className="text-xs text-muted-foreground">{t("experiences.asClientSees", "como lo ve el cliente")}</span></Label>
                            <Input value={form.experience_info} onChange={(e) => set("experience_info", e.target.value)}
                                placeholder={isHotel ? t("experiences.roomNamePh", "Ej. Habitación Superior con vista") : t("experiences.namePlaceholder", "Ej. Cata premium de vinos y quesos")} />
                        </div>
                        {!isHotel && (
                            <div className="space-y-1.5 max-w-[220px]">
                                <Label>{t("experiences.durationHours", "Duración (horas)")}</Label>
                                <Input type="number" min="0" step="0.5" value={form.event_duration_hours} onChange={(e) => set("event_duration_hours", e.target.value)} placeholder="Ej. 2" />
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2 — Pricing & rules */}
                {step === 1 && (
                    <div className="space-y-5">
                        <div className="space-y-1.5 max-w-[200px]">
                            <Label>{t("experiences.currency", "Moneda")}</Label>
                            <select value={form.currency} onChange={(e) => set("currency", e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                {acceptedCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {isHotel ? (
                                <div className="space-y-1.5">
                                    <Label>{t("experiences.pricePerNight", "Precio por noche")} <span className="text-red-500">*</span></Label>
                                    <Input type="number" min="0" step="0.01" value={form.price_per_night} onChange={(e) => set("price_per_night", e.target.value)} />
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <Label>{t("experiences.pricePerPerson", "Precio por persona")} <span className="text-red-500">*</span></Label>
                                    <Input type="number" min="0" step="0.01" value={form.individual_price} onChange={(e) => set("individual_price", e.target.value)} />
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label>{t("experiences.routePrice", "Precio en ruta")} <span className="text-xs text-muted-foreground">{t("experiences.ifInPackage", "si se vende en paquete")}</span></Label>
                                <Input type="number" min="0" step="0.01" value={form.route_price} onChange={(e) => set("route_price", e.target.value)} />
                            </div>
                        </div>
                        {isHotel && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label>{t("experiences.maxOccupancy", "Ocupación máx./unidad")}</Label>
                                    <Input type="number" min="1" value={form.max_occupancy_per_unit} onChange={(e) => set("max_occupancy_per_unit", e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>{t("experiences.minNightsStay", "Mín. noches")}</Label>
                                    <Input type="number" min="1" value={form.min_nights_stay} onChange={(e) => set("min_nights_stay", e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>{t("experiences.roomSize", "Máx. huéspedes")}</Label>
                                    <Input type="number" min="1" value={form.room_size} onChange={(e) => { set("room_size", e.target.value); set("is_room", true); }} />
                                </div>
                            </div>
                        )}
                        <div className="flex gap-6 flex-wrap">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={!!form.differentiate_by_weekday} onChange={(e) => set("differentiate_by_weekday", e.target.checked ? 1 : 0)} />
                                {t("experiences.diffWeekday", "Diferenciar por día (lun-vie / fin de semana)")}
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={!!form.differentiate_by_age_group} onChange={(e) => set("differentiate_by_age_group", e.target.checked ? 1 : 0)} />
                                {t("experiences.diffAge", "Diferenciar por grupo etario")}
                            </label>
                        </div>
                        {(form.differentiate_by_weekday || form.differentiate_by_age_group) ? (
                            <p className="text-xs text-muted-foreground -mt-2">{t("experiences.matrixCreateHint", "Las líneas de precio por día/grupo etario se definen en el detalle luego de crearla.")}</p>
                        ) : null}

                        <div className="space-y-2">
                            <Label>{t("experiences.askDeposit", "¿Pide depósito / seña?")}</Label>
                            <div className="flex gap-2">
                                <Pill active={!form.deposit_required} title={t("common.no", "No")} desc={t("experiences.noDepDesc", "Se reserva sin pago previo")} onClick={() => set("deposit_required", false)} />
                                <Pill active={form.deposit_required} title={t("common.yes", "Sí")} desc={t("experiences.yesDepDesc", "Requiere seña para confirmar")} onClick={() => set("deposit_required", true)} />
                            </div>
                            {form.deposit_required && (
                                <div className="grid grid-cols-2 gap-3 pt-1 max-w-md">
                                    <div className="space-y-1.5">
                                        <Label>{t("experiences.depositType", "Tipo de seña")}</Label>
                                        <select value={form.deposit_type} onChange={(e) => set("deposit_type", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                            <option value="%">{t("experiences.percentage", "Porcentaje (%)")}</option>
                                            <option value="Amount">{t("experiences.fixedAmount", "Monto fijo")}</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>{t("experiences.depositValue", "Valor")}</Label>
                                        <Input type="number" min="0" step="0.01" value={form.deposit_value} onChange={(e) => set("deposit_value", e.target.value)} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>{t("experiences.whereSold", "¿Dónde se vende?")}</Label>
                            <div className="flex gap-2">
                                <Pill active={form.package_mode === "Establishment"} title={t("experiences.sellStandalone", "Suelta")} desc={t("experiences.sellStandaloneDesc", "Solo individual")} onClick={() => set("package_mode", "Establishment")} />
                                <Pill active={form.package_mode === "Route"} title={t("experiences.sellPackage", "En paquete")} desc={t("experiences.sellPackageDesc", "Solo dentro de rutas")} onClick={() => set("package_mode", "Route")} />
                                <Pill active={form.package_mode === "Both"} title={t("experiences.sellBoth", "Ambas")} desc={t("experiences.sellBothDesc", "Suelta y en paquete")} onClick={() => set("package_mode", "Both")} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>{t("experiences.confirmation", "Confirmación de la reserva")}</Label>
                            <div className="flex gap-2 max-w-md">
                                <Pill active={!form.manual_confirmation} title={t("experiences.confirmAuto", "Automática")} desc={t("experiences.confirmAutoDesc", "Se confirma al instante")} onClick={() => set("manual_confirmation", 0)} />
                                <Pill active={!!form.manual_confirmation} title={t("experiences.confirmManual", "Manual")} desc={t("experiences.confirmManualDesc", "Vos aprobás cada reserva")} onClick={() => set("manual_confirmation", 1)} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3 — Content & photos */}
                {step === 2 && (
                    <div className="space-y-4">
                        <div className="flex items-start gap-2 text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-lg px-3 py-2">
                            <Bot className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{t("experiences.contentBotHint", "Esta información es la que usa el bot para responder a los clientes por WhatsApp e Instagram. Cuanto más completa, mejores respuestas da. Podés completarla ahora o después.")}</span>
                        </div>
                        {textArea("description", t("experiences.clientDescription", "Descripción para el cliente"))}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {textArea("includes", t("experiences.includes", "Qué incluye"))}
                            {textArea("not_includes", t("experiences.notIncludes", "Qué NO incluye"))}
                        </div>
                        {textArea("schedule_info", t("experiences.scheduleInfo", "Horarios y duración"))}
                        {textArea("location_info", t("experiences.locationInfo", "Cómo llegar / ubicación"))}
                        {textArea("target_audience", t("experiences.targetAudience", "Para quién es"), t("experiences.targetHint", "familias, parejas, +18…"))}
                        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2">
                            <ImageIcon className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{t("experiences.photosAfterCreate", "Las fotos se agregan desde el detalle de la experiencia una vez creada (sección Fotos y documentos).")}</span>
                        </div>
                    </div>
                )}

                {/* Step 4 — Review */}
                {step === 3 && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">{t("experiences.reviewHint", "Repasá los datos. Podés publicar ahora o guardar como borrador (queda fuera de línea).")}</p>
                        <div className="rounded-lg border border-border divide-y divide-border/60 text-sm">
                            {[
                                [t("experiences.type", "Tipo"), isHotel ? t("nav.hotels", "Habitación") : t("experiences.activity", "Actividad")],
                                [t("experiences.providerCompany", "Establecimiento"), form.company],
                                [t("experiences.experienceName", "Nombre"), form.experience_info],
                                !isHotel && [t("experiences.durationHours", "Duración"), form.event_duration_hours ? `${form.event_duration_hours} h` : ""],
                                [isHotel ? t("experiences.pricePerNight", "Precio por noche") : t("experiences.pricePerPerson", "Precio por persona"), (isHotel ? form.price_per_night : form.individual_price) ? `${form.currency} ${Number(isHotel ? form.price_per_night : form.individual_price).toLocaleString("es-UY")}` : ""],
                                [t("experiences.routePrice", "En ruta"), form.route_price ? `${form.currency} ${Number(form.route_price).toLocaleString("es-UY")}` : ""],
                                [t("experiences.askDeposit", "Depósito"), form.deposit_required ? `${form.deposit_value || 0}${form.deposit_type === "%" ? "%" : ` ${form.currency}`}` : t("common.no", "No")],
                                [t("experiences.whereSold", "Dónde se vende"), { Establishment: t("experiences.sellStandalone", "Suelta"), Route: t("experiences.sellPackage", "En paquete"), Both: t("experiences.sellBoth", "Suelta y en paquete") }[form.package_mode]],
                                [t("experiences.confirmation", "Confirmación"), form.manual_confirmation ? t("experiences.confirmManual", "Manual") : t("experiences.confirmAuto", "Automática")],
                                [t("experiences.assistantContent", "Contenido del bot"), t("experiences.nOfKey", "{{n}} de 3 campos clave", { n: [form.description, form.includes, form.location_info].filter(Boolean).length })],
                            ].filter(Boolean).map(([k, v], i) => (
                                <div key={i} className="flex items-center justify-between gap-4 px-3 py-2">
                                    <span className="text-muted-foreground">{k}</span>
                                    <span className={v ? "font-medium text-foreground text-right" : "text-muted-foreground/60 italic"}>{v || t("common.empty", "Sin completar")}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer nav */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                    {step > 0 ? (
                        <Button variant="outline" onClick={back}><ChevronLeft className="w-4 h-4 mr-1" /> {t("common.back", "Atrás")}</Button>
                    ) : (
                        <Button variant="ghost" onClick={() => navigate("/cheese/experiences")}>{t("common.cancel", "Cancelar")}</Button>
                    )}
                    {step < n - 1 ? (
                        <Button className="cheese-gradient text-black font-semibold" onClick={next}>{t("common.next", "Siguiente")} <ChevronRight className="w-4 h-4 ml-1" /></Button>
                    ) : (
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => submit("OFFLINE")} disabled={createMutation.isPending}>
                                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                                {t("experiences.saveDraft", "Guardar borrador")}
                            </Button>
                            <Button className="cheese-gradient text-black font-semibold" onClick={() => submit("ONLINE")} disabled={createMutation.isPending}>
                                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                                {t("experiences.publish", "Publicar")}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
