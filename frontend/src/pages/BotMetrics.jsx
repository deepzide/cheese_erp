import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    BarChart3, RefreshCw, Loader2, Timer, Gauge, DollarSign, Hash,
    AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { botMetricsService } from "@/api/botMetricsService";
import { unwrapFrappeMethodData } from "@/api/client";
import { useHotelAccess } from "@/lib/useHotelAccess";

const PERIODS = [7, 30, 90];

const fmtMs = (ms) => {
    if (ms === null || ms === undefined) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
    return `${Math.round(ms)} ms`;
};

const fmtInt = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("es-UY"));

const fmtUsd = (n) => {
    if (n === null || n === undefined) return "—";
    const v = Number(n);
    return `US$ ${v >= 1 ? v.toFixed(2) : v.toFixed(4)}`;
};

function SummaryCard({ icon: Icon, label, value, sub }) {
    return (
        <Card className="glass-surface">
            <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-cheese-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{label}</p>
                        <p className="text-xl font-bold text-foreground">{value}</p>
                        {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function BreakdownTable({ title, description, rows, labelKey, labelHeader, t }) {
    return (
        <Card className="glass-surface">
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>
                {(!rows || rows.length === 0) ? (
                    <p className="text-sm text-muted-foreground py-2">
                        {t("botMetrics.noData", "Sin datos en este período.")}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                    <th className="py-2 pr-3 font-medium">{labelHeader}</th>
                                    <th className="py-2 px-3 font-medium text-right">{t("botMetrics.colRequests", "Solicitudes")}</th>
                                    <th className="py-2 px-3 font-medium text-right">{t("botMetrics.colMttft", "MTTFT")}</th>
                                    <th className="py-2 px-3 font-medium text-right">{t("botMetrics.colP95", "TTFT p95")}</th>
                                    <th className="py-2 px-3 font-medium text-right">{t("botMetrics.colTokensIn", "Tokens ent.")}</th>
                                    <th className="py-2 px-3 font-medium text-right">{t("botMetrics.colTokensOut", "Tokens sal.")}</th>
                                    <th className="py-2 pl-3 font-medium text-right">{t("botMetrics.colCost", "Costo")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r[labelKey]} className="border-b border-border/50 last:border-0">
                                        <td className="py-2 pr-3 font-medium text-foreground whitespace-nowrap">{r[labelKey]}</td>
                                        <td className="py-2 px-3 text-right">{fmtInt(r.requests)}</td>
                                        <td className="py-2 px-3 text-right">{fmtMs(r.mttft_ms)}</td>
                                        <td className="py-2 px-3 text-right">{fmtMs(r.ttft_p95_ms)}</td>
                                        <td className="py-2 px-3 text-right">{fmtInt(r.input_tokens)}</td>
                                        <td className="py-2 px-3 text-right">{fmtInt(r.output_tokens)}</td>
                                        <td className="py-2 pl-3 text-right whitespace-nowrap">{fmtUsd(r.cost_usd)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function BotMetrics() {
    const { t } = useTranslation();
    const { isAdmin, isLoading: accessLoading } = useHotelAccess();

    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(7);
    const [report, setReport] = useState(null);

    const fetchMetrics = async (selectedDays) => {
        setLoading(true);
        try {
            const res = await botMetricsService.getMetrics(selectedDays);
            const data = unwrapFrappeMethodData(res, null);
            if (data && data.totals) {
                setReport(data);
            } else {
                setReport(null);
                const errMsg = res?.data?.message?.message;
                if (errMsg) toast.error(errMsg);
            }
        } catch (err) {
            setReport(null);
            toast.error(err?.message || t("botMetrics.loadError", "No se pudieron obtener las métricas del bot"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) fetchMetrics(days);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, days]);

    if (accessLoading) return null;
    if (!isAdmin) return <Navigate to="/cheese/dashboard" replace />;

    const totals = report?.totals;
    const hasData = Boolean(totals && totals.requests > 0);
    const partialCost = hasData && totals.cost_known_requests < totals.requests;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-5xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-cheese-600" />
                        {t("botMetrics.title", "Métricas del Bot (IA)")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("botMetrics.description", "Latencia al primer token (TTFT), consumo de tokens y costo en USD de cada solicitud del bot al modelo de IA.")}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {PERIODS.map((p) => (
                        <Button
                            key={p}
                            variant={days === p ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDays(p)}
                            disabled={loading}
                        >
                            {t("botMetrics.periodDays", "{{count}} días", { count: p })}
                        </Button>
                    ))}
                    <Button variant="outline" size="icon" onClick={() => fetchMetrics(days)} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    {t("botMetrics.loading", "Consultando métricas del bot...")}
                </div>
            ) : !hasData ? (
                <Card className="glass-surface">
                    <CardContent className="py-10 text-center space-y-2">
                        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50" />
                        <p className="text-sm font-medium text-foreground">
                            {t("botMetrics.emptyTitle", "Aún no hay métricas registradas")}
                        </p>
                        <p className="text-xs text-muted-foreground max-w-md mx-auto">
                            {t("botMetrics.emptyHint", "El bot registra cada solicitud al modelo de IA desde que se activó el monitoreo. Las métricas aparecerán aquí con las próximas conversaciones.")}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <SummaryCard
                            icon={Timer}
                            label={t("botMetrics.cardMttft", "MTTFT (mediana al primer token)")}
                            value={fmtMs(totals.mttft_ms)}
                            sub={t("botMetrics.cardP95Sub", "p95: {{value}}", { value: fmtMs(totals.ttft_p95_ms) })}
                        />
                        <SummaryCard
                            icon={Gauge}
                            label={t("botMetrics.cardLatency", "Latencia promedio por solicitud")}
                            value={fmtMs(totals.avg_total_ms)}
                            sub={t("botMetrics.cardRequestsSub", "{{req}} solicitudes · {{int}} interacciones", { req: fmtInt(totals.requests), int: fmtInt(totals.interactions) })}
                        />
                        <SummaryCard
                            icon={Hash}
                            label={t("botMetrics.cardTokens", "Tokens (entrada / salida)")}
                            value={`${fmtInt(totals.input_tokens)} / ${fmtInt(totals.output_tokens)}`}
                            sub={t("botMetrics.cardCacheSub", "Caché: {{value}}", { value: fmtInt(totals.cache_read_tokens) })}
                        />
                        <SummaryCard
                            icon={DollarSign}
                            label={t("botMetrics.cardCost", "Costo del período")}
                            value={fmtUsd(totals.cost_usd)}
                            sub={totals.errors > 0 ? t("botMetrics.cardErrorsSub", "{{count}} solicitudes con error", { count: totals.errors }) : undefined}
                        />
                    </div>

                    {partialCost && (
                        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                {t("botMetrics.partialCostWarning", "El costo se calculó sobre {{known}} de {{total}} solicitudes: algunos modelos aún no tienen precio publicado y se registran sin costo (los tokens sí se contabilizan).", { known: fmtInt(totals.cost_known_requests), total: fmtInt(totals.requests) })}
                            </span>
                        </div>
                    )}

                    <BreakdownTable
                        title={t("botMetrics.byDayTitle", "Por día")}
                        rows={report.by_day}
                        labelKey="date"
                        labelHeader={t("botMetrics.colDate", "Fecha")}
                        t={t}
                    />
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <BreakdownTable
                            title={t("botMetrics.byModelTitle", "Por modelo")}
                            rows={report.by_model}
                            labelKey="model"
                            labelHeader={t("botMetrics.colModel", "Modelo")}
                            t={t}
                        />
                        <BreakdownTable
                            title={t("botMetrics.byAgentTitle", "Por agente")}
                            description={t("botMetrics.byAgentDescription", "Incluye el agente conversacional y los sub-agentes internos (fechas, resúmenes, traducción, OCR, etc.).")}
                            rows={report.by_agent}
                            labelKey="agent"
                            labelHeader={t("botMetrics.colAgent", "Agente")}
                            t={t}
                        />
                    </div>
                    <BreakdownTable
                        title={t("botMetrics.byChannelTitle", "Por canal")}
                        rows={report.by_channel}
                        labelKey="channel"
                        labelHeader={t("botMetrics.colChannel", "Canal")}
                        t={t}
                    />
                </>
            )}
        </motion.div>
    );
}
