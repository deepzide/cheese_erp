import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Clock, Ticket, Pencil, Trash2, ExternalLink, Save, X } from "lucide-react";
import { toast } from "sonner";
import { experienceService } from "@/api/experienceService";
import { getOccupancy, getOccupancyColor, formatTimeRange, format } from "./calendarUtils";
import { useTranslation } from "react-i18next";

/**
 * Dialog showing full details of a selected slot, with Edit & Delete.
 */
export default function CalendarSlotDetail({ slot, open, onClose }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [scope, setScope] = useState("this");

    const { data: recurrencePayload } = useQuery({
        queryKey: ["slot-recurrence", slot?.name],
        queryFn: async () => {
            const res = await experienceService.getSlotRecurrenceInfo(slot.name);
            return res?.data?.message?.data || res?.data?.data || {};
        },
        enabled: !!slot?.name && open,
    });
    const isRecurring = recurrencePayload?.is_recurring;

    const updateMutation = useMutation({
        mutationFn: async () => {
            return experienceService.updateTimeSlot(slot?.name, editForm, { scope });
        },
        onSuccess: () => {
            toast.success(t("calendar.slotUpdated", "Slot updated"));
            queryClient.invalidateQueries(["calendar-slots"]);
            queryClient.invalidateQueries(["frappe-search"]);
            setEditing(false);
            onClose?.();
        },
        onError: (err) => toast.error(err?.message || t("calendar.updateSlotFailed", "Failed to update slot")),
    });

    const deleteMutation = useMutation({
        mutationFn: async () => experienceService.deleteTimeSlot(slot?.name, { scope }),
        onSuccess: () => {
            toast.success(t("calendar.slotDeleted", "Slot deleted"));
            queryClient.invalidateQueries(["calendar-slots"]);
            onClose?.();
        },
        onError: (err) => toast.error(err?.message || t("calendar.deleteSlotFailed", "Failed to delete slot")),
    });

    if (!slot) return null;

    const occ = getOccupancy(slot.reserved_capacity, slot.max_capacity);
    const colors = getOccupancyColor(slot.reserved_capacity, slot.max_capacity, slot.slot_status);
    const available = Math.max(0, (slot.max_capacity || 0) - (slot.reserved_capacity || 0));

    const statusBadge = {
        OPEN: { label: t("hotelAvailability.open", "Abierto"), className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
        CLOSED: { label: t("status.CLOSED", "Cerrado"), className: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
        BLOCKED: { label: t("hotelAvailability.blocked", "Blocked"), className: "bg-red-500/15 text-red-700 dark:text-red-400" },
    };
    const badge = statusBadge[slot.slot_status] || statusBadge.OPEN;

    const startEditing = () => {
        setEditForm({
            max_capacity: slot.max_capacity || 10,
            slot_status: slot.slot_status || "OPEN",
            date_from: slot.date_from || "",
            date_to: slot.date_to || slot.date_from || "",
            time_from: slot.time_from ? slot.time_from.substring(0, 5) : "",
            time_to: slot.time_to ? slot.time_to.substring(0, 5) : "",
        });
        setEditing(true);
    };

    const handleDelete = () => {
        if (window.confirm(t("calendar.deleteSlotConfirm", "Delete slot {{name}}? This cannot be undone.", { name: slot.name }))) {
            deleteMutation.mutate();
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { setEditing(false); onClose?.(); } }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <div className={`w-3 h-3 rounded-full ${colors.dot}`} />
                        {slot.experience || "Horario"}
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-2 text-xs">
                        <Clock className="w-3 h-3" />
                        {(slot._viewDate || slot.date_from) && format(new Date((slot._viewDate || slot.date_from) + "T00:00:00"), "EEE, MMM d, yyyy")}
                        {" • "}
                        {formatTimeRange(slot.time_from, slot.time_to)}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {isRecurring && (
                        <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
                            <p className="text-xs font-medium text-muted-foreground">{t("calendar.recurrenceScope", "Apply changes to")}</p>
                            <div className="space-y-1.5 text-sm">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="slot-scope" value="this" checked={scope === "this"} onChange={() => setScope("this")} />
                                    {t("calendar.thisSlotOnly", "This slot only")}
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="slot-scope" value="following" checked={scope === "following"} onChange={() => setScope("following")} />
                                    {t("calendar.thisAndFollowing", "This and following slots")} ({recurrencePayload?.following_count || 0})
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="slot-scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} />
                                    {t("calendar.allSlotsInSeries", "All slots in series")} ({recurrencePayload?.total_count || 0})
                                </label>
                            </div>
                        </div>
                    )}
                    {editing ? (
                        /* Edit mode */
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">{t("calendar.maxCapacity", "Max Capacity")}</Label>
                                <Input type="number" min="1" value={editForm.max_capacity} onChange={(e) => setEditForm(f => ({ ...f, max_capacity: parseInt(e.target.value) || 1 }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">{t("common.status", "Status")}</Label>
                                <select value={editForm.slot_status} onChange={(e) => setEditForm(f => ({ ...f, slot_status: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                    <option value="OPEN">{t("hotelAvailability.open", "Abierto")}</option>
                                    <option value="CLOSED">{t("status.CLOSED", "Cerrado")}</option>
                                    <option value="BLOCKED">{t("hotelAvailability.blocked", "Bloqueado")}</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">{t("hotelAvailability.dateFrom", "Date From")}</Label>
                                <Input type="date" value={editForm.date_from} onChange={(e) => setEditForm(f => ({ ...f, date_from: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">{t("hotelAvailability.dateTo", "Date To")}</Label>
                                <Input type="date" value={editForm.date_to} onChange={(e) => setEditForm(f => ({ ...f, date_to: e.target.value }))} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">{t("calendar.time", "Time From")}</Label>
                                    <Input type="time" value={editForm.time_from} onChange={(e) => setEditForm(f => ({ ...f, time_from: e.target.value }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">{t("calendar.time", "Time To")}</Label>
                                    <Input type="time" value={editForm.time_to} onChange={(e) => setEditForm(f => ({ ...f, time_to: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* View mode */
                        <>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{t("common.status", "Status")}</span>
                                <Badge className={badge.className}>{badge.label}</Badge>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">{t("calendar.capacity", "Capacity")}</span>
                                    <span className="text-sm font-semibold flex items-center gap-1">
                                        <Users className="w-3.5 h-3.5" />
                                        {slot.reserved_capacity || 0} / {slot.max_capacity || "—"}
                                    </span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-2">
                                    <div className={`h-2 rounded-full transition-all ${colors.bar}`} style={{ width: `${Math.min(occ, 100)}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>{occ}% {t("calendar.occupied", "ocupado")}</span>
                                    <span>{available} {t("hotelAvailability.available", "disponible")}</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{t("calendar.slot", "ID del Horario")}</span>
                                <span className="text-xs font-mono text-muted-foreground">{slot.name}</span>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="flex-wrap gap-2 sm:gap-2">
                    {editing ? (
                        <>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                                <X className="w-3.5 h-3.5 mr-1" /> {t("common.cancel", "Cancel")}
                            </Button>
                            <Button size="sm" className="bg-cheese-500 hover:bg-cheese-600 text-black" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                                <Save className="w-3.5 h-3.5 mr-1" /> {t("common.save", "Save")}
                            </Button>
                        </>
                    ) : (
                        <div className="grid grid-cols-2 gap-2 w-full">
                            {slot.slot_status === "OPEN" && available > 0 && (
                                <Button size="sm" className="bg-cheese-500 hover:bg-cheese-600 text-black" onClick={() => navigate(`/cheese/tickets/new?experience=${encodeURIComponent(slot.experience || "")}&slot=${encodeURIComponent(slot.name)}&date=${encodeURIComponent(slot._viewDate || slot.date_from || "")}`)}>
                                    <Ticket className="w-3.5 h-3.5 mr-1.5" /> {t("ticket.createTicket", "Crear Ticket")}
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => navigate(`/cheese/tickets?slot=${slot.name}`)}>
                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> {t("experiences.viewTickets", "Ver Tickets")}
                            </Button>
                            <Button variant="outline" size="sm" onClick={startEditing}>
                                <Pencil className="w-3.5 h-3.5 mr-1" /> {t("common.edit", "Editar")}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteMutation.isPending}>
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> {t("common.delete", "Eliminar")}
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
