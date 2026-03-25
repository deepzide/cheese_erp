import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFrappeDoc } from "@/lib/useApiData";
import DetailPageLayout from "@/components/DetailPageLayout";
import { apiRequest } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, ShoppingCart, Users, Wallet, Shield, Ticket, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG = {
    PENDING: { label: "Pending", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
    PARTIALLY_CONFIRMED: { label: "Partial", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
    CONFIRMED: { label: "Confirmed", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    CANCELLED: { label: "Cancelled", badge: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

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
                    <Card className="border-border/60 shadow-sm">
                        <CardContent className="p-6 space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Total Price</p>
                                    <p className="text-lg font-bold">
                                        ${Number(booking?.total_price || routeSummary?.total_price || 0).toLocaleString()}
                                    </p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-xs text-muted-foreground">Deposit Required</p>
                                    <p className="text-sm font-medium">
                                        {booking?.deposit_required ? "Yes" : "No"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Deposit: ${Number(booking?.deposit_amount || 0).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                                        <Users className="w-3 h-3" /> Contact
                                    </p>
                                    <p className="text-sm font-medium">{booking?.contact || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                                        <MapPin className="w-3 h-3" /> Route
                                    </p>
                                    <p className="text-sm font-medium">{booking?.route || "—"}</p>
                                </div>
                            </div>

                            <div className="pt-2">
                                <p className="text-xs text-muted-foreground mb-3">Itinerary (date & time)</p>
                                {routeSummaryLoading ? (
                                    <div className="space-y-2">
                                        {Array.from({ length: 3 }).map((_, i) => (
                                            <div key={i} className="h-12 bg-muted/20 rounded-md" />
                                        ))}
                                    </div>
                                ) : itinerary.length > 0 ? (
                                    <div className="divide-y divide-border/50 rounded-lg border border-border/60 overflow-hidden">
                                        {itinerary.map((it) => (
                                            <div
                                                key={it.ticket_id || `${it.experience_id}-${it.date}-${it.time}`}
                                                className="p-4 flex items-start justify-between gap-4 hover:bg-muted/10"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium truncate">
                                                        {it.experience_name || it.experience_id || "—"}
                                                    </p>
                                                    <div className="mt-1 space-y-1">
                                                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                                                            <Calendar className="w-3 h-3" />
                                                            <span>{it.date || "—"}</span>
                                                            <span className="text-muted-foreground/70">•</span>
                                                            <span>{it.time || "—"}</span>
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            Status: {it.status || "—"} • Party: {it.party_size || 1}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="shrink-0">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => navigate(`/cheese/experiences/${it.experience_id}`)}
                                                    >
                                                        View Experience
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No itinerary found.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="border-border/60 shadow-sm">
                        <CardContent className="p-6 space-y-3">
                            <p className="text-sm font-semibold flex items-center gap-2">
                                <ShoppingCart className="w-4 h-4 text-cheese-600" /> Quick Actions
                            </p>

                            <div className="flex flex-col gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => booking?.contact && navigate(`/cheese/contacts/${booking.contact}`)}
                                    disabled={!booking?.contact}
                                >
                                    <Users className="w-4 h-4 mr-2" /> Contact
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => booking?.route && navigate(`/cheese/routes/${booking.route}`)}
                                    disabled={!booking?.route}
                                >
                                    <MapPin className="w-4 h-4 mr-2" /> Route
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => navigate(`/cheese/deposits?entity_id=${encodeURIComponent(booking?.name || "")}`)}
                                    disabled={!booking?.name}
                                >
                                    <Wallet className="w-4 h-4 mr-2" /> Deposits
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => navigate(`/cheese/support/new?contact=${encodeURIComponent(booking?.contact || "")}&booking=${encodeURIComponent(booking?.name || "")}`)}
                                    disabled={!booking?.contact}
                                >
                                    <Shield className="w-4 h-4 mr-2" /> Support Case
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => navigate(`/cheese/tickets?booking=${encodeURIComponent(booking?.name || "")}`)}
                                    disabled={!booking?.name}
                                >
                                    <Ticket className="w-4 h-4 mr-2" /> Tickets
                                </Button>
                                {(status === "PENDING" || status === "CONFIRMED" || status === "PARTIALLY_CONFIRMED") && (
                                    <Button
                                        type="button"
                                        variant="destructive"
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

                    {booking?.expires_at ? (
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
                    ) : null}
                </div>
            </div>
        </DetailPageLayout>
    );
}

