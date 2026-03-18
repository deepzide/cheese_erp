import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Ticket } from "lucide-react";
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

    useEffect(() => {
        setRouteId(initialValues.route || "");
    }, [initialValues.route]);

    const handleSubmit = async () => {
        if (!ticketId || !initialValues.contact || !routeId) {
            toast.error("Ticket, contact, and route are required");
            return;
        }

        try {
            const res = await apiRequest(
                "/api/method/cheese.api.v1.route_booking_controller.create_route_reservation",
                {
                method: "POST",
                body: JSON.stringify({
                    contact_id: initialValues.contact,
                    route_id: routeId,
                    party_size: initialValues.party_size,
                    experiences_with_slots: [
                    {
                        experience_id: ticket.experience,
                        slot_id: ticket.slot,
                    },
                    ],
                    conversation_id: ticket.conversation,
                }),
                }
            );

            const payload = res?.data?.message || res?.data || res;
            const bookingId =
                payload?.data?.route_booking_id || payload?.route_booking_id;

            toast.success("Route reservation created");
            if (bookingId) {
                navigate(`/cheese/bookings?highlight=${bookingId}`);
            } else {
                navigate("/cheese/bookings");
            }
        } catch (err) {
            toast.error(err?.message || "Failed to create reservation");
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
            isSubmitting={false}
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
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground mb-1">
                            Route for this reservation
                        </p>
                        <FrappeSearchSelect
                            doctype="Cheese Route"
                            label="route_info"
                            value={routeId}
                            onChange={(v) => setRouteId(v)}
                            placeholder="Select a route..."
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Required. Pre-filled from the ticket if a route was set.
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

