import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Route, CalendarDays, Clock } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { routeService } from "@/api/routeService";
import { bookingService } from "@/api/bookingService";
import { extractData } from "@/lib/useApiData";

export default function RouteBookingCreate() {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [form, setForm] = useState({
        contact: "",
        route: "",
        party_size: "1",
        date_from: "",
        date_to: "",
        time_from: "",
        time_to: "",
        notes: "",
    });
    const [submitting, setSubmitting] = useState(false);

    const todayStr = new Date().toISOString().slice(0, 10);

    // Show which experiences the selected route includes
    const { data: routeExperiences } = useQuery({
        queryKey: ["route-experiences", form.route],
        queryFn: async () => {
            const res = await routeService.getExperiencesByRoute(form.route);
            return extractData(res)?.experience_ids || [];
        },
        enabled: !!form.route,
        staleTime: 30000,
    });

    const handleSubmit = async () => {
        if (!form.contact || !form.route) {
            toast.error(t("bookings.routeContactRequired", "Contact and route are required"));
            return;
        }
        if (!form.date_from) {
            toast.error(t("bookings.dateRequired", "Date is required"));
            return;
        }
        if (form.date_from < todayStr) {
            toast.error(t("tickets.pastDatesError", "Past dates are not allowed"));
            return;
        }
        if (form.date_to && form.date_to < form.date_from) {
            toast.error(t("bookings.dateToBeforeFrom", "End date must be on or after the start date"));
            return;
        }

        setSubmitting(true);
        try {
            const res = await bookingService.createRouteReservation({
                contact_id: form.contact,
                route_id: form.route,
                party_size: parseInt(form.party_size) || 1,
                date_from: form.date_from,
                date_to: form.date_to || undefined,
                time_from: form.time_from || undefined,
                time_to: form.time_to || undefined,
                notes: form.notes?.trim() || undefined,
            });

            const payload = res?.data?.message || res?.data || res;
            if (payload?.success === false) {
                throw new Error(payload?.error?.message || payload?.message || t("bookings.createFailed", "Failed to create reservation"));
            }

            const bookingId = payload?.data?.route_booking_id;
            toast.success(t("bookings.routeBookingCreated", "Route reservation created"));
            navigate(bookingId ? `/cheese/bookings/${encodeURIComponent(bookingId)}` : "/cheese/bookings");
        } catch (err) {
            toast.error(err?.message || t("bookings.createFailed", "Failed to create reservation"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <CreatePageLayout
            title={t("bookings.newRouteBooking", "New Route Reservation")}
            description={t("bookings.newRouteBookingDesc", "Book every experience of a route for a guest on a single date; slots are selected automatically.")}
            icon={Route}
            backPath="/cheese/bookings"
            onSubmit={handleSubmit}
            isSubmitting={submitting}
            submitLabel={t("bookings.createRouteReservation", "Create Route Reservation")}
        >
            <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("tickets.contact", "Contact")} <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Contact"
                            label="full_name"
                            value={form.contact}
                            onChange={(v) => setForm(f => ({ ...f, contact: v }))}
                            placeholder={t("tickets.selectContact", "Select a contact...")}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t("routes.route", "Route")} <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Route"
                            label="short_description"
                            value={form.route}
                            onChange={(v) => setForm(f => ({ ...f, route: v }))}
                            filters={{ status: "ONLINE" }}
                            placeholder={t("tickets.selectRoute", "Select a route...")}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t("tickets.partySize", "Party Size")}</Label>
                        <Input
                            type="number"
                            min="1"
                            value={form.party_size}
                            onChange={(e) => setForm(f => ({ ...f, party_size: e.target.value }))}
                        />
                    </div>
                    <div />
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                            {t("bookings.dateFrom", "Date")} <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            type="date"
                            min={todayStr}
                            value={form.date_from}
                            onChange={(e) => setForm(f => ({ ...f, date_from: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                            {t("bookings.dateFromHint", "All route activities are booked on this date.")}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                            {t("bookings.dateTo", "End Date (hotels)")}
                        </Label>
                        <Input
                            type="date"
                            min={form.date_from || todayStr}
                            value={form.date_to}
                            onChange={(e) => setForm(f => ({ ...f, date_to: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                            {t("bookings.dateToHint", "Required as check-out when the route includes a hotel (at least one night).")}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            {t("bookings.timeFrom", "Earliest Start (optional)")}
                        </Label>
                        <Input
                            type="time"
                            value={form.time_from}
                            onChange={(e) => setForm(f => ({ ...f, time_from: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            {t("bookings.timeTo", "Latest End (optional)")}
                        </Label>
                        <Input
                            type="time"
                            value={form.time_to}
                            onChange={(e) => setForm(f => ({ ...f, time_to: e.target.value }))}
                        />
                    </div>
                </div>

                {form.route && (
                    <div className="space-y-2">
                        <Label>{t("routes.experiences", "Experiences in this route")}</Label>
                        <div className="flex flex-wrap gap-2">
                            {(routeExperiences || []).length > 0 ? (
                                routeExperiences.map((exp) => (
                                    <Badge key={exp} variant="outline">{exp}</Badge>
                                ))
                            ) : (
                                <p className="text-xs text-muted-foreground">{t("common.loading", "Loading...")}</p>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t("bookings.routeBookingNote", "One ticket is created per experience. The system picks non-overlapping slots with available capacity on the chosen date; if none exist you'll get an error explaining why.")}
                        </p>
                    </div>
                )}

                <div className="space-y-2">
                    <Label>{t("tickets.notes", "Notes")}</Label>
                    <Textarea
                        rows={3}
                        value={form.notes}
                        onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder={t("tickets.notesPlaceholder", "Dietary restrictions, accessibility needs, etc.")}
                    />
                </div>
            </div>
        </CreatePageLayout>
    );
}
