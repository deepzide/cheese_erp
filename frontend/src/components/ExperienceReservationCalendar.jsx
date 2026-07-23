import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ChevronLeft, ChevronRight, Ticket, Users } from "lucide-react";
import { useFrappeList } from "@/lib/useApiData";
import CalendarMonthView from "@/components/calendar/CalendarMonthView";
import { format, navigate as nav, startOfMonth, endOfMonth } from "@/components/calendar/calendarUtils";

/**
 * Month reservation calendar for a single (non-hotel) experience — identical to
 * the /cheese/calendar month view but scoped to this experience. Clicking a day
 * lists every ticket that occupies a spot of this experience that day, each
 * linking to its ticket detail.
 */
export default function ExperienceReservationCalendar({ experienceId }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [monthDate, setMonthDate] = useState(new Date());
    const [lens, setLens] = useState("ocup");
    const [selectedDay, setSelectedDay] = useState(null);

    const from = format(startOfMonth(monthDate), "yyyy-MM-dd");
    const to = format(endOfMonth(monthDate), "yyyy-MM-dd");

    const { data: slotsRaw = [], isLoading } = useFrappeList("Cheese Experience Slot", {
        enabled: !!experienceId,
        filters: {
            experience: experienceId,
            date_from: ["<=", to],
            date_to: [">=", from],
        },
        fields: ["name", "experience", "date_from", "date_to", "time_from", "time_to", "max_capacity", "reserved_capacity", "slot_status"],
        pageSize: 500,
    });
    const slots = Array.isArray(slotsRaw) ? slotsRaw : [];

    // Tickets occupying this experience on the selected day (exclude cancelled/expired).
    const { data: dayTickets = [], isLoading: ticketsLoading } = useFrappeList("Cheese Ticket", {
        enabled: !!experienceId && !!selectedDay,
        filters: {
            experience: experienceId,
            selected_date: selectedDay,
            status: ["not in", ["CANCELLED", "EXPIRED"]],
        },
        fields: ["name", "contact", "party_size", "status", "total_price", "currency", "selected_date"],
        pageSize: 200,
        orderBy: "creation desc",
    });

    const handleDayClick = useCallback((day) => setSelectedDay(format(day, "yyyy-MM-dd")), []);
    const goPrev = () => { setSelectedDay(null); setMonthDate(nav.month.prev(monthDate)); };
    const goNext = () => { setSelectedDay(null); setMonthDate(nav.month.next(monthDate)); };
    const title = nav.month.title(monthDate);

    return (
        <Card className="border-border/60 shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                        <CalendarDays className="w-4 h-4 mr-2" /> {t("expReservations.title", "Calendario de reservas")}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Tabs value={lens} onValueChange={setLens}>
                            <TabsList className="h-8">
                                <TabsTrigger value="ocup" className="text-xs px-3 h-6">{t("calendar.viewOccupancy", "Ocupación")}</TabsTrigger>
                                <TabsTrigger value="disp" className="text-xs px-3 h-6">{t("calendar.viewAvailability", "Lugares disponibles")}</TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <button type="button" onClick={goPrev} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label={t("priceCalendar.prevMonth", "Mes anterior")}>
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium capitalize min-w-[9rem] text-center">{title}</span>
                        <button type="button" onClick={goNext} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label={t("priceCalendar.nextMonth", "Mes siguiente")}>
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                {isLoading ? (
                    <Skeleton className="h-[400px] w-full rounded-lg" />
                ) : (
                    <CalendarMonthView date={monthDate} slots={slots} lens={lens} onDayClick={handleDayClick} />
                )}

                {selectedDay && (
                    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="font-semibold text-sm flex items-center gap-2">
                                <Ticket className="w-4 h-4 text-cheese-600" />
                                {t("expReservations.ticketsOn", "Reservas del {{date}}", { date: selectedDay })}
                            </p>
                            <Badge variant="outline" className="text-xs">{dayTickets.length}</Badge>
                        </div>
                        {ticketsLoading ? (
                            <Skeleton className="h-10 w-full" />
                        ) : dayTickets.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t("expReservations.noTickets", "No hay reservas para este día.")}</p>
                        ) : (
                            <div className="divide-y divide-border/50">
                                {dayTickets.map((tk) => (
                                    <button
                                        key={tk.name}
                                        type="button"
                                        onClick={() => navigate(`/cheese/tickets/${encodeURIComponent(tk.name)}`)}
                                        className="w-full flex items-center justify-between gap-3 py-2 px-2 text-left rounded-md hover:bg-muted/50 transition-colors"
                                    >
                                        <span className="min-w-0">
                                            <span className="font-medium text-sm truncate block">{tk.name}</span>
                                            {tk.contact && <span className="text-xs text-muted-foreground truncate block">{tk.contact}</span>}
                                        </span>
                                        <span className="flex items-center gap-3 shrink-0">
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Users className="w-3 h-3" /> {tk.party_size || 0}
                                            </span>
                                            <Badge variant="outline" className="text-xs">{t(`status.${tk.status}`, tk.status)}</Badge>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
