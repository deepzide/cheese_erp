import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { DoorOpen, Plus, RefreshCw, Wrench, Ban, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CompanySelect from "@/components/CompanySelect";
import { roomService } from "@/api/roomService";
import { unwrapFrappeMethodData } from "@/api/client";
import { useFrappeList } from "@/lib/useApiData";
import { useHotelAccess } from "@/lib/useHotelAccess";

const STATE_BADGE = {
    FREE: { label: "Libre", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    RESERVED: { label: "Reservada", cls: "bg-cheese-500/15 text-cheese-700" },
    OCCUPIED: { label: "Ocupada", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
    BLOCKED: { label: "Bloqueada", cls: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
    MAINTENANCE: { label: "Mantenimiento", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    OUT_OF_SERVICE: { label: "Fuera de servicio", cls: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
};

const EMPTY_BULK = { room_type: "", quantity: "1", start_number: "101", floor: "", prefix: "" };
const EMPTY_BLOCK = { room: null, date_from: "", date_to: "", reason: "" };

export default function HotelRooms() {
    const { t } = useTranslation();
    const { isAdmin, userCompanies } = useHotelAccess();
    const ownCompany = (Array.isArray(userCompanies) && userCompanies[0]) || "";
    const [company, setCompany] = useState("");
    const effectiveCompany = isAdmin ? company : ownCompany;

    const { data, isLoading, refetch } = useQuery({
        queryKey: ["hotel-rooms", effectiveCompany],
        queryFn: async () => unwrapFrappeMethodData(await roomService.listRooms({ company: effectiveCompany }), {}),
        enabled: !!effectiveCompany,
    });
    const rooms = data?.rooms || [];

    const { data: roomTypes = [] } = useFrappeList("Cheese Experience", {
        enabled: !!effectiveCompany,
        filters: { company: effectiveCompany, experience_type: "HOTEL" },
        fields: ["name"],
        pageSize: 100,
    });

    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulk, setBulk] = useState(EMPTY_BULK);
    const [blockForm, setBlockForm] = useState(EMPTY_BLOCK);

    const grouped = useMemo(() => {
        const map = {};
        rooms.forEach(r => { (map[r.room_type] = map[r.room_type] || []).push(r); });
        return map;
    }, [rooms]);

    const handleBulkCreate = async () => {
        if (!bulk.room_type || parseInt(bulk.quantity) < 1) {
            toast.error(t("rooms.bulkRequired", "Tipo de habitación y cantidad son requeridos"));
            return;
        }
        try {
            const res = await roomService.bulkCreate({
                room_type: bulk.room_type,
                quantity: parseInt(bulk.quantity),
                start_number: parseInt(bulk.start_number) || 1,
                floor: bulk.floor || undefined,
                prefix: bulk.prefix || "",
            });
            const payload = unwrapFrappeMethodData(res, {});
            toast.success(t("rooms.bulkCreated", "{{count}} habitación(es) creadas", { count: payload?.created?.length ?? 0 }));
            if (payload?.skipped_existing?.length) {
                toast.warning(t("rooms.bulkSkipped", "Omitidas por existir: {{list}}", { list: payload.skipped_existing.join(", ") }));
            }
            setBulkOpen(false);
            setBulk(EMPTY_BULK);
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    const handleSetStatus = async (room, status) => {
        try {
            await roomService.setStatus(room.name, status);
            toast.success(t("rooms.statusUpdated", "Estado actualizado"));
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    const handleBlock = async () => {
        if (!blockForm.date_from || !blockForm.date_to) {
            toast.error(t("rooms.blockDatesRequired", "Fechas de bloqueo requeridas"));
            return;
        }
        try {
            await roomService.blockRoom({
                room_id: blockForm.room.name,
                date_from: blockForm.date_from,
                date_to: blockForm.date_to,
                reason: blockForm.reason || undefined,
            });
            toast.success(t("rooms.blocked", "Habitación bloqueada"));
            setBlockForm(EMPTY_BLOCK);
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    const handleRelease = async (room) => {
        if (!room.current_stay) return;
        try {
            await roomService.releaseStay(room.current_stay.name);
            toast.success(t("rooms.released", "Estadía liberada"));
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <DoorOpen className="w-6 h-6 text-cheese-600" />
                        {t("rooms.title", "Habitaciones")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("rooms.description", "Habitaciones físicas por tipo, con su ocupación de hoy. La reserva sigue siendo por tipo; la habitación se asigna en el check-in o manualmente.")}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading}>
                        <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                    </Button>
                    <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={() => setBulkOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> {t("rooms.bulkAdd", "Alta masiva")}
                    </Button>
                </div>
            </div>

            {isAdmin && (
                <div className="max-w-xs space-y-1">
                    <Label>{t("common.company", "Hotel")}</Label>
                    <CompanySelect value={company} onChange={setCompany} />
                </div>
            )}

            {!effectiveCompany ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                    {t("rooms.selectHotel", "Selecciona un hotel para ver sus habitaciones")}
                </CardContent></Card>
            ) : rooms.length === 0 && !isLoading ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                    {t("rooms.empty", "Sin habitaciones registradas. Usa \"Alta masiva\" para numerarlas por tipo.")}
                </CardContent></Card>
            ) : (
                Object.entries(grouped).map(([type, typeRooms]) => (
                    <div key={type} className="space-y-2">
                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            {type} · {typeRooms.length} {t("rooms.rooms", "habitaciones")}
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {typeRooms.map((room) => {
                                const badge = STATE_BADGE[room.today_state] || STATE_BADGE.FREE;
                                return (
                                    <Card key={room.name} className="glass-surface">
                                        <CardContent className="p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-lg">{room.room_number}</span>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7">⋯</Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        {room.status !== "ACTIVE" && (
                                                            <DropdownMenuItem onClick={() => handleSetStatus(room, "ACTIVE")}>
                                                                <CheckCircle2 className="w-3 h-3 mr-2" /> {t("rooms.activate", "Activar")}
                                                            </DropdownMenuItem>
                                                        )}
                                                        {room.status !== "MAINTENANCE" && (
                                                            <DropdownMenuItem onClick={() => handleSetStatus(room, "MAINTENANCE")}>
                                                                <Wrench className="w-3 h-3 mr-2" /> {t("rooms.maintenance", "Mantenimiento")}
                                                            </DropdownMenuItem>
                                                        )}
                                                        {room.status !== "OUT_OF_SERVICE" && (
                                                            <DropdownMenuItem onClick={() => handleSetStatus(room, "OUT_OF_SERVICE")}>
                                                                <Ban className="w-3 h-3 mr-2" /> {t("rooms.outOfService", "Fuera de servicio")}
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem onClick={() => setBlockForm({ ...EMPTY_BLOCK, room })}>
                                                            <Ban className="w-3 h-3 mr-2" /> {t("rooms.blockRange", "Bloquear fechas")}
                                                        </DropdownMenuItem>
                                                        {room.current_stay && (
                                                            <DropdownMenuItem className="text-red-600" onClick={() => handleRelease(room)}>
                                                                {t("rooms.release", "Liberar estadía actual")}
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                            <Badge className={badge.cls}>{t(`rooms.state${room.today_state}`, badge.label)}</Badge>
                                            {room.floor && <p className="text-[11px] text-muted-foreground">{t("rooms.floor", "Piso")} {room.floor}</p>}
                                            {room.current_stay?.ticket && (
                                                <p className="text-[11px] text-muted-foreground font-mono truncate">{room.current_stay.ticket}</p>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}

            {/* Bulk create */}
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>{t("rooms.bulkAdd", "Alta masiva de habitaciones")}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label>{t("rooms.roomType", "Tipo de habitación")}</Label>
                            <select value={bulk.room_type} onChange={(e) => setBulk(b => ({ ...b, room_type: e.target.value }))}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm">
                                <option value="">—</option>
                                {roomTypes.map(rt => <option key={rt.name} value={rt.name}>{rt.name}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>{t("rooms.quantity", "Cantidad")}</Label>
                                <Input type="number" min="1" value={bulk.quantity} onChange={(e) => setBulk(b => ({ ...b, quantity: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("rooms.startNumber", "Número inicial")}</Label>
                                <Input type="number" value={bulk.start_number} onChange={(e) => setBulk(b => ({ ...b, start_number: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("rooms.prefix", "Prefijo (opc.)")}</Label>
                                <Input placeholder="A-" value={bulk.prefix} onChange={(e) => setBulk(b => ({ ...b, prefix: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("rooms.floor", "Piso (opc.)")}</Label>
                                <Input placeholder="1" value={bulk.floor} onChange={(e) => setBulk(b => ({ ...b, floor: e.target.value }))} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setBulkOpen(false)}>{t("common.cancel", "Cancelar")}</Button>
                        <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={handleBulkCreate}>
                            {t("common.create", "Crear")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Block range */}
            <Dialog open={!!blockForm.room} onOpenChange={(open) => { if (!open) setBlockForm(EMPTY_BLOCK); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t("rooms.blockTitle", "Bloquear habitación")} {blockForm.room?.room_number}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>{t("common.from", "Desde")}</Label>
                                <Input type="date" value={blockForm.date_from} onChange={(e) => setBlockForm(f => ({ ...f, date_from: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("common.to", "Hasta")}</Label>
                                <Input type="date" value={blockForm.date_to} onChange={(e) => setBlockForm(f => ({ ...f, date_to: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>{t("rooms.reason", "Motivo")}</Label>
                            <Input placeholder="Pintura, reparación..." value={blockForm.reason} onChange={(e) => setBlockForm(f => ({ ...f, reason: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setBlockForm(EMPTY_BLOCK)}>{t("common.cancel", "Cancelar")}</Button>
                        <Button variant="destructive" onClick={handleBlock}>{t("rooms.block", "Bloquear")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
