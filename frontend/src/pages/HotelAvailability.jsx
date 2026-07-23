import React, { useState, useMemo, useEffect } from "react";
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
import { CalendarDays, AlertCircle, RefreshCw, BedDouble, Check, Loader2, DoorOpen } from "lucide-react";
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
    NO_ROOMS: "bg-gray-100 dark:bg-gray-900 text-gray-400 border-dashed border-gray-300 dark:border-gray-700",
};

// Daily slot states of a physical room
const DAY_STATE_BADGE = {
    AVAILABLE: { label: "Disponible", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    RESERVED: { label: "Reservada", cls: "bg-cheese-500/15 text-cheese-700" },
    OCCUPIED: { label: "Ocupada", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
    BLOCKED: { label: "Bloqueada", cls: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
    MAINTENANCE: { label: "Mantenimiento", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    OUT_OF_SERVICE: { label: "Fuera de servicio", cls: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
};

const addDaysStr = (dateStr, n) => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
};

export default function HotelAvailability({ hotelId = null, embedded = false, experienceId = null }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [selectedExperience, setSelectedExperience] = useState(experienceId || "");
    const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().split("T")[0]);
    const [dateTo, setDateTo] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split("T")[0];
    });

    // Date selection: single click selects a day; shift+click extends a range.
    const [selStart, setSelStart] = useState(null);
    const [selEnd, setSelEnd] = useState(null);

    const [showReservationDialog, setShowReservationDialog] = useState(false);
    const [resForm, setResForm] = useState({ contact: "", check_in_date: "", check_out_date: "", rooms_requested: 1, notes: "" });
    const [manualRooms, setManualRooms] = useState([]);

    const { data: hotelsPayload } = useQuery({
        queryKey: ["hotel-experiences-list"],
        queryFn: async () => {
            const res = await hotelService.listHotels({ page: 1, page_size: 200 });
            return res?.data?.message || res?.data || {};
        },
    });

    const { activeEstablishment } = useActiveEstablishment();
    const allHotels = Array.isArray(hotelsPayload?.data) ? hotelsPayload.data : [];
    // Embedded (inside the grid): scope to the hotel selected there; standalone: global selector.
    const hotels = hotelId
        ? allHotels.filter((h) => h.name === hotelId)
        : (activeEstablishment ? allHotels.filter((h) => h.name === activeEstablishment) : allHotels);

    const { data: expPayload } = useQuery({
        queryKey: ["hotel-experiences", hotels.map(h => h.name).join(",")],
        queryFn: async () => {
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

    // When locked to a single room type (experience detail), keep the selection
    // pinned to it and never show the selector.
    useEffect(() => {
        if (experienceId) setSelectedExperience(experienceId);
    }, [experienceId]);

    // Default to the first room type once the list loads (or when the current
    // selection is no longer in the list, e.g. the hotel changed).
    useEffect(() => {
        if (experienceId) return;
        if (!experiences.length) return;
        if (!selectedExperience || !experiences.some((e) => e.name === selectedExperience)) {
            setSelectedExperience(experiences[0].name);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [experiences.map((e) => e.name).join(",")]);

    // Nightly availability derived from physical rooms
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

    // Clear the selection when the room type or window changes
    useEffect(() => { setSelStart(null); setSelEnd(null); }, [selectedExperience, dateFrom, dateTo]);

    const isRange = selStart && selEnd && selStart !== selEnd;

    // Single day selected → state of every room that day
    const { data: dayStatesPayload, isLoading: dayStatesLoading } = useQuery({
        queryKey: ["room-day-states", selectedExperience, selStart],
        queryFn: async () => {
            const res = await hotelService.getRoomDayStates(selectedExperience, selStart, selStart);
            return res?.data?.message?.data || res?.data?.data || {};
        },
        enabled: !!selectedExperience && !!selStart && !isRange,
    });

    // Range selected → rooms free for ALL those days (nights [start, end+1))
    const { data: freeRoomsPayload, isLoading: freeRoomsLoading } = useQuery({
        queryKey: ["free-rooms", selectedExperience, selStart, selEnd],
        queryFn: async () => {
            const res = await hotelService.listFreeRooms(selectedExperience, selStart, addDaysStr(selEnd, 1));
            return res?.data?.message?.data || res?.data?.data || {};
        },
        enabled: !!selectedExperience && !!isRange,
    });

    // Free rooms for the booking dialog range (manual selection)
    const { data: dialogFreePayload } = useQuery({
        queryKey: ["free-rooms-dialog", selectedExperience, resForm.check_in_date, resForm.check_out_date],
        queryFn: async () => {
            const res = await hotelService.listFreeRooms(selectedExperience, resForm.check_in_date, resForm.check_out_date);
            return res?.data?.message?.data || res?.data?.data || {};
        },
        enabled: showReservationDialog && !!selectedExperience && !!resForm.check_in_date && !!resForm.check_out_date && resForm.check_out_date > resForm.check_in_date,
    });
    const dialogFreeRooms = Array.isArray(dialogFreePayload?.free_rooms) ? dialogFreePayload.free_rooms : [];

    const createResMutation = useMutation({
        mutationFn: (data) => ticketService.createPendingTicket(data),
        onSuccess: (res) => {
            const msg = res?.data?.message;
            if (msg && msg.success === false) {
                toast.error(msg?.error?.message || msg?.message || t("hotelAvailability.createReservationError", "No se pudo crear la reserva"));
                return;
            }
            setShowReservationDialog(false);
            setManualRooms([]);
            queryClient.invalidateQueries(["hotel-availability"]);
            queryClient.invalidateQueries(["room-day-states"]);
            queryClient.invalidateQueries(["free-rooms"]);
            toast.success(t("hotelAvailability.reservationCreated", "Reserva creada con éxito"));
        },
        onError: (err) => {
            const msg = err?.response?.data?.exception || err?.response?.data?.message || err?.message || t("hotelAvailability.createReservationError", "No se pudo crear la reserva");
            toast.error(msg);
        }
    });

    const handleCreateReservation = () => {
        if (!resForm.contact) {
            toast.error(t("hotelAvailability.contactRequired", "Selecciona un contacto"));
            return;
        }
        if (!resForm.check_in_date || !resForm.check_out_date || resForm.check_out_date <= resForm.check_in_date) {
            toast.error(t("hotelAvailability.checkoutAfterCheckin", "El check-out debe ser posterior al check-in"));
            return;
        }
        createResMutation.mutate({
            contact_id: resForm.contact,
            experience_id: selectedExperience,
            check_in_date: resForm.check_in_date,
            check_out_date: resForm.check_out_date,
            rooms_requested: parseInt(resForm.rooms_requested, 10) || 1,
            party_size: 1,
            notes: resForm.notes?.trim() || undefined,
            room_ids: manualRooms.length ? JSON.stringify(manualRooms) : undefined,
        });
    };

    const openBookingDialog = (checkIn, checkOut) => {
        setResForm({ contact: "", check_in_date: checkIn, check_out_date: checkOut, rooms_requested: 1, notes: "" });
        setManualRooms([]);
        setShowReservationDialog(true);
    };

    const handleCellClick = (night, event) => {
        if (event.shiftKey && selStart) {
            const [a, b] = [selStart, night.date].sort();
            setSelStart(a);
            setSelEnd(b);
        } else {
            setSelStart(night.date);
            setSelEnd(night.date);
        }
    };

    const handleCellDoubleClick = (night) => {
        // Double-click books the selected range when the day belongs to it,
        // otherwise a one-night stay on that day.
        let start = night.date;
        let end = night.date;
        if (selStart && selEnd && night.date >= selStart && night.date <= selEnd) {
            start = selStart;
            end = selEnd;
        }
        openBookingDialog(start, addDaysStr(end, 1));
    };

    const inSelection = (date) => selStart && selEnd && date >= selStart && date <= selEnd;

    const weeks = useMemo(() => {
        if (!nights.length) return [];
        const result = [];
        let currentWeek = [];
        for (const night of nights) {
            const dayOfWeek = new Date(`${night.date}T00:00:00`).getDay();
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

    const dayStateRooms = Array.isArray(dayStatesPayload?.rooms) ? dayStatesPayload.rooms : [];
    const rangeFreeRooms = Array.isArray(freeRoomsPayload?.free_rooms) ? freeRoomsPayload.free_rooms : [];

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("hotelAvailability.loadFailed", "No se pudo cargar la disponibilidad")}</h2>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Reintentar")}
                </Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={embedded ? "space-y-6" : "p-6 space-y-6"}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    {embedded ? (
                        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                            <CalendarDays className="w-5 h-5 text-indigo-500" /> {t("hotelAvailability.titleEmbedded", "Calendario por tipo de habitación")}
                        </h2>
                    ) : (
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <CalendarDays className="w-6 h-6 text-indigo-500" /> {t("hotelAvailability.title", "Disponibilidad de Hotel")}
                        </h1>
                    )}
                    <p className="text-sm text-muted-foreground mt-1">{t("hotelAvailability.subtitleRooms", "Habitaciones disponibles por tipo, derivadas del inventario físico")}</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    {!experienceId && (
                        <Select value={selectedExperience} onValueChange={setSelectedExperience}>
                            <SelectTrigger className="w-56 h-9">
                                <SelectValue placeholder={t("hotelAvailability.selectRoomType", "Selecciona un tipo de habitación…")} />
                            </SelectTrigger>
                            <SelectContent>
                                {experiences.map((exp) => (
                                    <SelectItem key={exp.name} value={exp.name}>{exp.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40" />
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40" />
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {!selectedExperience ? (
                <div className="text-center py-16">
                    <BedDouble className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-muted-foreground">{t("hotelAvailability.selectRoomTypeTitle", "Selecciona un tipo de habitación")}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t("hotelAvailability.selectRoomTypeHint", "Elige un tipo de habitación para ver su disponibilidad por noche.")}</p>
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
                                <p className="text-2xl font-bold text-foreground">{nights[0]?.max_capacity ?? 0}</p>
                                <p className="text-xs text-muted-foreground">{t("hotelAvailability.roomsOfType", "Tipos de habitación")}</p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-emerald-600">{nights.filter(n => n.available > 0).length}</p>
                                <p className="text-xs text-muted-foreground">{t("hotelAvailability.nightsAvailable", "Noches con habitación")}</p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-red-500">{nights.filter(n => n.status !== "NO_ROOMS" && n.available === 0).length}</p>
                                <p className="text-xs text-muted-foreground">{t("hotelAvailability.nightsFull", "Noches sin habitación")}</p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-foreground">{nights.length}</p>
                                <p className="text-xs text-muted-foreground">{t("hotelAvailability.totalNights", "Noches en el período")}</p>
                            </CardContent>
                        </Card>
                    </div>

                    {nights.length > 0 && nights[0].status === "NO_ROOMS" && (
                        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{t("hotelAvailability.noRoomsWarning", "Este tipo de habitación no tiene habitaciones físicas creadas. Créalas en Habitaciones para poder reservar.")}</span>
                        </div>
                    )}

                    {/* Calendar Grid */}
                    <Card className="border border-border">
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <CalendarDays className="w-4 h-4" /> {t("hotelAvailability.nightlyGrid", "Disponibilidad por noche")}
                            </CardTitle>
                            <span className="text-xs text-muted-foreground italic">
                                {t("hotelAvailability.gridHintRooms", "Clic: ver habitaciones del día · Shift+clic: rango · Doble clic: reservar")}
                            </span>
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
                                        const day = new Date(`${night.date}T00:00:00`).getDate();
                                        const isFull = night.status !== "NO_ROOMS" && night.available <= 0;
                                        const effectiveStatus = night.status === "NO_ROOMS" ? "NO_ROOMS" : (isFull ? "CLOSED" : "OPEN");
                                        const statusClass = CELL_COLORS[effectiveStatus];
                                        const selected = inSelection(night.date);
                                        return (
                                            <div
                                                key={di}
                                                onClick={(e) => handleCellClick(night, e)}
                                                onDoubleClick={() => handleCellDoubleClick(night)}
                                                className={`h-16 rounded-lg border text-center flex flex-col items-center justify-center transition-all select-none cursor-pointer shadow-sm hover:ring-2 hover:ring-primary/40 ${statusClass} ${selected ? "ring-2 ring-cheese-500 ring-offset-1" : ""}`}
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
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500/30" /> {t("hotelAvailability.withAvailability", "Con disponibilidad")}</span>
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500/30" /> {t("hotelAvailability.full", "Completo")}</span>
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-dashed border-gray-400" /> {t("hotelAvailability.noRooms", "Sin habitaciones creadas")}</span>
                    </div>

                    {/* Selection detail below the calendar */}
                    {selStart && !isRange && (
                        <Card className="border border-border">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <DoorOpen className="w-4 h-4 text-cheese-600" />
                                    {t("hotelAvailability.roomsOnDay", "Estado de las habitaciones el {{date}}", { date: selStart })}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {dayStatesLoading ? (
                                    <Skeleton className="h-16 w-full" />
                                ) : dayStateRooms.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">{t("hotelAvailability.noRooms", "Sin habitaciones creadas")}</p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                        {dayStateRooms.map((room) => {
                                            const state = room.days?.[selStart] || "AVAILABLE";
                                            const badge = DAY_STATE_BADGE[state] || DAY_STATE_BADGE.AVAILABLE;
                                            return (
                                                <Card key={room.name} className="glass-surface">
                                                    <CardContent className="p-3 space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-bold">{room.room_number}</span>
                                                            {room.floor && <span className="text-[10px] text-muted-foreground">{t("rooms.floor", "Piso")} {room.floor}</span>}
                                                        </div>
                                                        <Badge className={badge.cls}>{t(`hotelAvailability.state${state}`, badge.label)}</Badge>
                                                        {room.tickets?.[selStart] && (
                                                            <p className="text-[10px] text-muted-foreground font-mono truncate">{room.tickets[selStart]}</p>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {isRange && (
                        <Card className="border border-border">
                            <CardHeader className="pb-3 flex flex-row items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <DoorOpen className="w-4 h-4 text-cheese-600" />
                                    {t("hotelAvailability.freeRoomsRange", "Habitaciones disponibles del {{from}} al {{to}}", { from: selStart, to: selEnd })}
                                </CardTitle>
                                <Button size="sm" className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={() => openBookingDialog(selStart, addDaysStr(selEnd, 1))}>
                                    <Check className="w-4 h-4 mr-1" /> {t("hotelAvailability.bookRange", "Reservar este rango")}
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {freeRoomsLoading ? (
                                    <Skeleton className="h-16 w-full" />
                                ) : rangeFreeRooms.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        {t("hotelAvailability.noFreeRoomsRange", "Ninguna habitación está libre durante todos los días seleccionados.")}
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                        {rangeFreeRooms.map((room) => (
                                            <Card key={room.name} className="glass-surface">
                                                <CardContent className="p-3 space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold">{room.room_number}</span>
                                                        {room.floor && <span className="text-[10px] text-muted-foreground">{t("rooms.floor", "Piso")} {room.floor}</span>}
                                                    </div>
                                                    <Badge className={DAY_STATE_BADGE.AVAILABLE.cls}>{t("hotelAvailability.stateAVAILABLE", "Disponible")}</Badge>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {/* Reservation Dialog (double-click / range button) */}
            <Dialog open={showReservationDialog} onOpenChange={setShowReservationDialog}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t("hotelAvailability.quickReservation", "Nueva reserva")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>{t("common.contact", "Contacto")} <span className="text-red-500">*</span></Label>
                            <FrappeSearchSelect
                                doctype="Cheese Contact"
                                label="full_name"
                                value={resForm.contact}
                                onChange={(v) => setResForm(p => ({ ...p, contact: v }))}
                                placeholder={t("hotelAvailability.selectGuest", "Selecciona el huésped...")}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t("hotelReservations.checkInDate", "Check-in")} <span className="text-red-500">*</span></Label>
                                <Input type="date" value={resForm.check_in_date} onChange={(e) => setResForm(p => ({ ...p, check_in_date: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>{t("hotelReservations.checkOutDate", "Check-out")} <span className="text-red-500">*</span></Label>
                                <Input type="date" value={resForm.check_out_date} onChange={(e) => setResForm(p => ({ ...p, check_out_date: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>{t("hotelReservations.roomsRequested", "Habitaciones solicitadas")}</Label>
                            <Input type="number" min="1" value={resForm.rooms_requested} onChange={(e) => setResForm(p => ({ ...p, rooms_requested: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("hotelAvailability.manualRooms", "Habitación específica (opcional)")}</Label>
                            <p className="text-xs text-muted-foreground">
                                {t("hotelAvailability.manualRoomsHint", "Si no eliges ninguna, el sistema asigna automáticamente habitaciones libres.")}
                            </p>
                            {dialogFreeRooms.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">{t("hotelAvailability.noFreeRoomsRange", "Ninguna habitación está libre durante todos los días seleccionados.")}</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {dialogFreeRooms.map((room) => {
                                        const checked = manualRooms.includes(room.name);
                                        const maxReached = manualRooms.length >= (parseInt(resForm.rooms_requested, 10) || 1);
                                        return (
                                            <button
                                                key={room.name}
                                                type="button"
                                                onClick={() => setManualRooms((prev) =>
                                                    checked ? prev.filter((r) => r !== room.name) : (maxReached ? prev : [...prev, room.name])
                                                )}
                                                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${checked ? "bg-cheese-500 text-black border-cheese-500" : "bg-background border-border hover:border-cheese-400"} ${!checked && maxReached ? "opacity-40 cursor-not-allowed" : ""}`}
                                            >
                                                {room.room_number}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>{t("tickets.guestNotes", "Notas del huésped")}</Label>
                            <Textarea
                                value={resForm.notes}
                                onChange={(e) => setResForm(p => ({ ...p, notes: e.target.value }))}
                                placeholder={t("tickets.guestNotesPlaceholder", "Dieta, accesibilidad u otros requerimientos...")}
                                className="min-h-[80px]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReservationDialog(false)}>{t("common.cancel", "Cancelar")}</Button>
                        <Button onClick={handleCreateReservation} disabled={createResMutation.isPending}>
                            {createResMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                            {t("hotelAvailability.bookRoom", "Reservar")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
