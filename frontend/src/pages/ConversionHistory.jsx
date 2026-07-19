import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { History, RefreshCw, Ticket, Route as RouteIcon, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
import { currencyService } from "@/api/currencyService";
import { useHotelAccess } from "@/lib/useHotelAccess";

const PAGE_SIZE = 20;

const TRIGGER_META = {
    TICKET_PRICING: { label: "Precio de ticket", icon: Ticket, cls: "bg-cheese-500/15 text-cheese-700" },
    ROUTE_BOOKING_PRICING: { label: "Precio de reserva de ruta", icon: RouteIcon, cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
    DEPOSIT_PAYMENT: { label: "Pago de depósito", icon: Wallet, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

export default function ConversionHistory() {
    const { t } = useTranslation();
    const { isAdmin } = useHotelAccess();
    const { activeEstablishment: company } = useActiveEstablishment();
    const [trigger, setTrigger] = useState("all");
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchLogs = async (targetPage = 1) => {
        setLoading(true);
        try {
            const res = await currencyService.listConversionLogs({
                page: targetPage,
                page_size: PAGE_SIZE,
                company: isAdmin ? (company || undefined) : undefined,
                trigger: trigger === "all" ? undefined : trigger,
            });
            const payload = res?.data?.message || res?.data || {};
            setLogs(Array.isArray(payload?.data) ? payload.data : []);
            setTotalPages(payload?.meta?.total_pages || 1);
            setPage(targetPage);
        } catch (err) {
            toast.error(err?.message || t("conversionHistory.loadError", "Error al cargar el historial"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [company, trigger]);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <History className="w-6 h-6 text-cheese-600" />
                        {t("conversionHistory.title", "Historial de Conversiones")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("conversionHistory.description", "Cada conversión de moneda que el sistema realiza automáticamente (precios de tickets, reservas de ruta y pagos de depósitos) queda registrada aquí con su tasa y fecha.")}
                    </p>
                </div>
                <Button variant="outline" size="icon" onClick={() => fetchLogs(page)} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="w-full sm:w-56 space-y-1">
                    <Label className="text-xs">{t("conversionHistory.trigger", "Origen")}</Label>
                    <select
                        value={trigger}
                        onChange={(e) => setTrigger(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                    >
                        <option value="all">{t("conversionHistory.allTriggers", "Todos los orígenes")}</option>
                        <option value="TICKET_PRICING">{TRIGGER_META.TICKET_PRICING.label}</option>
                        <option value="ROUTE_BOOKING_PRICING">{TRIGGER_META.ROUTE_BOOKING_PRICING.label}</option>
                        <option value="DEPOSIT_PAYMENT">{TRIGGER_META.DEPOSIT_PAYMENT.label}</option>
                    </select>
                </div>
            </div>

            <div className="space-y-2">
                {loading && logs.length === 0 ? (
                    [1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)
                ) : logs.length === 0 ? (
                    <Card className="glass-surface">
                        <CardContent className="py-16 text-center">
                            <History className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                            <p className="text-muted-foreground">{t("conversionHistory.empty", "Aún no se registraron conversiones automáticas.")}</p>
                        </CardContent>
                    </Card>
                ) : (
                    logs.map((log) => {
                        const meta = TRIGGER_META[log.trigger] || { label: log.trigger, icon: History, cls: "" };
                        const Icon = meta.icon;
                        return (
                            <Card key={log.log_id} className="glass-surface">
                                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                                    <Badge className={`${meta.cls} gap-1.5 shrink-0`}>
                                        <Icon className="w-3 h-3" /> {meta.label}
                                    </Badge>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold">
                                            {log.original_amount?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {log.from_currency}
                                            {" → "}
                                            {log.converted_amount?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {log.to_currency}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {t("conversionHistory.rate", "Tasa")} {log.exchange_rate?.toFixed(6)} · {log.rate_date}
                                            {log.reference_name ? ` · ${log.reference_doctype}: ${log.reference_name}` : ""}
                                            {log.company ? ` · ${log.company}` : ""}
                                        </p>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground shrink-0">
                                        {new Date(log.created_at).toLocaleString()}
                                    </span>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                    <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => fetchLogs(page - 1)}>
                        {t("common.previous", "Anterior")}
                    </Button>
                    <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => fetchLogs(page + 1)}>
                        {t("common.next", "Siguiente")}
                    </Button>
                </div>
            )}
        </motion.div>
    );
}
