import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFrappeDoc, useFrappeList } from "@/lib/useApiData";
import DetailPageLayout from "@/components/DetailPageLayout";
import { apiRequest, unwrapFrappeMethodData } from "@/api/client";
import { useHotelAccess } from "@/lib/useHotelAccess";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Calendar, Clock, MapPin, Users, Wallet, Ticket, XCircle, CreditCard, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Package reservation detail (mockup): Itinerario table + consolidated payment
 * on the left; contact/package info, state-driven actions and system info on
 * the right. "Ver depósitos" / "Ver tickets" open those lists filtered to this
 * reservation.
 */

const STATUS_CONFIG = {
    PENDING: { label: "Pendiente", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800", dot: "bg-amber-500" },
    PARTIALLY_CONFIRMED: { label: "Parcial", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800", dot: "bg-blue-500" },
    CONFIRMED: { label: "Confirmado", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500" },
    CANCELLED: { label: "Cancelado", badge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800", dot: "bg-gray-400" },
    EXPIRED: { label: "Expirado", badge: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700", dot: "bg-gray-400" },
};

const STOP_DOT = {
    PENDING: "bg-amber-500", CONFIRMED: "bg-emerald-500", CHECKED_IN: "bg-emerald-500",
    COMPLETED: "bg-purple-500", CANCELLED: "bg-gray-400", EXPIRED: "bg-gray-400",
    REJECTED: "bg-red-500", NO_SHOW: "bg-red-500",
};

const fmt = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

export default function BookingDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { isAdmin, userCompanies } = useHotelAccess();
    const [confirming, setConfirming] = useState(false);

    const { data: booking, isLoading: isBookingLoading } = useFrappeDoc("Cheese Route Booking", id, {
        enabled: !!id,
    });

    const { data: routeSummary, isLoading: routeSummaryLoading } = useQuery({
        queryKey: ["route-summary", booking?.name],
        enabled: !!booking?.name,
        queryFn: async () => {
            const res = await apiRequest("/api/method/cheese.api.v1.route_booking_controller.get_route_summary", {
                method: "POST",
                body: JSON.stringify({ route_booking_id: booking.name }),
            });
            return unwrapFrappeMethodData(res, {});
        },
    });

    const status = booking?.status || "PENDING";
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
    const itinerary = routeSummary?.itinerary || [];
    const ps = routeSummary?.payment_summary || {};
    const confirmedStops = itinerary.filter((it) => ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(it.status)).length;
    const pendingTicketIds = itinerary.filter((it) => it.status === "PENDING").map((it) => it.ticket_id);
    const establishments = [...new Set(itinerary.map((it) => it.establishment).filter(Boolean))];
    const progressPct = ps.grand_total ? Math.round(((ps.total_paid || 0) / ps.grand_total) * 100) : 0;
    const senaTotal = ps.total_advance_required || 0;
    const senaPaid = ps.total_advance_paid || 0;
    const remTotal = (ps.grand_total || 0) - senaTotal;
    const remPaid = Math.max((ps.total_paid || 0) - senaPaid, 0);

    const bookingTicketIds = React.useMemo(
        () => (booking?.tickets || []).map((row) => row.ticket).filter(Boolean),
        [booking?.tickets]
    );
    const { data: bookingTickets = [] } = useFrappeList("Cheese Ticket", {
        enabled: bookingTicketIds.length > 0,
        filters: { name: ["in", bookingTicketIds] },
        fields: ["name", "company"],
        pageSize: 200,
    });
    const hasScopedAccess = React.useMemo(() => {
        if (isAdmin) return true;
        const companies = new Set(Array.isArray(userCompanies) ? userCompanies : []);
        if (companies.size === 0) return false;
        const ticketRows = Array.isArray(bookingTickets) ? bookingTickets : [];
        if (ticketRows.length === 0) return false;
        return ticketRows.some((row) => companies.has(row.company));
    }, [isAdmin, userCompanies, bookingTickets]);

    const refreshAll = () => {
        queryClient.invalidateQueries({ queryKey: ["route-summary", booking?.name] });
        queryClient.invalidateQueries({ queryKey: ["frappe-doc"] });
    };

    // Confirm every pending stop, one confirm_ticket call per ticket.
    const handleConfirmStops = async () => {
        if (!pendingTicketIds.length) return;
        if (!window.confirm(t("bookings.confirmStopsConfirm", "¿Confirmar las {{n}} paradas pendientes?", { n: pendingTicketIds.length }))) return;
        setConfirming(true);
        let ok = 0;
        const failures = [];
        for (const ticketId of pendingTicketIds) {
            try {
                await apiRequest("/api/method/cheese.api.v1.ticket_controller.confirm_ticket", {
                    method: "POST",
                    body: JSON.stringify({ ticket_id: ticketId }),
                });
                ok += 1;
            } catch (err) {
                failures.push(`${ticketId}: ${err?.message || "error"}`);
            }
        }
        if (failures.length) {
            toast.error(t("bookings.confirmStopsPartial", "{{ok}} paradas confirmadas, {{fail}} fallaron", { ok, fail: failures.length }) + ` — ${failures[0]}`);
        } else {
            toast.success(t("bookings.confirmStopsOk", "{{n}} paradas confirmadas", { n: ok }));
        }
        refreshAll();
        setConfirming(false);
    };

    const handleCancel = () => {
        if (!window.confirm(t("bookings.cancelConfirm", "Cancel this booking? This cannot be undone."))) return;
        apiRequest("/api/method/cheese.api.v1.route_booking_controller.cancel_route_booking", {
            method: "POST",
            body: JSON.stringify({ route_booking_id: booking.name }),
        }).then(() => {
            toast.success(t("bookings.cancelSuccess", "Booking cancelled"));
            refreshAll();
        }).catch((err) => toast.error(err?.message || t("bookings.cancelError", "Failed to cancel booking")));
    };

    if (!isBookingLoading && booking && !hasScopedAccess) {
        return (
            <DetailPageLayout
                title={t("common.accessDenied", "Access denied")}
                subtitle={t("common.noPermission", "You don't have permission to view this booking.")}
                backPath="/cheese/bookings"
                isLoading={false}
            >
                <div className="p-6 text-sm text-muted-foreground">
                    {t("common.noPermission", "You don't have permission to view this booking.")}
                </div>
            </DetailPageLayout>
        );
    }

    const statusText = status === "PARTIALLY_CONFIRMED"
        ? `${t("status.PARTIALLY_CONFIRMED", "Parcial")} (${confirmedStops}/${itinerary.length})`
        : t(`status.${status}`, config.label);

    return (
        <DetailPageLayout
            title={booking?.name || t("bookings.loading", "Loading Booking...")}
            subtitle={`${booking?.contact || ""}${booking?.route ? ` · ${booking.route}` : ""}`}
            backPath="/cheese/bookings"
            isLoading={isBookingLoading}
            statusBadge={
                <span className="inline-flex items-center gap-2">
                    <Badge variant="outline" className={config.badge}>{statusText}</Badge>
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
                        {t("tickets.typePackage", "Paquete")}
                    </Badge>
                </span>
            }
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">

                    {/* ─── Itinerario (mockup) ─── */}
                    <Card className="border-border/60 shadow-sm overflow-hidden">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center justify-between">
                                <span className="flex items-center"><MapPin className="w-4 h-4 mr-2" /> {t("routes.itinerary", "Itinerario")}</span>
                                <span className="normal-case font-normal text-xs">
                                    {t("bookings.stopsConfirmed", "{{c}} de {{n}} paradas confirmadas", { c: confirmedStops, n: itinerary.length })}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {routeSummaryLoading ? (
                                <div className="p-6 space-y-3">
                                    {[1, 2].map((i) => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                                <th className="text-left px-4 py-3 font-semibold">#</th>
                                                <th className="text-left px-4 py-3 font-semibold">{t("bookings.stop", "Parada")}</th>
                                                <th className="text-left px-4 py-3 font-semibold">{t("tickets.establishment", "Establecimiento")}</th>
                                                <th className="text-left px-4 py-3 font-semibold">{t("common.date", "Fecha")}</th>
                                                <th className="text-left px-4 py-3 font-semibold">{t("bookings.group", "Grupo")}</th>
                                                <th className="text-left px-4 py-3 font-semibold">{t("common.status", "Estado")}</th>
                                                <th className="text-right px-4 py-3 font-semibold">{t("common.total", "Total")}</th>
                                                <th className="px-4 py-3" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {itinerary.map((it, idx) => (
                                                <tr key={it.ticket_id} className="hover:bg-muted/10 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex w-6 h-6 rounded-full bg-cheese-500/15 text-cheese-700 dark:text-cheese-400 items-center justify-center text-xs font-bold">
                                                            {idx + 1}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-medium">
                                                        <button className="text-left hover:text-cheese-600 transition-colors" onClick={() => navigate(`/cheese/experiences/${it.experience_id}`)}>
                                                            {it.experience_name || it.experience_id}
                                                        </button>
                                                        {it.time && <span className="block text-xs text-muted-foreground">{it.time.substring(0, 5)}</span>}
                                                    </td>
                                                    <td className="px-4 py-3">{it.establishment || "—"}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap">{it.date}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap">{it.party_size} pax</td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                                                            <span className={`w-2 h-2 rounded-full ${STOP_DOT[it.status] || "bg-gray-400"}`} />
                                                            {t(`status.${it.status}`, it.status)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums font-mono">{fmt(it.total_per_ticket)}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button className="text-xs text-cheese-700 dark:text-cheese-400 hover:underline underline-offset-2" onClick={() => navigate(`/cheese/tickets/${it.ticket_id}`)}>
                                                            {t("bookings.viewTicket", "Ver ticket")}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {itinerary.length === 0 && (
                                                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">{t("bookings.noItinerary", "No itinerary found.")}</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* ─── Pago consolidado (mockup) ─── */}
                    <Card className="border-border/60 shadow-sm overflow-hidden">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center justify-between">
                                <span className="flex items-center"><CreditCard className="w-4 h-4 mr-2" /> {t("bookings.consolidatedPayment", "Pago consolidado")}</span>
                                <span className="normal-case font-normal text-xs">{t("bookings.progress", "avance {{pc}}%", { pc: progressPct })}</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {!routeSummaryLoading && (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                                    <th className="text-left px-4 py-3 font-semibold">{t("tickets.concept", "Concepto")}</th>
                                                    <th className="text-right px-4 py-3 font-semibold">{t("common.total", "Total")}</th>
                                                    <th className="text-right px-4 py-3 font-semibold">{t("tickets.paid", "Pagado")}</th>
                                                    <th className="text-right px-4 py-3 font-semibold">{t("tickets.pending", "Pendiente")}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/50">
                                                <tr className="hover:bg-muted/10">
                                                    <td className="px-4 py-2.5">{t("bookings.advances", "Señas")}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums font-mono">{fmt(senaTotal)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-emerald-600">{fmt(senaPaid)}</td>
                                                    <td className={`px-4 py-2.5 text-right tabular-nums font-mono ${senaTotal - senaPaid > 0 ? "text-red-600" : ""}`}>{fmt(Math.max(senaTotal - senaPaid, 0))}</td>
                                                </tr>
                                                <tr className="hover:bg-muted/10">
                                                    <td className="px-4 py-2.5">{t("bookings.remainders", "Remanentes")}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums font-mono">{fmt(remTotal)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-emerald-600">{fmt(remPaid)}</td>
                                                    <td className={`px-4 py-2.5 text-right tabular-nums font-mono ${remTotal - remPaid > 0 ? "text-red-600" : ""}`}>{fmt(Math.max(remTotal - remPaid, 0))}</td>
                                                </tr>
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-muted/30 font-bold">
                                                    <td className="px-4 py-3">{t("common.total", "Total")}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums font-mono">{fmt(ps.grand_total)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums font-mono text-emerald-600">{fmt(ps.total_paid)}</td>
                                                    <td className={`px-4 py-3 text-right tabular-nums font-mono ${ps.total_pending > 0 ? "text-red-600" : ""}`}>{fmt(ps.total_pending)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                    <div className="px-4 py-3">
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                            <div className="h-2 rounded-full bg-cheese-500 transition-all" style={{ width: `${Math.min(progressPct, 100)}%` }} />
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ─── Right Sidebar (mockup) ─── */}
                <div className="space-y-6">
                    {/* Contacto y paquete */}
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">{t("bookings.contactAndPackage", "Contacto y paquete")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div>
                                <p className="text-xs text-muted-foreground">{t("common.contact", "Contacto")}</p>
                                <button className="text-sm font-medium hover:text-cheese-600" onClick={() => booking?.contact && navigate(`/cheese/contacts/${booking.contact}`)}>{booking?.contact || "—"}</button>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">{t("routes.route", "Paquete")}</p>
                                <button className="text-sm font-medium hover:text-cheese-600" onClick={() => booking?.route && navigate(`/cheese/routes/${booking.route}`)}>{booking?.route || t("bookings.customRoute", "Paquete Personalizado")}</button>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">{t("bookings.establishmentsCount", "Establecimientos ({{n}})", { n: establishments.length })}</p>
                                <p className="text-sm font-medium">{establishments.length ? establishments.join(" · ") : "—"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Acciones */}
                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">{t("bookings.actions", "Acciones")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                {(status === "PENDING" || status === "PARTIALLY_CONFIRMED") && pendingTicketIds.length > 0 && (
                                    <Button size="sm" className="justify-start w-full bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={handleConfirmStops} disabled={confirming}>
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        {confirming ? t("common.saving", "Guardando...") : t("bookings.confirmPendingStops", "Confirmar paradas pendientes")}
                                    </Button>
                                )}
                                {ps.total_pending > 0 && status !== "CANCELLED" && (
                                    <Button size="sm" className="justify-start w-full bg-cheese-500 hover:bg-cheese-600 text-black font-semibold"
                                        onClick={() => navigate(`/cheese/deposits/new?entity_type=${encodeURIComponent("Cheese Route Booking")}&entity_id=${encodeURIComponent(booking?.name || "")}`)}>
                                        <CreditCard className="w-4 h-4 mr-2" /> {t("bookings.registerPayment", "Registrar pago")}
                                    </Button>
                                )}
                                <p className="text-[10px] uppercase font-semibold text-muted-foreground pt-1">{t("tickets.moreActions", "Más acciones")}</p>
                                <Button variant="outline" size="sm" className="justify-start w-full" onClick={() => navigate(`/cheese/deposits?booking=${encodeURIComponent(booking?.name || "")}`)}>
                                    <Wallet className="w-4 h-4 mr-2" /> {t("bookings.viewDeposits", "Ver depósitos")}
                                </Button>
                                <Button variant="outline" size="sm" className="justify-start w-full" onClick={() => navigate(`/cheese/tickets?booking=${encodeURIComponent(booking?.name || "")}`)}>
                                    <Ticket className="w-4 h-4 mr-2" /> {t("bookings.viewTickets", "Ver tickets")}
                                </Button>
                                <Button variant="outline" size="sm" className="justify-start w-full" onClick={() => booking?.contact && navigate(`/cheese/contacts/${booking.contact}`)}>
                                    <Users className="w-4 h-4 mr-2" /> {t("tickets.viewContact", "Ver Contacto")}
                                </Button>
                                {status !== "CANCELLED" && status !== "EXPIRED" && (
                                    <>
                                        <div className="border-t border-border/60 my-1" />
                                        <Button variant="outline" size="sm" className="justify-start w-full text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={handleCancel}>
                                            <XCircle className="w-4 h-4 mr-2" /> {t("bookings.cancelBooking", "Cancelar reserva")}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Información */}
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">{t("bookings.systemInfo", "Información")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {t("bookings.expiresOn", "Expira el")}</p>
                                <p className="text-sm font-medium">{booking?.expires_at ? new Date(booking.expires_at).toLocaleString() : "—"}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> {t("bookings.createdOn", "Creado")}</p>
                                <p className="text-sm font-medium">{booking?.creation ? new Date(booking.creation).toLocaleString() : "—"}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DetailPageLayout>
    );
}
