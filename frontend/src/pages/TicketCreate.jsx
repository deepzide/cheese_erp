import React, { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate, useFrappeDoc, extractData } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import CompanySelect from "@/components/CompanySelect";
import { routeService } from "@/api/routeService";

export default function TicketCreate() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const { t } = useTranslation();
    const contactId = searchParams.get("contact") || "";
    const backPath = contactId ? `/cheese/contacts/${contactId}` : "/cheese/tickets";
    
    const [form, setForm] = useState({
        contact: searchParams.get("contact") || "",
        company: searchParams.get("company") || "",
        experience: searchParams.get("experience") || "",
        route: searchParams.get("route") || "",
        slot: searchParams.get("slot") || "",
        party_size: searchParams.get("party_size") || "1",
        rooms_requested: "1",
        conversation: searchParams.get("conversation") || "",
        selected_date: searchParams.get("date") || "",
        check_in_date: "",
        check_out_date: "",
        notes: "",
    });

    const createMutation = useFrappeCreate("Cheese Ticket");
    const todayStr = new Date().toISOString().slice(0, 10);

    // Fetch Experience Type
    const { data: experienceData } = useFrappeDoc("Cheese Experience", form.experience, {
        enabled: !!form.experience
    });
    const isHotel = experienceData?.experience_type === "HOTEL";

    // Cascading filter: fetch experiences for the selected route
    const { data: routeExperiences } = useQuery({
        queryKey: ["route-experiences", form.route],
        queryFn: async () => {
            const res = await routeService.getExperiencesByRoute(form.route);
            return extractData(res)?.experience_ids || [];
        },
        enabled: !!form.route,
        staleTime: 30000,
    });

    // Experience filter: restrict to route's experiences when a route is selected
    const experienceFilters = useMemo(() => {
        if (form.route && routeExperiences && routeExperiences.length > 0) {
            return { name: ["in", routeExperiences] };
        }
        return {};
    }, [form.route, routeExperiences]);

    const handleSubmit = () => {
        if (!form.contact || !form.experience || !form.slot) {
            toast.error(t("tickets.validationError", "Contact, experience, and slot are required"));
            return;
        }

        const payload = {
            contact: form.contact,
            company: form.company || undefined,
            experience: form.experience,
            route: form.route || undefined,
            slot: form.slot,
            status: "PENDING",
            conversation: form.conversation || undefined,
            notes: form.notes?.trim() || undefined,
        };

        if (isHotel) {
            if (!form.check_in_date || !form.check_out_date) {
                toast.error(t("hotelReservations.datesRequired", "Check-in and check-out dates are required for hotels"));
                return;
            }
            if (form.check_in_date < todayStr) {
                toast.error(t("hotelReservations.checkInPastError", "Check-in date cannot be in the past"));
                return;
            }
            if (form.check_out_date <= form.check_in_date) {
                toast.error(t("hotelReservations.checkOutBeforeCheckInError", "Check-out date must be after check-in date"));
                return;
            }
            payload.rooms_requested = parseInt(form.rooms_requested) || 1;
            payload.check_in_date = form.check_in_date;
            payload.check_out_date = form.check_out_date;
            // Provide party_size default to bypass frappe mandatory field check, though logic relies on rooms_requested
            payload.party_size = 1;
        } else {
            if (form.selected_date && form.selected_date < todayStr) {
                toast.error(t("tickets.pastDatesError", "Past dates are not allowed"));
                return;
            }
            payload.party_size = parseInt(form.party_size) || 1;
            payload.selected_date = form.selected_date || undefined;
        }

        createMutation.mutate(payload, {
            onSuccess: () => { 
                toast.success(t("tickets.createSuccess", "Ticket created")); 
                queryClient.invalidateQueries({ queryKey: ['ticket-board'] }); 
                navigate("/cheese/tickets"); 
            },
            onError: (err) => toast.error(err?.message || t("tickets.createError", "Failed to create ticket")),
        });
    };

    return (
        <CreatePageLayout
            title={t("tickets.newTicket", "New Ticket")}
            description={t("tickets.newTicketDesc", "Create a pending ticket for a guest")}
            icon={Ticket}
            backPath={backPath}
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("tickets.createTicket", "Create Ticket")}
        >
            <div className="space-y-5">
                {/* Contact & Company */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("common.contact", "Contact")} <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Contact"
                            label="full_name"
                            value={form.contact}
                            onChange={(v) => setForm(f => ({ ...f, contact: v }))}
                            placeholder={t("tickets.selectContact", "Select a contact...")}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t("common.company", "Company")}</Label>
                        <CompanySelect
                            value={form.company}
                            onChange={(v) => setForm(f => ({ ...f, company: v }))}
                            placeholder={t("tickets.selectCompany", "Select company...")}
                        />
                    </div>
                </div>

                {/* Route & Experience (cascading) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("tickets.route", "Route")}</Label>
                        <FrappeSearchSelect
                            doctype="Cheese Route"
                            label="short_description"
                            value={form.route}
                            onChange={(v) => setForm(f => ({ ...f, route: v, experience: "", slot: "" }))}
                            placeholder={t("tickets.selectRoute", "Select a route...")}
                        />
                        <p className="text-xs text-muted-foreground">{t("tickets.routeFilterInfo", "Selecting a route filters the experiences below")}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>{t("tickets.experience", "Experience")} <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Experience"
                            label="name"
                            value={form.experience}
                            onChange={(v) => setForm(f => ({ ...f, experience: v, slot: "" }))}
                            placeholder={form.route ? t("tickets.selectFromRouteExp", "Select from route experiences...") : t("tickets.selectExperience", "Select an experience...")}
                            filters={experienceFilters}
                        />
                    </div>
                </div>

                {/* Date Selection */}
                {isHotel ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-2">
                        <div className="space-y-2">
                            <Label>{t("hotelReservations.checkInDate", "Check-in Date")} <span className="text-red-500">*</span></Label>
                            <Input
                                type="date"
                                min={todayStr}
                                value={form.check_in_date}
                                onChange={(e) => setForm(f => ({ ...f, check_in_date: e.target.value, slot: "" }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("hotelReservations.checkOutDate", "Check-out Date")} <span className="text-red-500">*</span></Label>
                            <Input
                                type="date"
                                min={form.check_in_date || todayStr}
                                value={form.check_out_date}
                                onChange={(e) => setForm(f => ({ ...f, check_out_date: e.target.value }))}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-2">
                        <div className="space-y-2">
                            <Label>{t("tickets.selectedDate", "Selected Date")}</Label>
                            <Input
                                type="date"
                                min={todayStr}
                                value={form.selected_date}
                                onChange={(e) => setForm(f => ({ ...f, selected_date: e.target.value, slot: "" }))}
                            />
                            <p className="text-xs text-muted-foreground">{t("tickets.onlyFutureDates", "Only today or future dates are allowed")}</p>
                        </div>
                    </div>
                )}

                {/* Slot & Size */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("tickets.slot", "Slot")} <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Experience Slot"
                            label="name"
                            value={form.slot}
                            onChange={(v) => setForm(f => ({ ...f, slot: v }))}
                            placeholder={t("tickets.selectSlot", "Select a slot...")}
                            filters={form.experience ? {
                                experience: form.experience,
                                date_from: ["<=", isHotel ? (form.check_in_date || todayStr) : (form.selected_date || todayStr)],
                                date_to: [">=", isHotel ? (form.check_in_date || todayStr) : (form.selected_date || todayStr)],
                            } : {}}
                        />
                        {isHotel && <p className="text-xs text-muted-foreground">{t("hotelReservations.selectSlotInfo", "Select the slot corresponding to the first night.")}</p>}
                    </div>
                    {isHotel ? (
                        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                            <Label>{t("hotelReservations.roomsRequested", "Rooms Requested")} <span className="text-red-500">*</span></Label>
                            <Input type="number" min="1" max="50" value={form.rooms_requested} onChange={(e) => setForm(f => ({ ...f, rooms_requested: e.target.value }))} />
                            <p className="text-xs text-muted-foreground">{t("hotelReservations.numberOfRooms", "Number of rooms")}</p>
                        </div>
                    ) : (
                        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                            <Label>{t("hotelReservations.partySize", "Party Size")} <span className="text-red-500">*</span></Label>
                            <Input type="number" min="1" max="50" value={form.party_size} onChange={(e) => setForm(f => ({ ...f, party_size: e.target.value }))} />
                            <p className="text-xs text-muted-foreground">{t("hotelReservations.numberOfGuests", "Number of guests")}</p>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label>{t("tickets.guestNotes", "Guest notes")}</Label>
                    <Textarea
                        value={form.notes}
                        onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder={t("tickets.guestNotesPlaceholder", "Dietary, accessibility, or other requirements...")}
                        className="min-h-[80px]"
                    />
                </div>

            </div>
        </CreatePageLayout>
    );
}
