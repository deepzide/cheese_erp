import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Search, Filter, AlertCircle, RefreshCw, Plus, Download } from "lucide-react";
import { apiRequest } from "@/api/client";

/**
 * Reservas (package reservations) — mockup list: search + status filter +
 * "hide cancelled" chip + export, and a table with Código | Contacto | Paquete
 * | Paradas | Estado | Total | Pendiente. Row click opens the detail.
 */

const STATUS_CONFIG = {
    PENDING: { label: "Pendiente", dot: "bg-amber-500" },
    PARTIALLY_CONFIRMED: { label: "Parcial", dot: "bg-blue-500" },
    CONFIRMED: { label: "Confirmado", dot: "bg-emerald-500" },
    CANCELLED: { label: "Cancelado", dot: "bg-gray-400" },
    EXPIRED: { label: "Expirado", dot: "bg-gray-400" },
};

const fmt = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

export default function Bookings() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [hideCancelled, setHideCancelled] = useState(false);

    const { data: bookingsRaw, isLoading, error, refetch } = useQuery({
        queryKey: ["route-bookings-list"],
        queryFn: async () => {
            const res = await apiRequest("/api/method/cheese.api.v1.route_booking_controller.list_route_bookings", {
                method: "POST",
                body: JSON.stringify({ page: 1, page_size: 200 }),
            });
            const payload = res?.data?.message || res?.data || {};
            return payload?.data || [];
        },
    });
    const bookings = Array.isArray(bookingsRaw) ? bookingsRaw : [];

    const filtered = useMemo(() => bookings.filter((b) => {
        if (hideCancelled && (b.status === "CANCELLED" || b.status === "EXPIRED")) return false;
        if (filterStatus !== "all" && b.status !== filterStatus) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const hay = `${b.booking_id} ${b.contact || ""} ${b.route || ""} ${(b.establishments || []).join(" ")}`.toLowerCase();
            if (!hay.includes(term)) return false;
        }
        return true;
    }), [bookings, hideCancelled, filterStatus, searchTerm]);

    const statusLabel = (b) => {
        const cfg = STATUS_CONFIG[b.status] || { label: b.status, dot: "bg-gray-400" };
        if (b.status === "PARTIALLY_CONFIRMED") {
            return `${t("status.PARTIALLY_CONFIRMED", cfg.label)} (${b.confirmed_stops}/${b.stops})`;
        }
        return t(`status.${b.status}`, cfg.label);
    };

    const exportCsv = () => {
        const header = ["Codigo", "Contacto", "Paquete", "Establecimientos", "Paradas", "Estado", "Total", "Pendiente"];
        const lines = filtered.map((b) => [
            b.booking_id, b.contact || "", b.route || "", (b.establishments || []).join(" · "),
            b.stops, statusLabel(b), b.total_price || 0, b.pending || 0,
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "reservas_paquetes.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("bookings.loadFailed", "Failed to load bookings data")}</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <ShoppingCart className="w-6 h-6 text-cheese-600" /> {t("bookings.title", "Reservas")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isLoading ? "..." : t("bookings.countPackages", "{{n}} reservas de paquete", { n: filtered.length })}
                    </p>
                </div>
                <Button className="h-9 bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={() => navigate("/cheese/bookings/new-route")}>
                    <Plus className="w-4 h-4 mr-1.5" /> {t("bookings.newRouteBooking", "Nueva Reserva de Paquete")}
                </Button>
            </div>

            {/* Toolbar (mockup) */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder={t("bookings.searchPlaceholder", "Buscar reserva, contacto, paquete…")}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 w-60 h-9"
                    />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-44 h-9">
                        <Filter className="w-3 h-3 mr-1 text-muted-foreground" />
                        <SelectValue placeholder={t("common.allStatus", "Todos los estados")} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("common.allStatus", "Todos los estados")}</SelectItem>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{t(`status.${k}`, v.label)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <button
                    type="button"
                    onClick={() => setHideCancelled((v) => !v)}
                    className={`h-9 px-3 rounded-md border text-xs font-medium transition-colors ${hideCancelled
                        ? "border-cheese-500 bg-cheese-500/10 text-cheese-700 dark:text-cheese-400"
                        : "border-border text-muted-foreground hover:bg-muted/50"}`}
                >
                    {t("bookings.hideCancelled", "Ocultar canceladas")}
                </button>
                <span className="flex-1" />
                <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={filtered.length === 0}>
                    <Download className="w-3.5 h-3.5 mr-1.5" /> {t("common.export", "Exportar")}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>

            {/* Table (mockup) */}
            {isLoading ? (
                <Card className="border border-border"><CardContent className="p-4 space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </CardContent></Card>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <ShoppingCart className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground">{t("bookings.emptyPackages", "Sin reservas de paquete con estos filtros")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("bookings.emptyHint", "Ajustá los filtros o quitá \"ocultar canceladas\" para ver más.")}</p>
                </div>
            ) : (
                <Card className="border-border/60 shadow-sm overflow-hidden">
                    <div className="flex items-center px-4 py-3 border-b border-border bg-muted/20">
                        <span className="text-[13px] font-bold">{t("bookings.tableCount", "{{n}} reservas de paquete", { n: filtered.length })}</span>
                        <span className="flex-1" />
                        <span className="text-xs text-muted-foreground">{t("bookings.clickRow", "clic en una fila para abrir")}</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                    <th className="text-left px-4 py-3 font-semibold">{t("bookings.code", "Código")}</th>
                                    <th className="text-left px-4 py-3 font-semibold">{t("common.contact", "Contacto")}</th>
                                    <th className="text-left px-4 py-3 font-semibold">{t("routes.route", "Paquete")}</th>
                                    <th className="text-right px-4 py-3 font-semibold">{t("bookings.stops", "Paradas")}</th>
                                    <th className="text-left px-4 py-3 font-semibold">{t("common.status", "Estado")}</th>
                                    <th className="text-right px-4 py-3 font-semibold">{t("common.total", "Total")}</th>
                                    <th className="text-right px-4 py-3 font-semibold">{t("tickets.pending", "Pendiente")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filtered.map((b) => {
                                    const cfg = STATUS_CONFIG[b.status] || { dot: "bg-gray-400" };
                                    return (
                                        <tr
                                            key={b.booking_id}
                                            className="hover:bg-muted/10 cursor-pointer transition-colors"
                                            onClick={() => navigate(`/cheese/bookings/${b.booking_id}`)}
                                        >
                                            <td className="px-4 py-3 font-mono text-xs">{b.booking_id}</td>
                                            <td className="px-4 py-3 font-medium">{b.contact || "—"}</td>
                                            <td className="px-4 py-3">
                                                {b.route || t("bookings.customRoute", "Paquete Personalizado")}
                                                {(b.establishments || []).length > 0 && (
                                                    <span className="block text-xs text-muted-foreground">
                                                        {b.establishments.length} {t("bookings.establishmentsShort", "establec.")} · {b.establishments.join(" · ")}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums">{b.stops}</td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                                                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                                                    {statusLabel(b)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums font-mono">{fmt(b.total_price)}</td>
                                            <td className={`px-4 py-3 text-right tabular-nums font-mono ${b.pending > 0 ? "text-red-600 font-semibold" : ""}`}>
                                                {fmt(b.pending)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </motion.div>
    );
}
