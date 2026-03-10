import React, { useRef, useEffect, useState } from "react";
import {
    isToday, isSameDay, format, getWeekDays, getHours,
    getSlotPosition, getNowPosition, HOUR_HEIGHT, TOTAL_HOURS, formatHour,
} from "./calendarUtils";
import CalendarSlotCard from "./CalendarSlotCard";

/**
 * Week view — 7-column hourly time grid (Google Calendar style).
 */
export default function CalendarWeekView({ date, slots, onSlotClick, onEmptyClick, onDayClick }) {
    const containerRef = useRef(null);
    const [nowPos, setNowPos] = useState(getNowPosition());
    const hours = getHours();
    const weekDays = getWeekDays(date);
    const todayInView = weekDays.some((d) => isToday(d));

    // Update now indicator
    useEffect(() => {
        if (!todayInView) return;
        const interval = setInterval(() => setNowPos(getNowPosition()), 60_000);
        return () => clearInterval(interval);
    }, [todayInView]);

    // Scroll to working hours on mount
    useEffect(() => {
        if (containerRef.current) {
            const scrollTo = todayInView ? Math.max(0, nowPos - 200) : 8 * HOUR_HEIGHT;
            containerRef.current.scrollTop = scrollTo;
        }
    }, [date]);

    // Group slots by date
    const slotsByDay = {};
    weekDays.forEach((d) => {
        const key = format(d, "yyyy-MM-dd");
        slotsByDay[key] = slots.filter((s) => s.date_from === key);
    });

    const handleColumnClick = (day, e) => {
        const col = e.currentTarget;
        const rect = col.getBoundingClientRect();
        const y = e.clientY - rect.top + (containerRef.current?.scrollTop || 0);
        const hour = Math.floor(y / HOUR_HEIGHT);
        onEmptyClick?.(day, hour);
    };

    return (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
            {/* Day headers */}
            <div className="flex border-b border-border sticky top-0 z-30 bg-card">
                <div className="w-16 flex-shrink-0 border-r border-border" />
                {weekDays.map((day) => {
                    const today = isToday(day);
                    return (
                        <div
                            key={day.toISOString()}
                            className={`flex-1 text-center py-2 border-r border-border/50 last:border-r-0 cursor-pointer
                                hover:bg-muted/50 transition-colors
                                ${today ? "bg-cheese-50/50 dark:bg-cheese-950/20" : ""}`}
                            onClick={() => onDayClick?.(day)}
                        >
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {format(day, "EEE")}
                            </div>
                            <div
                                className={`text-lg font-semibold mt-0.5
                                    ${today ? "w-8 h-8 mx-auto rounded-full bg-cheese-500 text-black flex items-center justify-center" : ""}`}
                            >
                                {format(day, "d")}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Scrollable grid */}
            <div ref={containerRef} className="overflow-auto max-h-[calc(100vh-310px)]">
                <div className="flex" style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}>
                    {/* Time gutter */}
                    <div className="w-16 flex-shrink-0 border-r border-border bg-muted/30">
                        {hours.map((hour) => (
                            <div
                                key={hour}
                                className="border-b border-border/50 text-[10px] text-muted-foreground pr-2 text-right pt-0.5"
                                style={{ height: HOUR_HEIGHT }}
                            >
                                {formatHour(hour)}
                            </div>
                        ))}
                    </div>

                    {/* Day columns */}
                    {weekDays.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        const daySlots = slotsByDay[key] || [];
                        const today = isToday(day);

                        return (
                            <div
                                key={key}
                                className={`flex-1 relative border-r border-border/30 last:border-r-0
                                    ${today ? "bg-cheese-50/20 dark:bg-cheese-950/10" : ""}`}
                                onClick={(e) => handleColumnClick(day, e)}
                            >
                                {/* Hour lines */}
                                {hours.map((hour) => (
                                    <div
                                        key={hour}
                                        className="border-b border-border/20"
                                        style={{ height: HOUR_HEIGHT }}
                                    />
                                ))}

                                {/* Now indicator */}
                                {today && (
                                    <div
                                        className="absolute left-0 right-0 z-20 pointer-events-none"
                                        style={{ top: nowPos }}
                                    >
                                        <div className="flex items-center">
                                            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                                            <div className="flex-1 h-[2px] bg-red-500" />
                                        </div>
                                    </div>
                                )}

                                {/* Slot events */}
                                {daySlots.map((slot) => {
                                    const pos = getSlotPosition(slot.time_from, slot.time_to);
                                    return (
                                        <CalendarSlotCard
                                            key={slot.name}
                                            slot={slot}
                                            style={{ top: pos.top, height: pos.height }}
                                            onClick={onSlotClick}
                                            compact
                                        />
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
