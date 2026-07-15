import React, { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Ticket, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import CreatePageLayout from "@/components/CreatePageLayout";
import { useFrappeDoc } from "@/lib/useApiData";
import { apiRequest } from "@/api/client";

export default function BookingCreate() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const ticketId = searchParams.get("ticket") || "";

    const { data: ticket, isLoading } = useFrappeDoc("Cheese Ticket", ticketId, {
        enabled: !!ticketId,
    });

    const initialValues = useMemo(
        () => ({
            contact: ticket?.contact || "",
            party_size: ticket?.party_size || 1,
        }),
        [ticket]
    );

    const [submitting, setSubmitting] = useState(false);

    const selectedDate = ticket?.selected_date || "";

    const handleSubmit = async () => {
        if (!ticketId || !initialValues.contact) {
            toast.error(t("bookings.ticketContactRequired", "Ticket and contact are required"));
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
                    }),
                }
            );

            const payload = res?.data?.message || res?.data || res;
            if (payload?.success === false) {
                throw new Error(payload?.error?.message || payload?.message || t("bookings.convertFailed", "Failed to convert ticket"));
            }

            const alreadyConfirmed = payload?.message?.data?.already_confirmed || payload?.data?.already_confirmed;
            toast.success(alreadyConfirmed
                ? t("bookings.ticketAlreadyConfirmed", "Ticket was already confirmed")
                : t("bookings.ticketConfirmed", "Ticket confirmed as single-experience reservation"));
            navigate(`/cheese/tickets/${encodeURIComponent(ticketId)}`);
        } catch (err) {
            toast.error(err?.message || t("bookings.createFailed", "Failed to create reservation"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <CreatePageLayout
            title={t("bookings.convertTitle", "Confirm Ticket")}
            description={
                ticketId
                    ? `${t("bookings.convertDesc", "Confirm ticket as a single-experience reservation:")} ${ticketId}`
                    : t("bookings.missingTicket", "Missing ticket ID in URL")
            }
            icon={Ticket}
            backPath={ticketId ? `/cheese/tickets/${ticketId}` : "/cheese/tickets"}
            onSubmit={handleSubmit}
            isSubmitting={submitting}
            submitLabel={t("bookings.confirmTicket", "Confirm Ticket")}
            isLoading={isLoading && !!ticketId}
        >
            {ticketId ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">{t("nav.tickets", "Ticket")}</p>
                            <p className="text-sm font-mono">{ticketId}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">{t("routes.experiences", "Experience")}</p>
                            <p className="text-sm font-medium">
                                {ticket?.experience || "—"}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">{t("calendar.slot", "Slot")}</p>
                            <p className="text-sm font-medium">{ticket?.slot || "—"}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">{t("tickets.partySize", "Party Size")}</p>
                            <p className="text-sm font-medium">
                                {initialValues.party_size || 1}
                            </p>
                        </div>
                        {selectedDate && (
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <CalendarDays className="w-3 h-3" /> {t("calendar.selectedDate", "Selected Date")}
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

                    <p className="text-xs text-muted-foreground">
                        {t("bookings.conversionNote", "This action confirms the ticket as a single-experience reservation. It does not create a route reservation — use \"New Route Reservation\" on the Reservations page for that.")}
                    </p>
                </div>
            ) : (
                <p className="text-sm text-red-500">
                    {t("bookings.noTicketSpecified", "No ticket specified. Please go back to the ticket and use Convert to Booking again.")}
                </p>
            )}
        </CreatePageLayout>
    );
}
