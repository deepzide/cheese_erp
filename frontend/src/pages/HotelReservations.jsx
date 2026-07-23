import React, { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    BedDouble, Search, AlertCircle, RefreshCw, Plus, LayoutGrid, List,
    Check, Loader2, Moon, Users,
} from "lucide-react";
import { hotelService } from "@/api/hotelService";
import { simulatorService } from "@/api/simulatorService";
import { ticketService } from "@/api/ticketService";
import { apiRequest } from "@/api/client";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";

const STATUS_COLORS = {
    PENDING: "bg-yellow-500/15 text-yellow-700",
    CONFIRMED: "bg-blue-500/15 text-blue-700",
    CHECKED_IN: "bg-emerald-500/15 text-emerald-700",
    COMPLETED: "bg-gray-500/15 text-gray-600",
    CANCELLED: "bg-red-500/15 text-red-700",
    NO_SHOW: "bg-orange-500/15 text-orange-700",
    EXPIRED: "bg-gray-500/15 text-gray-500",
    REJECTED: "bg-red-500/15 text-red-600",
};

const todayStr = () => new Date().toISOString().split("T")[0];
const addDaysStr = (dateStr, n) => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
};
const fmtMoney = (n, cur) =>
    `${cur ? `${cur} ` : "$"}${Number(n || 0).toLocaleString("es-UY", { maximumFractionDigits: 2 })}`;

