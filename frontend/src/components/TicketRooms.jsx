import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { DoorOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { roomService } from "@/api/roomService";
import { unwrapFrappeMethodData } from "@/api/client";

const STAY_BADGE = {
    RESERVED: "bg-cheese-500/15 text-cheese-700",
    OCCUPIED: "bg-red-500/15 text-red-700 dark:text-red-400",
    COMPLETED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    CANCELLED: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
};

/** Physical room assignments of a HOTEL ticket (auto on check-in + manual). */
export default function TicketRooms({ ticketId, isHotel }) {
    const { t } = useTranslation();
    const [selectedRoom, setSelectedRoom] = useState("");
    const [working, setWorking] = useState(false);

    const { data, refetch } = useQuery({
        queryKey: ["ticket-rooms", ticketId],
        queryFn: async () => unwrapFrappeMethodData(await roomService.getTicketRooms(ticketId), {}),
        enabled: !!ticketId && !!isHotel,
    });

    if (!isHotel || !data) return null;
    const stays = data.stays || [];
    const freeRooms = data.free_rooms || [];
    const activeStays = stays.filter(s => ["RESERVED", "OCCUPIED"].includes(s.status));

    const handleAssign = async () => {
        if (!selectedRoom) return;
        setWorking(true);
        try {
            await roomService.assignRoom(ticketId, selectedRoom);
            toast.success(t("rooms.assigned", "Habitación asignada"));
            setSelectedRoom("");
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setWorking(false);
        }
    };

    const handleRelease = async (stay) => {
        setWorking(true);
        try {
            await roomService.releaseStay(stay.name);
            toast.success(t("rooms.released", "Asignación liberada"));
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setWorking(false);
        }
    };

    return (
        <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <DoorOpen className="w-4 h-4 text-cheese-600" />
                    {t("rooms.assignedRooms", "Habitaciones asignadas")}
                    <span className="text-xs text-muted-foreground font-normal">
                        {activeStays.length}/{data.rooms_requested}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
                {stays.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                        {t("rooms.noneAssigned", "Sin habitación asignada aún — se asigna automáticamente al check-in, o hazlo manualmente aquí.")}
                    </p>
                )}
                {stays.map((stay) => (
                    <div key={stay.name} className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">{t("rooms.room", "Hab.")} {stay.room_number || stay.room}</span>
                        <Badge className={STAY_BADGE[stay.status] || ""}>{stay.status}</Badge>
                        {["RESERVED", "OCCUPIED"].includes(stay.status) && (
                            <Button variant="ghost" size="sm" className="h-7 text-red-500" disabled={working} onClick={() => handleRelease(stay)}>
                                {t("rooms.release", "Liberar")}
                            </Button>
                        )}
                    </div>
                ))}
                {freeRooms.length > 0 && (
                    <div className="flex gap-2 pt-2 border-t border-border">
                        <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}
                            className="flex h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                            <option value="">{t("rooms.pickFree", "Elegir habitación libre...")}</option>
                            {freeRooms.map(r => (
                                <option key={r.name} value={r.name}>{r.room_number}{r.floor ? ` (piso ${r.floor})` : ""}</option>
                            ))}
                        </select>
                        <Button size="sm" className="h-8 bg-cheese-500 hover:bg-cheese-600 text-black font-semibold"
                            disabled={!selectedRoom || working} onClick={handleAssign}>
                            {t("rooms.assign", "Asignar")}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
