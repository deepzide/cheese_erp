import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFrappeDoc } from "@/lib/useApiData";
import DetailPageLayout from "@/components/DetailPageLayout";
import { apiRequest } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Calendar, Clock, MapPin, ShoppingCart, Users, Wallet, Shield, Ticket,
    XCircle, DollarSign, CreditCard, CheckCircle, AlertCircle
} from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG = {
    PENDING: { label: "Pending", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800" },
    PARTIALLY_CONFIRMED: { label: "Partial", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
    CONFIRMED: { label: "Confirmed", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
    CANCELLED: { label: "Cancelled", badge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
};

const DEPOSIT_STATUS_BADGE = {
    PAID: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
    PENDING: "bg-yellow-500/15 text-yellow-700 border-yellow-200",
    OVERDUE: "bg-red-500/15 text-red-700 border-red-200",
    NONE: "bg-gray-500/15 text-gray-600 border-gray-200",
};

const fmt = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

export default function BookingDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

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
            return res?.data?.data || {};
        },
    });

    const status = booking?.status || "PENDING";
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
    const itinerary = routeSummary?.itinerary || [];
    const ps = routeSummary?.payment_summary || {};

    return (
        <DetailPageLayout
            title={booking?.name || "Loading Booking..."}
            subtitle={`Route booking • ${id}`}
            backPath="/cheese/bookings"
            isLoading={isBookingLoading}
            statusBadge={<Badge variant="outline" className={config.badge}>{config.label}</Badge>}
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">

                    {/* ─── General Details Table ─── */}
                    <Card className="border-border/60 shadow-sm overflow-hidden">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <Ticket className="w-4 h-4 mr-2" /> General Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {routeSummaryLoading ? (
                                <div className="p-6 space-y-3">
                                    {[1, 2].map(i => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                                <th className="text-left px-4 py-3 font-semibold">Experience</th>
                                                <th className="text-left px-4 py-3 font-semibold">Ticket ID</th>
                                                <th className="text-right px-4 py-3 font-semibold">Unit Cost</th>
                                                <th className="text-center px-4 py-3 font-semibold">Party Size</th>
                                                <th className="text-right px-4 py-3 font-semibold">Total</th>
                                                <th className="text-right px-4 py-3 font-semibold">Advance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {itinerary.map((it) => (
                                                <tr key={it.ticket_id} className="hover:bg-muted/10 transition-colors">
                                                    <td className="px-4 py-3 font-medium">
                                                        <button
                                                            className="text-left hover:text-cheese-600 transition-colors"
                                                            onClick={() => navigate(`/cheese/experiences/${it.experience_id}`)}
                                                        >
                                                            {it.experience_name || it.experience_id}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <button
                                                            className="text-xs font-mono text-muted-foreground hover:text-cheese-600 transition-colors"
                                                            onClick={() => navigate(`/cheese/tickets/${it.ticket_id}`)}
                                                        >
                                                            {it.ticket_id}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{fmt(it.unit_cost)}</td>
                                                    <td className="px-4 py-3 text-center">{it.party_size || 1}</td>
                                                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmt(it.total_per_ticket)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{fmt(it.deposit_amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-muted/20 font-semibold">
                                                <td className="px-4 py-3" colSpan={4}>Total</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{fmt(ps.grand_total)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{fmt(ps.total_advance_required)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* ─── Payment Information ─── */}
                    <Card className="border-border/60 shadow-sm overflow-hidden">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <DollarSign className="w-4 h-4 mr-2" /> Payment Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {!routeSummaryLoading && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                                <th className="text-left px-4 py-3 font-semibold">Concept</th>
                                                <th className="text-right px-4 py-3 font-semibold">Total</th>
                                                <th className="text-right px-4 py-3 font-semibold">Paid</th>
                                                <th className="text-right px-4 py-3 font-semibold">Pending</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {/* Advance per experience */}
                                            {itinerary.map((it) => {
                                                const advancePaid = Math.min(it.deposit_paid || 0, it.deposit_amount || 0);
                                                const advancePending = (it.deposit_amount || 0) - advancePaid;
                                                return (
                                                    <tr key={`adv-${it.ticket_id}`} className="hover:bg-muted/10">
                                                        <td className="px-4 py-2.5">
                                                            <span className="text-muted-foreground">Advance —</span> {it.experience_name}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(it.deposit_amount)}</td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmt(advancePaid)}</td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmt(advancePending)}</td>
                                                    </tr>
                                                );
                                            })}
                                            {/* Advance subtotal */}
                                            <tr className="bg-muted/10 font-medium">
                                                <td className="px-4 py-2.5">Señas (Advances)</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(ps.total_advance_required)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmt(ps.total_advance_paid)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmt(ps.advance_pending)}</td>
                                            </tr>
                                            {/* Remaining per experience */}
                                            {itinerary.map((it) => {
                                                const remainingTotal = (it.total_per_ticket || 0) - (it.deposit_amount || 0);
                                                const remainingPaid = Math.max((it.deposit_paid || 0) - (it.deposit_amount || 0), 0);
                                                const remainingPending = remainingTotal - remainingPaid;
                                                return (
                                                    <tr key={`rem-${it.ticket_id}`} className="hover:bg-muted/10">
                                                        <td className="px-4 py-2.5">
                                                            <span className="text-muted-foreground">Remaining —</span> {it.experience_name}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(remainingTotal)}</td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmt(remainingPaid)}</td>
                                                        <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmt(remainingPending)}</td>
                                                    </tr>
                                                );
                                            })}
                                            {/* Remaining subtotal */}
                                            <tr className="bg-muted/10 font-medium">
                                                <td className="px-4 py-2.5">Remanentes</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">
                                                    {fmt((ps.grand_total || 0) - (ps.total_advance_required || 0))}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">
                                                    {fmt(Math.max((ps.total_paid || 0) - (ps.total_advance_paid || 0), 0))}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-red-600">
                                                    {fmt((ps.grand_total || 0) - (ps.total_advance_required || 0) - Math.max((ps.total_paid || 0) - (ps.total_advance_paid || 0), 0))}
                                                </td>
                                            </tr>
                                        </tbody>
                                        {/* Grand total */}
                                        <tfoot>
                                            <tr className="bg-muted/30 font-bold text-base">
                                                <td className="px-4 py-3">Total</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{fmt(ps.grand_total)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{fmt(ps.total_paid)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums text-red-600">{fmt(ps.total_pending)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* ─── Booking Card (Summary) ─── */}
                    <Card className="border-border/60 shadow-sm overflow-hidden">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <CreditCard className="w-4 h-4 mr-2" /> Booking Card
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {!routeSummaryLoading && (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                            <th className="text-left px-4 py-3 font-semibold">Concept</th>
                                            <th className="text-right px-4 py-3 font-semibold">Paid</th>
                                            <th className="text-right px-4 py-3 font-semibold">Pending</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        <tr className="hover:bg-muted/10">
                                            <td className="px-4 py-3 flex items-center gap-2">
                                                <Wallet className="w-4 h-4 text-cheese-600" /> Advance Payment
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600">
                                                {fmt(ps.total_advance_paid)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">
                                                {fmt(ps.advance_pending)}
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-muted/10">
                                            <td className="px-4 py-3 flex items-center gap-2">
                                                <DollarSign className="w-4 h-4 text-cheese-600" /> Remaining Balance
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600">
                                                {fmt(Math.max((ps.total_paid || 0) - (ps.total_advance_paid || 0), 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">
                                                {fmt((ps.grand_total || 0) - (ps.total_advance_required || 0) - Math.max((ps.total_paid || 0) - (ps.total_advance_paid || 0), 0))}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            )}
                        </CardContent>
                    </Card>

                    {/* ─── Itinerary ─── */}
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <Calendar className="w-4 h-4 mr-2" /> Itinerary
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {routeSummaryLoading ? (
                                <div className="p-6 space-y-2">
                                    {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />)}
                                </div>
                            ) : itinerary.length > 0 ? (
                                <div className="divide-y divide-border/50">
                                    {itinerary.map((it) => (
                                        <div
                                            key={it.ticket_id}
                                            className="p-4 flex items-center justify-between gap-4 hover:bg-muted/10 cursor-pointer transition-colors"
                                            onClick={() => navigate(`/cheese/tickets/${it.ticket_id}`)}
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{it.experience_name}</p>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {it.date}</span>
                                                    {it.time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {it.time}</span>}
                                                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {it.party_size}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Badge variant="outline" className={DEPOSIT_STATUS_BADGE[it.deposit_status] || DEPOSIT_STATUS_BADGE.NONE}>
                                                    {it.deposit_status || "—"}
                                                </Badge>
                                                <Badge variant="outline" className="text-xs">{it.status}</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-muted-foreground text-sm">No itinerary found.</div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ─── Right Sidebar ─── */}
                <div className="space-y-6">
                    {/* Info */}
                    <Card className="border-border/60 shadow-sm">
                        <CardContent className="p-6 space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Contact</p>
                                    <button className="text-sm font-medium hover:text-cheese-600" onClick={() => booking?.contact && navigate(`/cheese/contacts/${booking.contact}`)}>{booking?.contact || "—"}</button>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Route</p>
                                    <button className="text-sm font-medium hover:text-cheese-600" onClick={() => booking?.route && navigate(`/cheese/routes/${booking.route}`)}>{booking?.route || "—"}</button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Quick Actions */}
                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2">
                                <ShoppingCart className="w-4 h-4" /> Quick Actions
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate(`/cheese/deposits?entity_id=${encodeURIComponent(booking?.name || "")}`)}>
                                    <Wallet className="w-4 h-4 mr-2" /> Deposits
                                </Button>
                                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate(`/cheese/tickets?booking=${encodeURIComponent(booking?.name || "")}`)}>
                                    <Ticket className="w-4 h-4 mr-2" /> Tickets
                                </Button>
                                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate(`/cheese/support/new?contact=${encodeURIComponent(booking?.contact || "")}&booking=${encodeURIComponent(booking?.name || "")}`)}>
                                    <Shield className="w-4 h-4 mr-2" /> Support Case
                                </Button>
                                {(status === "PENDING" || status === "CONFIRMED" || status === "PARTIALLY_CONFIRMED") && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="justify-start"
                                        onClick={() => {
                                            if (window.confirm("Cancel this booking? This cannot be undone.")) {
                                                apiRequest("/api/method/cheese.api.v1.route_booking_controller.cancel_route_booking", {
                                                    method: "POST",
                                                    body: JSON.stringify({ route_booking_id: booking.name }),
                                                }).then(() => {
                                                    toast.success("Booking cancelled");
                                                    queryClient.invalidateQueries(["frappe-doc"]);
                                                }).catch((err) => toast.error(err?.message || "Failed to cancel booking"));
                                            }
                                        }}
                                    >
                                        <XCircle className="w-4 h-4 mr-2" /> Cancel Booking
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {booking?.expires_at && (
                        <Card className="border-border/60 shadow-sm">
                            <CardContent className="p-6 space-y-2">
                                <p className="text-xs text-muted-foreground flex items-center gap-2">
                                    <Clock className="w-3 h-3" /> Expires At
                                </p>
                                <p className="text-sm font-medium">
                                    {new Date(booking.expires_at).toLocaleString()}
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </DetailPageLayout>
    );
}
