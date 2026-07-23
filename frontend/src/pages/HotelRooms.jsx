import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { DoorOpen, Plus, RefreshCw, Wrench, Ban, CheckCircle2, Trash2, CheckSquare, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CompanySelect from "@/components/CompanySelect";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
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
    const { activeEstablishment, establishments } = useActiveEstablishment();

    // Hotel-only selector: follows the global establishment selector when it
    // points at a hotel; otherwise it clears and asks the user to pick one.
    const hotels = useMemo(
        () => (Array.isArray(establishments) ? establishments.filter((e) => e.is_hotel) : []),
        [establishments]
    );
    const globalIsHotel = !!activeEstablishment && hotels.some((h) => h.company_id === activeEstablishment);
    const notifiedRef = React.useRef(null);
    React.useEffect(() => {
        if (!isAdmin) return;
        if (!establishments?.length) return; // wait for profiles to load
        if (globalIsHotel) {
            setCompany(activeEstablishment);
            notifiedRef.current = null;
            return;
        }
        setCompany("");
        const key = activeEstablishment || "__all__";
        if (notifiedRef.current !== key) {
            notifiedRef.current = key;
            toast.info(
                activeEstablishment
                    ? t("rooms.pickHotelNoticeNonHotel", "La empresa seleccionada globalmente no es un hotel. Selecciona un hotel en el selector de Habitaciones.")
                    : t("rooms.pickHotelNoticeAll", "El selector global está en \"Toda la ruta\". Selecciona un hotel en el selector de Habitaciones.")
            );
        }
    }, [isAdmin, establishments?.length, globalIsHotel, activeEstablishment, t]);

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

    // Multi-selection: bulk maintenance / out-of-service / block / delete.
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState(() => new Set());
    const [bulkBlock, setBulkBlock] = useState(null); // { date_from, date_to, reason } while open
    React.useEffect(() => { setSelected(new Set()); setSelectMode(false); }, [effectiveCompany]);

    const toggleSelect = (name) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name); else next.add(name);
        return next;
    });
    const clearSelection = () => setSelected(new Set());
    const exitSelectMode = () => { setSelectMode(false); clearSelection(); };
    const bulkIds = () => Array.from(selected);

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

    const handleDeleteRoom = async (room) => {
        if (!window.confirm(t("rooms.deleteConfirm", "¿Eliminar la habitación {{n}}? Se borrarán sus bloqueos e historial de estadías. No se puede deshacer.", { n: room.room_number }))) return;
        try {
            await roomService.deleteRoom(room.name);
            toast.success(t("rooms.deleted", "Habitación eliminada"));
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    const handleBulkStatus = async (status) => {
        try {
            const payload = unwrapFrappeMethodData(await roomService.bulkSetStatus(bulkIds(), status), {});
            toast.success(t("rooms.bulkStatusDone", "{{n}} habitación(es) actualizadas", { n: payload?.updated?.length ?? 0 }));
            clearSelection();
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(t("rooms.bulkDeleteConfirm", "¿Eliminar {{n}} habitación(es)? Se omitirán las que tengan reservas activas. No se puede deshacer.", { n: selected.size }))) return;
        try {
            const payload = unwrapFrappeMethodData(await roomService.bulkDelete(bulkIds()), {});
            toast.success(t("rooms.bulkDeleteDone", "{{n}} habitación(es) eliminadas", { n: payload?.deleted?.length ?? 0 }));
            if (payload?.skipped_in_use?.length) {
                toast.warning(t("rooms.bulkDeleteSkipped", "Omitidas por tener reservas activas: {{n}}", { n: payload.skipped_in_use.length }));
            }
            clearSelection();
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    const handleBulkBlock = async () => {
        if (!bulkBlock?.date_from || !bulkBlock?.date_to) {
            toast.error(t("rooms.blockDatesRequired", "Fechas de bloqueo requeridas"));
            return;
        }
        try {
            const payload = unwrapFrappeMethodData(await roomService.bulkBlock({
                room_ids: bulkIds(),
                date_from: bulkBlock.date_from,
                date_to: bulkBlock.date_to,
                reason: bulkBlock.reason || undefined,
            }), {});
            toast.success(t("rooms.bulkBlockDone", "{{n}} habitación(es) bloqueadas", { n: payload?.blocked?.length ?? 0 }));
            if (payload?.failed?.length) {
                toast.warning(t("rooms.bulkBlockFailed", "No se pudieron bloquear: {{n}}", { n: payload.failed.length }));
            }
            setBulkBlock(null);
            clearSelection();
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
                <div className="flex flex-wrap items-center gap-2">
                    {isAdmin && (
                        <select
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            className={`flex h-9 rounded-md border bg-background px-3 text-sm shadow-sm ${company ? "border-input" : "border-cheese-500 text-muted-foreground"}`}
                            aria-label={t("rooms.pickHotelPlaceholder", "Selecciona un hotel")}
                        >
                            <option value="">{t("rooms.pickHotelPlaceholder", "— Selecciona un hotel —")}</option>
                            {hotels.map((h) => (
                                <option key={h.company_id} value={h.company_id}>🏨 {h.company_name}</option>
                            ))}
                        </select>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading}>
                        <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                        variant={selectMode ? "secondary" : "outline"}
                        onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                        disabled={!effectiveCompany || rooms.length === 0}
                    >
                        <CheckSquare className="w-4 h-4 mr-1" /> {selectMode ? t("rooms.selDone", "Listo") : t("rooms.select", "Seleccionar")}
                    </Button>
                    <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={() => setBulkOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> {t("rooms.bulkAdd", "Alta masiva")}
                    </Button>
                </div>
            </div>

            {!effectiveCompany ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                    {t("rooms.selectHotelInPage", "Selecciona un hotel en el selector de esta página para ver sus habitaciones")}
                </CardContent></Card>
            ) : rooms.length === 0 && !isLoading ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                    {t("rooms.empty", "Sin habitaciones registradas. Usa \"Alta masiva\" para numerarlas por tipo.")}
                </CardContent></Card>
            ) : (
                Object.entries(grouped).map(([type, typeRooms]) => (
                    <div key={type} className="space-y-2">
                        <div className="flex items-center gap-3">
                            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                {type} · {typeRooms.length} {t("rooms.rooms", "habitaciones")}
                            </h2>
                            {selectMode && (
                                <button
                                    type="button"
                                    className="text-xs text-cheese-700 font-medium"
                                    onClick={() => setSelected((prev) => {
                                        const next = new Set(prev);
                                        const all = typeRooms.every((r) => next.has(r.name));
                                        typeRooms.forEach((r) => (all ? next.delete(r.name) : next.add(r.name)));
                                        return next;
                                    })}
                                >
                                    {typeRooms.every((r) => selected.has(r.name))
                                        ? t("rooms.unselectGroup", "Quitar todas")
                                        : t("rooms.selectGroup", "Seleccionar todas")}
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {typeRooms.map((room) => {
                                const badge = STATE_BADGE[room.today_state] || STATE_BADGE.FREE;
                                return (
                                    <Card key={room.name} className={`glass-surface ${selectMode && selected.has(room.name) ? "ring-2 ring-cheese-500" : ""}`}>
                                        <CardContent className="p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-2 min-w-0">
                                                    {selectMode && (
                                                        <input
                                                            type="checkbox"
                                                            className="h-4 w-4 accent-cheese-500 shrink-0"
                                                            checked={selected.has(room.name)}
                                                            onChange={() => toggleSelect(room.name)}
                                                        />
                                                    )}
                                                    <span className="font-bold text-lg">{room.room_number}</span>
                                                </span>
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
                                                        <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteRoom(room)}>
                                                            <Trash2 className="w-3 h-3 mr-2" /> {t("rooms.delete", "Eliminar")}
                                                        </DropdownMenuItem>
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
                        {isAdmin && (
                            <div className="space-y-1">
                                <Label>{t("common.company", "Hotel")} <span className="text-red-500">*</span></Label>
                                <CompanySelect value={company} onChange={setCompany} filters={{ cheese_is_hotel: 1 }} />
                                <p className="text-xs text-muted-foreground">{t("rooms.companyPickHint", "Elige el hotel para poder listar sus tipos de habitación.")}</p>
                            </div>
                        )}
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

            {/* Bulk block range */}
            <Dialog open={!!bulkBlock} onOpenChange={(open) => { if (!open) setBulkBlock(null); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t("rooms.bulkBlockTitle", "Bloquear {{n}} habitaciones", { n: selected.size })}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>{t("common.from", "Desde")}</Label>
                                <Input type="date" value={bulkBlock?.date_from || ""} onChange={(e) => setBulkBlock((f) => ({ ...f, date_from: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("common.to", "Hasta")}</Label>
                                <Input type="date" value={bulkBlock?.date_to || ""} onChange={(e) => setBulkBlock((f) => ({ ...f, date_to: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>{t("rooms.reason", "Motivo")}</Label>
                            <Input placeholder="Pintura, reparación..." value={bulkBlock?.reason || ""} onChange={(e) => setBulkBlock((f) => ({ ...f, reason: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setBulkBlock(null)}>{t("common.cancel", "Cancelar")}</Button>
                        <Button variant="destructive" onClick={handleBulkBlock}>{t("rooms.block", "Bloquear")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Floating bulk-action bar */}
            {selectMode && selected.size > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
                    <span className="text-sm font-medium">{t("rooms.nSelected", "{{n}} seleccionadas", { n: selected.size })}</span>
                    <div className="h-4 w-px bg-border mx-1" />
                    <Button variant="outline" size="sm" onClick={() => handleBulkStatus("ACTIVE")}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {t("rooms.activate", "Activar")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleBulkStatus("MAINTENANCE")}>
                        <Wrench className="w-3.5 h-3.5 mr-1" /> {t("rooms.maintenance", "Mantenimiento")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleBulkStatus("OUT_OF_SERVICE")}>
                        <Ban className="w-3.5 h-3.5 mr-1" /> {t("rooms.outOfService", "Fuera de servicio")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setBulkBlock({ date_from: "", date_to: "", reason: "" })}>
                        <Ban className="w-3.5 h-3.5 mr-1" /> {t("rooms.blockRange", "Bloquear fechas")}
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-600" onClick={handleBulkDelete}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> {t("rooms.delete", "Eliminar")}
                    </Button>
                    <button type="button" onClick={clearSelection} className="p-1 rounded hover:bg-muted" aria-label={t("common.clear", "Limpiar")}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </motion.div>
    );
}
