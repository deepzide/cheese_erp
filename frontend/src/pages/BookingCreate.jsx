import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Ticket, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useFrappeDoc } from "@/lib/useApiData";
import { apiRequest } from "@/api/client";

export default function BookingCreate() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const ticketId = searchParams.get("ticket") || "";

    const { data: ticket, isLoading } = useFrappeDoc("Cheese Ticket", ticketId, {
        enabled: !!ticketId,
    });

    const initialValues = useMemo(
        () => ({
            contact: ticket?.contact || "",
            route: ticket?.route || "",
            party_size: ticket?.party_size || 1,
        }),
        [ticket]
    );

    const [routeId, setRouteId] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setRouteId(initialValues.route || "");
    }, [initialValues.route]);

    const selectedDate = ticket?.selected_date || "";

    const handleSubmit = async () => {
        if (!ticketId || !initialValues.contact) {
            toast.error("Ticket and contact are required");
            return;
        }

        setSubmitting(true);
        try {
            const res = await apiRequest(
                "/api/method/cheese.api.v1.ticket_controller.convert_ticket_to_booking",
                {
                    method: "POST",
                    body: JSON.stringify({
                        ticket_id: ticketId,
                        route_id: routeId || undefined,
                    }),
                }
            );

            const payload = res?.data?.message || res?.data || res;
            if (payload?.success === false) {
                throw new Error(payload?.error?.message || payload?.message || "Failed to convert ticket");
            }

            const bookingId = payload?.data?.route_booking_id;

            if (routeId && bookingId) {
                toast.success("Route reservation created");
                navigate(`/cheese/bookings?highlight=${bookingId}`);
            } else {
                toast.success("Ticket confirmed as reservation");
                navigate(`/cheese/tickets/${encodeURIComponent(ticketId)}`);
            }
        } catch (err) {
            toast.error(err?.message || "Failed to create reservation");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <CreatePageLayout
            title="Convert Ticket to Reservation"
            description={
                ticketId
                    ? `Create a route reservation from ticket ${ticketId}`
                    : "Missing ticket ID in URL"
            }
            icon={Ticket}
            backPath={ticketId ? `/cheese/tickets/${ticketId}` : "/cheese/tickets"}
            onSubmit={handleSubmit}
            isSubmitting={submitting}
            submitLabel="Create Reservation"
            isLoading={isLoading && !!ticketId}
        >
            {ticketId ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Ticket</p>
                            <p className="text-sm font-mono">{ticketId}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Experience</p>
                            <p className="text-sm font-medium">
                                {ticket?.experience || "—"}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Slot</p>
                            <p className="text-sm font-medium">{ticket?.slot || "—"}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Party Size</p>
                            <p className="text-sm font-medium">
                                {initialValues.party_size || 1}
                            </p>
                        </div>
                        {selectedDate && (
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <CalendarDays className="w-3 h-3" /> Selected Date
                                </p>
                                <p className="text-sm font-semibold text-primary">
                                    {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
                                        weekday: "short",
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground mb-1">
                            Route for this reservation
                        </p>
                        <FrappeSearchSelect
                            doctype="Cheese Route"
                            label="short_description"
                            value={routeId}
                            onChange={(v) => setRouteId(v)}
                            placeholder="Select a route..."
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Optional. Leave empty to confirm as a single-experience reservation.
                        </p>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-red-500">
                    No ticket specified. Please go back to the ticket and use
                    \"Convert to Booking\" again.
                </p>
            )}
        </CreatePageLayout>
    );
}
