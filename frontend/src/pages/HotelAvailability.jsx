import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CalendarDays, AlertCircle, RefreshCw, BedDouble, Plus, Check, X, Loader2, Pencil, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { hotelService } from "@/api/hotelService";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
import { ticketService } from "@/api/ticketService";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useTranslation } from "react-i18next";

const CELL_COLORS = {
    OPEN: "bg-emerald-500/20 text-emerald-700 border-emerald-500/30",
    CLOSED: "bg-red-500/20 text-red-700 border-red-500/30",
    BLOCKED: "bg-gray-500/20 text-gray-500 border-gray-500/30",
    NO_SLOT: "bg-gray-100 dark:bg-gray-900 text-gray-400 border-dashed border-gray-300 dark:border-gray-700",
};

export default function HotelAvailability() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [selectedExperience, setSelectedExperience] = useState("");
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        return d.toISOString().split("T")[0];
    });
    const [dateTo, setDateTo] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split("T")[0];
    });
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [createForm, setCreateForm] = useState({ date_from: "", date_to: "", rooms_available: 10 });

    const [showReservationDialog, setShowReservationDialog] = useState(false);
    const [resForm, setResForm] = useState({ contact: "", check_in_date: "", check_out_date: "", rooms_requested: 1, slot_id: "", notes: "" });
    const [manageNight, setManageNight] = useState(null);
    const [manageForm, setManageForm] = useState({ rooms_available: 10, status: "OPEN" });

    // Fetch all hotel experiences to choose from
    const { data: hotelsPayload } = useQuery({
        queryKey: ["hotel-experiences-list"],
        queryFn: async () => {
            const res = await hotelService.listHotels({ page: 1, page_size: 200 });
            return res?.data?.message || res?.data || {};
        },
    });

    const { activeEstablishment } = useActiveEstablishment();
    const allHotels = Array.isArray(hotelsPayload?.data) ? hotelsPayload.data : [];
    const hotels = activeEstablishment ? allHotels.filter((h) => h.name === activeEstablishment) : allHotels;

    // Fetch experiences for the selected hotel
    const { data: expPayload } = useQuery({
        queryKey: ["hotel-experiences", selectedExperience ? "all" : hotels[0]?.name],
        queryFn: async () => {
            // Fetch all hotel experiences across all hotels
            const all = [];
            for (const hotel of hotels) {
                const res = await hotelService.getHotelExperiences(hotel.name, { page_size: 100 });
                const d = res?.data?.message || res?.data || {};
                if (Array.isArray(d.data)) all.push(...d.data);
            }
            return all;
        },
        enabled: hotels.length > 0,
    });

    const experiences = Array.isArray(expPayload) ? expPayload : [];

    // Get availability for selected experience
    const { data: availPayload, isLoading, error, refetch } = useQuery({
        queryKey: ["hotel-availability", selectedExperience, dateFrom, dateTo],
        queryFn: async () => {
            const res = await hotelService.getHotelAvailability(selectedExperience, { date_from: dateFrom, date_to: dateTo });
            return res?.data?.message || res?.data || {};
        },
        enabled: !!selectedExperience,
    });

    const availability = availPayload?.data || {};
    const nights = Array.isArray(availability.nights) ? availability.nights : [];

    // Create slots mutation
    const updateSlotMutation = useMutation({
        mutationFn: ({ slotId, data }) => hotelService.updateHotelSlot(slotId, data),
        onSuccess: () => {
            setManageNight(null);
            queryClient.invalidateQueries(["hotel-availability"]);
            toast.success(t("calendar.slotUpdated", "Slot updated"));
        },
        onError: (err) => toast.error(err?.message || t("calendar.updateSlotFailed", "Failed to update slot")),
    });

    const deleteSlotMutation = useMutation({
        mutationFn: (slotId) => hotelService.deleteHotelSlot(slotId),
        onSuccess: () => {
            setManageNight(null);
            queryClient.invalidateQueries(["hotel-availability"]);
            toast.success(t("calendar.slotDeleted", "Slot deleted"));
        },
        onError: (err) => toast.error(err?.message || t("calendar.deleteSlotFailed", "Failed to delete slot")),
    });

    const createSlotsMutation = useMutation({
        mutationFn: (data) => hotelService.createHotelSlots(data),
        onSuccess: () => {
            setShowCreateDialog(false);
            queryClient.invalidateQueries(["hotel-availability"]);
            toast.success(t("hotelAvailability.slotsCreated", "Slots created successfully"));
        },
        onError: (err) => toast.error(err?.message || t("hotelAvailability.createSlotsError", "Failed to create slots")),
    });

    const handleCreateSlots = () => {
        createSlotsMutation.mutate({
            experience_id: selectedExperience,
            date_from: createForm.date_from,
            date_to: createForm.date_to,
            rooms_available: createForm.rooms_available,
        });
    };

    // Create Reservation mutation
    const createResMutation = useMutation({
        mutationFn: (data) => ticketService.createPendingTicket(data),
        onSuccess: () => {
            setShowReservationDialog(false);
            queryClient.invalidateQueries(["hotel-availability"]);
            toast.success(t("hotelAvailability.reservationCreated", "Reservation created successfully"));
        },
        onError: (err) => {
            const msg = err?.response?.data?.exception || err?.response?.data?.message || err?.message || t("hotelAvailability.createReservationError", "Failed to create reservation");
            toast.error(msg);
        }
    });

    const handleCreateReservation = () => {
        if (!resForm.contact) {
            toast.error(t("hotelAvailability.contactRequired", "Please select a contact"));
            return;
        }
        if (resForm.check_out_date <= resForm.check_in_date) {
            toast.error(t("hotelAvailability.checkoutAfterCheckin", "Check-out date must be after check-in date"));
            return;
        }
        
        createResMutation.mutate({
            contact_id: resForm.contact,
            experience_id: selectedExperience,
            slot_id: resForm.slot_id,
            check_in_date: resForm.check_in_date,
            check_out_date: resForm.check_out_date,
            rooms_requested: parseInt(resForm.rooms_requested, 10) || 1,
            party_size: 1,
            notes: resForm.notes?.trim() || undefined,
        });
    };

    const openManageDialog = (night) => {
        setManageNight(night);
        setManageForm({
            rooms_available: night.max_capacity || 10,
            status: night.status === "NO_SLOT" ? "OPEN" : (night.status || "OPEN"),
        });
    };

    const handleCellClick = (night) => {
        if (night.status === "NO_SLOT") {
            setCreateForm({ date_from: night.date, date_to: night.date, rooms_available: 10 });
            setShowCreateDialog(true);
        } else if (night.slot_id) {
            openManageDialog(night);
        } else if (night.status === "OPEN" && night.available > 0) {
            const d = new Date(night.date);
            d.setDate(d.getDate() + 1);
            const nextDay = d.toISOString().split("T")[0];
            
            setResForm({
                contact: "",
                check_in_date: night.date,
                check_out_date: nextDay,
                rooms_requested: 1,
                slot_id: night.slot_id
            });
            setShowReservationDialog(true);
        } else if (night.status === "OPEN" && night.available <= 0) {
            toast.error(t("hotelAvailability.dateFullyBooked", "This date is fully booked."));
        }
    };

    // Build calendar grid
    const weeks = useMemo(() => {
        if (!nights.length) return [];
        const result = [];
        let currentWeek = [];
        for (const night of nights) {
            const dayOfWeek = new Date(night.date).getDay();
            if (currentWeek.length === 0 && dayOfWeek > 0) {
                for (let i = 0; i < dayOfWeek; i++) currentWeek.push(null);
            }
            currentWeek.push(night);
            if (currentWeek.length === 7) {
                result.push(currentWeek);
                currentWeek = [];
            }
        }
        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) currentWeek.push(null);
            result.push(currentWeek);
        }
        return result;
    }, [nights]);

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("hotelAvailability.loadFailed", "Failed to load availability")}</h2>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}
                </Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <CalendarDays className="w-6 h-6 text-indigo-500" /> {t("hotelAvailability.title", "Hotel Availability")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{t("hotelAvailability.subtitle", "Manage nightly room availability and quick bookings")}</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <Select value={selectedExperience} onValueChange={setSelectedExperience}>
                        <SelectTrigger className="w-56 h-9">
                            <SelectValue placeholder={t("hotelAvailability.selectRoomType", "Select room type…")} />
                        </SelectTrigger>
                        <SelectContent>
                            {experiences.map((exp) => (
                                <SelectItem key={exp.name} value={exp.name}>{exp.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40" />
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40" />
                    {selectedExperience && (
                        <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => {
                            setCreateForm({ date_from: dateFrom, date_to: dateTo, rooms_available: 10 });
                            setShowCreateDialog(true);
                        }}>
                            <Plus className="w-4 h-4 mr-1" /> {t("hotelAvailability.createSlots", "Create Slots")}
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {!selectedExperience ? (
                <div className="text-center py-16">
                    <BedDouble className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-muted-foreground">{t("hotelAvailability.selectRoomTypeTitle", "Select a room type")}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t("hotelAvailability.selectRoomTypeHint", "Choose a hotel experience to view its nightly availability.")}</p>
                </div>
            ) : isLoading ? (
                <Card className="border border-border">
                    <CardContent className="p-6 space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-foreground">{nights.length}</p>
                                <p className="text-xs text-muted-foreground">{t("hotelAvailability.totalNights", "Total Nights")}</p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-emerald-600">{nights.filter(n => n.status === "OPEN" && n.available > 0).length}</p>
                                <p className="text-xs text-muted-foreground">{t("hotelAvailability.available", "Available")}</p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-red-500">{nights.filter(n => n.status === "CLOSED" || n.available === 0).length}</p>
                                <p className="text-xs text-muted-foreground">{t("hotelAvailability.full", "Full")}</p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-gray-400">{nights.filter(n => n.status === "NO_SLOT").length}</p>
                                <p className="text-xs text-muted-foreground">{t("hotelAvailability.noSlot", "No Slot")}</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Calendar Grid */}
                    <Card className="border border-border">
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <CalendarDays className="w-4 h-4" /> {t("hotelAvailability.nightlyGrid", "Nightly Availability Grid")}
                            </CardTitle>
                            <span className="text-xs text-muted-foreground italic">{t("hotelAvailability.gridHint", "Click a day to book or create a slot")}</span>
                        </CardHeader>
                        <CardContent className="p-4">
                            <div className="grid grid-cols-7 gap-1 mb-2">
                                {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => (
                                    <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase">{t(`hotelAvailability.days.${d}`, d)}</div>
                                ))}
                            </div>
                            {weeks.map((week, wi) => (
                                <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                                    {week.map((night, di) => {
                                        if (!night) return <div key={di} className="h-16" />;
                                        const dateObj = new Date(night.date);
                                        const day = dateObj.getDate();
                                        
                                        // Fix Full Slots Color Logic
                                        const isFull = night.status === "OPEN" && night.available <= 0;
                                        const effectiveStatus = isFull ? "CLOSED" : night.status;
                                        const statusClass = CELL_COLORS[effectiveStatus] || CELL_COLORS.NO_SLOT;
                                        
                                        const isClickable = night.status === "NO_SLOT" || !!night.slot_id || (night.status === "OPEN" && night.available > 0);

                                        return (
                                            <div 
                                                key={di} 
                                                onClick={() => handleCellClick(night)}
                                                className={`h-16 rounded-lg border text-center flex flex-col items-center justify-center transition-all ${statusClass} ${isClickable ? "hover:scale-105 hover:ring-2 hover:ring-primary/50 cursor-pointer shadow-sm" : "cursor-not-allowed opacity-80"}`}
                                            >
                                                <span className="text-[10px] font-medium opacity-60">{day}</span>
                                                <span className="text-sm font-bold">{night.available}</span>
                                                <span className="text-[9px] opacity-50">/{night.max_capacity}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500/30" /> {t("hotelAvailability.open", "Open")}</span>
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500/30" /> {t("hotelAvailability.fullClosed", "Full / Closed")}</span>
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-500/30" /> {t("hotelAvailability.blocked", "Blocked")}</span>
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-dashed border-gray-400" /> {t("hotelAvailability.noSlot", "No Slot")}</span>
                    </div>
                </>
            )}

            {/* Create Slots Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("hotelAvailability.createHotelSlots", "Create Hotel Slots")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t("hotelAvailability.dateFrom", "Date From")}</Label>
                                <Input type="date" value={createForm.date_from} onChange={(e) => setCreateForm(p => ({ ...p, date_from: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>{t("hotelAvailability.dateTo", "Date To")}</Label>
                                <Input type="date" value={createForm.date_to} onChange={(e) => setCreateForm(p => ({ ...p, date_to: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>{t("hotelAvailability.roomsAvailablePerNight", "Rooms Available (per night)")}</Label>
                            <Input type="number" min="1" value={createForm.rooms_available} onChange={(e) => setCreateForm(p => ({ ...p, rooms_available: parseInt(e.target.value) || 1 }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t("common.cancel", "Cancel")}</Button>
                        <Button className="cheese-gradient text-black font-semibold" onClick={handleCreateSlots} disabled={createSlotsMutation.isPending}>
                            {createSlotsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                            {t("hotelAvailability.createSlots", "Create Slots")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Quick Reservation Dialog */}
            <Dialog open={showReservationDialog} onOpenChange={setShowReservationDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("hotelAvailability.quickReservation", "Quick Reservation")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>{t("common.contact", "Contact")} <span className="text-red-500">*</span></Label>
                            <FrappeSearchSelect
                                doctype="Cheese Contact"
                                label="full_name"
                                value={resForm.contact}
                                onChange={(v) => setResForm(p => ({ ...p, contact: v }))}
                                placeholder={t("hotelAvailability.selectGuest", "Select guest...")}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t("hotelReservations.checkInDate", "Check-in Date")} <span className="text-red-500">*</span></Label>
                                <Input type="date" value={resForm.check_in_date} onChange={(e) => setResForm(p => ({ ...p, check_in_date: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>{t("hotelReservations.checkOutDate", "Check-out Date")} <span className="text-red-500">*</span></Label>
                                <Input type="date" value={resForm.check_out_date} onChange={(e) => setResForm(p => ({ ...p, check_out_date: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>{t("hotelReservations.roomsRequested", "Rooms Requested")}</Label>
                            <Input type="number" min="1" value={resForm.rooms_requested} onChange={(e) => setResForm(p => ({ ...p, rooms_requested: parseInt(e.target.value) || 1 }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("tickets.guestNotes", "Guest notes")}</Label>
                            <Textarea
                                value={resForm.notes}
                                onChange={(e) => setResForm(p => ({ ...p, notes: e.target.value }))}
                                placeholder={t("tickets.guestNotesPlaceholder", "Dietary, accessibility, or other requirements...")}
                                className="min-h-[80px]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReservationDialog(false)}>{t("common.cancel", "Cancel")}</Button>
                        <Button onClick={handleCreateReservation} disabled={createResMutation.isPending}>
                            {createResMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                            {t("hotelAvailability.bookRoom", "Book Room")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Manage / deactivate / delete slot */}
            <Dialog open={!!manageNight} onOpenChange={(open) => !open && setManageNight(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("hotelAvailability.manageSlot", "Manage Hotel Slot")}</DialogTitle>
                    </DialogHeader>
                    {manageNight && (
                        <div className="space-y-4 py-2">
                            <p className="text-sm text-muted-foreground">
                                {manageNight.date} · {manageNight.available}/{manageNight.max_capacity} {t("hotelAvailability.available", "available")}
                            </p>
                            <div className="space-y-2">
                                <Label>{t("hotelAvailability.roomsAvailablePerNight", "Rooms Available (per night)")}</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={manageForm.rooms_available}
                                    onChange={(e) => setManageForm(p => ({ ...p, rooms_available: parseInt(e.target.value, 10) || 0 }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t("common.status", "Status")}</Label>
                                <Select value={manageForm.status} onValueChange={(v) => setManageForm(p => ({ ...p, status: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="OPEN">{t("hotelAvailability.open", "Open")}</SelectItem>
                                        <SelectItem value="CLOSED">{t("hotelAvailability.fullClosed", "Closed")}</SelectItem>
                                        <SelectItem value="BLOCKED">{t("hotelAvailability.blocked", "Blocked")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setManageNight(null)}>{t("common.cancel", "Cancel")}</Button>
                        {manageNight?.status === "OPEN" && manageNight?.available > 0 && (
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    const d = new Date(manageNight.date);
                                    d.setDate(d.getDate() + 1);
                                    setResForm({
                                        contact: "",
                                        check_in_date: manageNight.date,
                                        check_out_date: d.toISOString().split("T")[0],
                                        rooms_requested: 1,
                                        slot_id: manageNight.slot_id,
                                        notes: "",
                                    });
                                    setManageNight(null);
                                    setShowReservationDialog(true);
                                }}
                            >
                                <Check className="w-4 h-4 mr-1" /> {t("hotelAvailability.bookRoom", "Book Room")}
                            </Button>
                        )}
                        <Button
                            onClick={() => updateSlotMutation.mutate({
                                slotId: manageNight.slot_id,
                                data: { rooms_available: manageForm.rooms_available, status: manageForm.status },
                            })}
                            disabled={updateSlotMutation.isPending}
                        >
                            <Pencil className="w-4 h-4 mr-1" /> {t("common.save", "Save")}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (window.confirm(t("calendar.deleteSlotConfirm", "Delete this slot? This cannot be undone.", { name: manageNight.slot_id }))) {
                                    deleteSlotMutation.mutate(manageNight.slot_id);
                                }
                            }}
                            disabled={deleteSlotMutation.isPending}
                        >
                            <Trash2 className="w-4 h-4 mr-1" /> {t("common.delete", "Delete")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
