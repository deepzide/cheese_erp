import React from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, Ticket, Ban, ExternalLink } from "lucide-react";
import { getOccupancy, getOccupancyColor, formatTimeRange, format } from "./calendarUtils";

/**
 * Dialog showing full details of a selected slot.
 */
export default function CalendarSlotDetail({ slot, open, onClose }) {
    const navigate = useNavigate();

    if (!slot) return null;

    const occ = getOccupancy(slot.reserved_capacity, slot.max_capacity);
    const colors = getOccupancyColor(slot.reserved_capacity, slot.max_capacity, slot.slot_status);
    const available = Math.max(0, (slot.max_capacity || 0) - (slot.reserved_capacity || 0));

    const statusBadge = {
        OPEN: { label: "Open", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
        CLOSED: { label: "Closed", className: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
        BLOCKED: { label: "Blocked", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
    };
    const badge = statusBadge[slot.slot_status] || statusBadge.OPEN;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <div className={`w-3 h-3 rounded-full ${colors.dot}`} />
                        {slot.experience || "Slot"}
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-2 text-xs">
                        <Clock className="w-3 h-3" />
                        {slot.date_from && format(new Date(slot.date_from + "T00:00:00"), "EEE, MMM d, yyyy")}
                        {" • "}
                        {formatTimeRange(slot.time_from, slot.time_to)}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Status */}
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Status</span>
                        <Badge className={badge.className}>{badge.label}</Badge>
                    </div>

                    {/* Capacity */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Capacity</span>
                            <span className="text-sm font-semibold flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" />
                                {slot.reserved_capacity || 0} / {slot.max_capacity || "—"}
                            </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all ${colors.bar}`}
                                style={{ width: `${Math.min(occ, 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{occ}% occupied</span>
                            <span>{available} available</span>
                        </div>
                    </div>

                    {/* Slot ID */}
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Slot ID</span>
                        <span className="text-xs font-mono text-muted-foreground">{slot.name}</span>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    {slot.slot_status === "OPEN" && available > 0 && (
                        <Button
                            size="sm"
                            className="bg-cheese-500 hover:bg-cheese-600 text-black"
                            onClick={() => navigate(`/cheese/tickets/new?experience=${encodeURIComponent(slot.experience || "")}&slot=${encodeURIComponent(slot.name)}`)}
                        >
                            <Ticket className="w-3.5 h-3.5 mr-1.5" />
                            Create Ticket
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/cheese/tickets?slot=${slot.name}`)}
                    >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        View Tickets
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