export default function HotelReservations() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { activeEstablishment } = useActiveEstablishment();
    const { t } = useTranslation();

    // Filters (mockup toolbar: buscador, hotel, habitación, estado, fechas, vista)
    const [q, setQ] = useState("");
    const [hotelSel, setHotelSel] = useState(searchParams.get("establishment") || searchParams.get("hotel") || "_all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [roomTypeFilter, setRoomTypeFilter] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [view, setView] = useState("cards");

    // Global establishment scope pins the hotel filter.
    const hotelId = activeEstablishment || (hotelSel !== "_all" ? hotelSel : null);

    const { data: hotelsPayload } = useQuery({
        queryKey: ["hotel-experiences-list"],
        queryFn: async () => {
            const res = await hotelService.listHotels({ page: 1, page_size: 200 });
            return res?.data?.message || res?.data || {};
        },
    });
    const hotels = Array.isArray(hotelsPayload?.data) ? hotelsPayload.data : [];

    // Room types in scope, to filter reservations and to book new ones
    const { data: roomTypesPayload } = useQuery({
        queryKey: ["hotel-room-types", hotelId],
        queryFn: async () => {
            if (hotelId) {
                const res = await hotelService.getHotelExperiences(hotelId, { page_size: 200 });
                const d = res?.data?.message || res?.data || {};
                return Array.isArray(d.data) ? d.data : [];
            }
            const hotelsRes = await hotelService.listHotels({ page: 1, page_size: 200 });
            const hs = (hotelsRes?.data?.message || hotelsRes?.data || {})?.data || [];
            const all = [];
            for (const h of hs) {
                const res = await hotelService.getHotelExperiences(h.name, { page_size: 200 });
                const d = res?.data?.message || res?.data || {};
                if (Array.isArray(d.data)) all.push(...d.data);
            }
            return all;
        },
    });
    const roomTypes = Array.isArray(roomTypesPayload) ? roomTypesPayload : [];

    const { data: payload, isLoading, error, refetch } = useQuery({
        queryKey: ["hotel-reservations", hotelId, statusFilter, roomTypeFilter, dateFrom, dateTo],
        queryFn: async () => {
            const params = { page: 1, page_size: 100 };
            if (hotelId) params.hotel_id = hotelId;
            if (roomTypeFilter && roomTypeFilter !== "all") params.experience_id = roomTypeFilter;
            if (statusFilter && statusFilter !== "all") params.status = statusFilter;
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await hotelService.getHotelReservations(params);
            return res?.data?.message || res?.data || {};
        },
    });

    const allReservations = Array.isArray(payload?.data) ? payload.data : [];
    // Guest search is client-side (name / phone / ticket id), like the mockup.
    const reservations = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return allReservations;
        return allReservations.filter((r) =>
            `${r.contact_name || ""} ${r.contact_phone || ""} ${r.name || ""}`.toLowerCase().includes(needle)
        );
    }, [allReservations, q]);

    // ---- Nueva reserva (mockup openQuickBook) ----
    const [newOpen, setNewOpen] = useState(false);
    const [nf, setNf] = useState({ experience: "", contact: "", check_in: todayStr(), nights: 1, rooms: 1, guests: 2, notes: "" });
    const selectedType = roomTypes.find((r) => r.name === nf.experience);
    const minNights = Math.max(1, Number(selectedType?.min_nights_stay) || 1);
    const nightsNum = Math.max(1, parseInt(nf.nights, 10) || 1);
    const roomsNum = Math.max(1, parseInt(nf.rooms, 10) || 1);
    const guestsNum = Math.max(1, parseInt(nf.guests, 10) || 1);
    const checkOut = nf.check_in ? addDaysStr(nf.check_in, nightsNum) : "";

    const openNew = () => {
        const exp = roomTypeFilter !== "all" ? roomTypeFilter : roomTypes[0]?.name || "";
        const mn = Math.max(1, Number(roomTypes.find((r) => r.name === exp)?.min_nights_stay) || 1);
        setNf({ experience: exp, contact: "", check_in: todayStr(), nights: mn, rooms: 1, guests: 2, notes: "" });
        setNewOpen(true);
    };

    // Keep nights >= the room type's minimum when switching types.
    useEffect(() => {
        if (newOpen && nightsNum < minNights) setNf((p) => ({ ...p, nights: minNights }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nf.experience, newOpen]);

    // Live verification: price + room availability for the whole range,
    // via the same engine a real booking uses (rooms-derived, seasons, promos).
    const simEnabled = newOpen && !!nf.experience && !!nf.check_in && !!checkOut;
    const { data: simPayload, isFetching: simLoading } = useQuery({
        queryKey: ["hotel-book-sim", nf.experience, nf.check_in, checkOut, roomsNum, guestsNum],
        enabled: simEnabled,
        queryFn: async () => {
            const res = await simulatorService.simulate({
                booking_type: "HOTEL",
                experience_id: nf.experience,
                check_in_date: nf.check_in,
                check_out_date: checkOut,
                party_size: guestsNum,
                rooms_requested: roomsNum,
            });
            return res?.data?.message || res?.data || {};
        },
    });
    const sim = simPayload?.data || {};
    const avail = sim?.availability || {};
    const freeRooms = Number(avail.available_rooms) || 0;
    const okAvail = !!avail.enough;
    const okMin = nightsNum >= minNights;

    const createMutation = useMutation({
        mutationFn: (data) => ticketService.createPendingTicket(data),
        onSuccess: async (res) => {
            const msg = res?.data?.message;
            if (msg && msg.success === false) {
                toast.error(msg?.error?.message || msg?.message || t("hotelReservations.createError", "No se pudo crear la reserva"));
                return;
            }
            const ticketId = msg?.data?.ticket_id;
            // The backend auto-assigned free rooms on insert; surface which one(s).
            let assigned = "";
            if (ticketId) {
                try {
                    const tk = await apiRequest(`/api/resource/Cheese%20Ticket/${encodeURIComponent(ticketId)}`);
                    const doc = tk?.data?.message?.data || tk?.data?.data || tk?.data?.message || tk?.data || {};
                    assigned = doc.room_number_assigned || "";
                } catch { /* toast without room */ }
            }
            toast.success(
                assigned
                    ? t("hotelReservations.createdWithRoom", "Reserva {{id}} creada · Habitación asignada: {{room}}", { id: ticketId, room: assigned })
                    : t("hotelReservations.created", "Reserva {{id}} creada", { id: ticketId || "" })
            );
            setNewOpen(false);
            queryClient.invalidateQueries({ queryKey: ["hotel-reservations"] });
            queryClient.invalidateQueries({ queryKey: ["hotel-availability"] });
            queryClient.invalidateQueries({ queryKey: ["hotel-availability-matrix"] });
            queryClient.invalidateQueries({ queryKey: ["room-day-states"] });
            queryClient.invalidateQueries({ queryKey: ["free-rooms"] });
        },
        onError: (err) => {
            const m = err?.response?.data?.exception || err?.response?.data?.message || err?.message || t("hotelReservations.createError", "No se pudo crear la reserva");
            toast.error(m);
        },
    });

    const handleCreate = () => {
        if (!nf.experience) { toast.error(t("hotelReservations.roomTypeRequired", "Selecciona un tipo de habitación")); return; }
        if (!nf.contact) { toast.error(t("hotelAvailability.contactRequired", "Selecciona un contacto")); return; }
        if (!okMin) { toast.error(t("hotelReservations.minNightsError", "No cumple el mínimo de {{n}} noches", { n: minNights })); return; }
        if (!okAvail) { toast.error(t("hotelReservations.noAvailabilityError", "No hay disponibilidad para ese rango")); return; }
        createMutation.mutate({
            contact_id: nf.contact,
            experience_id: nf.experience,
            check_in_date: nf.check_in,
            check_out_date: checkOut,
            rooms_requested: roomsNum,
            party_size: guestsNum,
            notes: nf.notes?.trim() || undefined,
        });
    };

    const stayLine = (r) => {
        const parts = [];
        if (r.check_in_date && r.check_out_date) parts.push(`${r.check_in_date} → ${r.check_out_date}`);
        if (r.nights) parts.push(`${r.nights} ${r.nights !== 1 ? t("common.nights", "noches") : t("common.night", "noche")}`);
        if (r.rooms_requested) parts.push(`${r.rooms_requested} hab`);
        if (r.party_size) parts.push(`${r.party_size} huésp.`);
        return parts.join(" · ");
    };

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("hotelReservations.failedToLoadList", "No se pudieron cargar las reservaciones")}</h2>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Reintentar")}
                </Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-4">
            <div className="flex items-center gap-3">
                <BedDouble className="w-6 h-6 text-indigo-500" />
                <div>
                    <h1 className="text-xl font-bold text-foreground">{t("hotelReservations.title", "Reservaciones de Hotel")}</h1>
                    <p className="text-xs text-muted-foreground">
                        {isLoading ? "…" : `${reservations.length} ${t("hotelReservations.reservationsCount", "reservas")}`}
                        {hotelId ? ` · ${hotelId}` : ""}
                    </p>
                </div>
            </div>

            {/* Toolbar (mockup tkbar) */}
            <div className="flex flex-wrap gap-2 items-center">
                <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={t("hotelReservations.searchGuest", "Buscar huésped…")}
                        className="h-9 pl-8 w-52"
                    />
                </div>
                {!activeEstablishment && (
                    <Select value={hotelSel} onValueChange={setHotelSel}>
                        <SelectTrigger className="w-48 h-9">
                            <SelectValue placeholder={t("hotelReservations.allHotels", "Todos los hoteles")} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="_all">{t("hotelReservations.allHotels", "Todos los hoteles")}</SelectItem>
                            {hotels.map((h) => (
                                <SelectItem key={h.name} value={h.name}>🏨 {h.company_name || h.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
                    <SelectTrigger className="w-48 h-9">
                        <SelectValue placeholder={t("hotelReservations.roomType", "Tipo de habitación")} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("hotelReservations.allRoomTypes", "Toda habitación")}</SelectItem>
                        {roomTypes.map((rt) => (
                            <SelectItem key={rt.name} value={rt.name}>{rt.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40 h-9">
                        <SelectValue placeholder={t("common.status", "Estado")} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("hotelReservations.allStatuses", "Todos los estados")}</SelectItem>
                        <SelectItem value="PENDING">{t("status.PENDING", "Pendiente")}</SelectItem>
                        <SelectItem value="CONFIRMED">{t("status.CONFIRMED", "Confirmada")}</SelectItem>
                        <SelectItem value="CHECKED_IN">{t("status.CHECKED_IN", "Check-in")}</SelectItem>
                        <SelectItem value="COMPLETED">{t("status.COMPLETED", "Completada")}</SelectItem>
                        <SelectItem value="CANCELLED">{t("status.CANCELLED", "Cancelada")}</SelectItem>
                        <SelectItem value="NO_SHOW">{t("status.NO_SHOW", "No show")}</SelectItem>
                    </SelectContent>
                </Select>
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {t("common.from", "Desde")}
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-36" />
                </label>
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {t("common.to", "Hasta")}
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-36" />
                </label>
                <Tabs value={view} onValueChange={setView}>
                    <TabsList className="h-9">
                        <TabsTrigger value="cards" className="text-xs px-3 h-7">
                            <LayoutGrid className="w-3.5 h-3.5 mr-1" /> {t("common.cardsView", "Tarjetas")}
                        </TabsTrigger>
                        <TabsTrigger value="table" className="text-xs px-3 h-7">
                            <List className="w-3.5 h-3.5 mr-1" /> {t("common.tableView", "Tabla")}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="flex-1" />
                <Button size="sm" className="h-9 bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={openNew}>
                    <Plus className="w-4 h-4 mr-1" /> {t("hotelReservations.newReservation", "Nueva reserva")}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Card key={i} className="border border-border">
                            <CardContent className="p-5 space-y-3">
                                <Skeleton className="h-5 w-60" />
                                <Skeleton className="h-4 w-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : view === "table" ? (
                /* Tabla (mockup): Huésped | Habitación | Estadía | Precio | Estado */
                <Card className="border border-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                                    <th className="py-2.5 px-4 font-semibold">{t("hotelReservations.guest", "Huésped")}</th>
                                    <th className="py-2.5 px-4 font-semibold">{t("hotelReservations.room", "Habitación")}</th>
                                    <th className="py-2.5 px-4 font-semibold">{t("hotelReservations.stay", "Estadía")}</th>
                                    <th className="py-2.5 px-4 font-semibold text-right">{t("common.price", "Precio")}</th>
                                    <th className="py-2.5 px-4 font-semibold">{t("common.status", "Estado")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reservations.map((r) => (
                                    <tr
                                        key={r.name}
                                        onClick={() => navigate(`/cheese/hotels/reservations/${encodeURIComponent(r.name)}`)}
                                        className="border-b border-border/50 hover:bg-muted/40 cursor-pointer transition-colors"
                                    >
                                        <td className="py-2.5 px-4">
                                            <span className="font-medium">{r.contact_name || r.contact || "—"}</span>
                                            {r.contact_phone && <span className="block text-xs text-muted-foreground font-mono">{r.contact_phone}</span>}
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <span>{r.experience_name || r.experience}</span>
                                            {r.company && <span className="block text-xs text-muted-foreground">{r.company}</span>}
                                        </td>
                                        <td className="py-2.5 px-4 text-muted-foreground text-xs">{stayLine(r)}</td>
                                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                                            {r.total_price != null ? fmtMoney(r.total_price) : "—"}
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <Badge className={STATUS_COLORS[r.status] || "bg-gray-500/15 text-gray-600"}>
                                                {t(`status.${r.status}`, r.status)}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                                {reservations.length === 0 && (
                                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">{t("hotelReservations.noReservations", "Sin reservas con estos filtros.")}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : (
                /* Tarjetas (mockup) */
                <div className="space-y-2.5">
                    {reservations.map((r) => (
                        <motion.div key={r.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                            <Card
                                onClick={() => navigate(`/cheese/hotels/reservations/${encodeURIComponent(r.name)}`)}
                                className="border border-border shadow-sm hover:shadow-md transition-all hover:border-primary/40 cursor-pointer"
                            >
                                <CardContent className="px-4 py-3.5">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <span className="font-mono text-xs font-bold">{r.name}</span>
                                        <Badge className={STATUS_COLORS[r.status] || "bg-gray-500/15 text-gray-600"}>
                                            {t(`status.${r.status}`, r.status)}
                                        </Badge>
                                        <span className="flex-1" />
                                        {r.total_price != null && (
                                            <span className="font-bold tabular-nums">{fmtMoney(r.total_price)}</span>
                                        )}
                                    </div>
                                    <div className="mt-1.5 font-semibold text-sm">
                                        {r.contact_name || r.contact || t("hotelReservations.noGuestName", "Sin nombre")}
                                        {r.contact_phone && <span className="font-normal text-muted-foreground"> · {r.contact_phone}</span>}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        🛏️ {r.experience_name || r.experience}
                                        {r.company ? ` · ${r.company}` : ""}
                                        {stayLine(r) ? ` · ${stayLine(r)}` : ""}
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                    {reservations.length === 0 && (
                        <div className="text-center py-16">
                            <BedDouble className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-muted-foreground">{t("hotelReservations.noReservations", "Sin reservas con estos filtros.")}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{t("hotelReservations.noReservationsDesc", "Las reservas de hotel aparecerán aquí.")}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Nueva reserva (mockup openQuickBook): live availability + price check;
                the backend auto-assigns free rooms and creates the ticket. */}
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {t("hotelReservations.newReservation", "Nueva reserva")}
                            {selectedType ? ` · ${selectedType.name}` : ""}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>{t("hotelReservations.roomType", "Tipo de habitación")} <span className="text-red-500">*</span></Label>
                            <Select value={nf.experience} onValueChange={(v) => setNf((p) => ({ ...p, experience: v }))}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder={t("hotelAvailability.selectRoomType", "Selecciona un tipo de habitación…")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {roomTypes.map((rt) => (
                                        <SelectItem key={rt.name} value={rt.name}>{rt.name}{rt.company ? ` · ${rt.company}` : ""}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>{t("hotelReservations.guest", "Huésped")} <span className="text-red-500">*</span></Label>
                            <FrappeSearchSelect
                                doctype="Cheese Contact"
                                label="full_name"
                                value={nf.contact}
                                onChange={(v) => setNf((p) => ({ ...p, contact: v }))}
                                placeholder={t("hotelAvailability.selectGuest", "Selecciona el huésped...")}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t("hotelReservations.checkInDate", "Entrada")} <span className="text-red-500">*</span></Label>
                                <Input type="date" value={nf.check_in} onChange={(e) => setNf((p) => ({ ...p, check_in: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1"><Moon className="w-3.5 h-3.5" /> {t("hotelReservations.nightsLabel", "Noches")}</Label>
                                <Input type="number" min={minNights} value={nf.nights} onChange={(e) => setNf((p) => ({ ...p, nights: e.target.value }))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {t("hotelReservations.roomsLabel", "Habitaciones")}</Label>
                                <Input type="number" min="1" value={nf.rooms} onChange={(e) => setNf((p) => ({ ...p, rooms: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {t("hotelReservations.guestsLabel", "Huéspedes")}</Label>
                                <Input type="number" min="1" value={nf.guests} onChange={(e) => setNf((p) => ({ ...p, guests: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>{t("tickets.guestNotes", "Notas del huésped")}</Label>
                            <Textarea
                                value={nf.notes}
                                onChange={(e) => setNf((p) => ({ ...p, notes: e.target.value }))}
                                placeholder={t("tickets.guestNotesPlaceholder", "Dieta, accesibilidad u otros requerimientos...")}
                                className="min-h-[60px]"
                            />
                        </div>

                        {/* Live check line (mockup qbInfo): price · availability · min nights */}
                        {simEnabled && (
                            <div className="text-xs rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center gap-2 flex-wrap">
                                {simLoading ? (
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("hotelReservations.checking", "Verificando disponibilidad…")}
                                    </span>
                                ) : (
                                    <>
                                        <span>
                                            {t("common.price", "Precio")}: <b>{fmtMoney(sim.total_price, sim.currency)}</b>
                                            <span className="text-muted-foreground"> ({nightsNum} {nightsNum !== 1 ? t("common.nights", "noches") : t("common.night", "noche")} × {roomsNum} hab)</span>
                                        </span>
                                        <span>·</span>
                                        {okAvail ? (
                                            <span className="text-emerald-600 font-medium">
                                                {t("hotelReservations.availOk", "disponibilidad ok ({{n}} libre/s)", { n: freeRooms })}
                                            </span>
                                        ) : (
                                            <span className="text-red-600 font-medium">
                                                {t("hotelReservations.noAvail", "sin disponibilidad ({{n}} libre/s)", { n: freeRooms })}
                                            </span>
                                        )}
                                        {!okMin && (
                                            <>
                                                <span>·</span>
                                                <span className="text-red-600 font-medium">
                                                    {t("hotelReservations.minNights", "mín {{n}} noches", { n: minNights })}
                                                </span>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNewOpen(false)}>{t("common.cancel", "Cancelar")}</Button>
                        <Button
                            className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold"
                            onClick={handleCreate}
                            disabled={createMutation.isPending || simLoading || !okAvail || !okMin || !nf.contact || !nf.experience}
                        >
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                            {t("hotelReservations.createReservation", "Crear reserva")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
