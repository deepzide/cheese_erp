import React, { useRef, useEffect, useState } from "react";
import { isToday, isSameDay, format, getHours, getSlotPosition, getNowPosition, HOUR_HEIGHT, TOTAL_HOURS, formatHour } from "./calendarUtils";
import CalendarSlotCard from "./CalendarSlotCard";

/**
 * Day view — single column hourly time grid.
 */
export default function CalendarDayView({ date, slots, onSlotClick, onEmptyClick }) {
    const containerRef = useRef(null);
    const [nowPos, setNowPos] = useState(getNowPosition());
    const hours = getHours();
    const today = isToday(date);
    const dayKey = format(date, "yyyy-MM-dd");
    const daySlots = slots.filter((s) => s.date_from === dayKey);

    // Update now indicator every minute
    useEffect(() => {
        if (!today) return;
        const interval = setInterval(() => setNowPos(getNowPosition()), 60_000);
        return () => clearInterval(interval);
    }, [today]);

    // Scroll to current hour on mount
    useEffect(() => {
        if (containerRef.current) {
            const scrollTo = today ? Math.max(0, nowPos - 200) : 8 * HOUR_HEIGHT;
            containerRef.current.scrollTop = scrollTo;
        }
    }, [date]);

    const handleEmptyClick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top + (containerRef.current?.scrollTop || 0);
        const hour = Math.floor(y / HOUR_HEIGHT);
        onEmptyClick?.(date, hour);
    };

    return (
        <div ref={containerRef} className="overflow-auto max-h-[calc(100vh-260px)] relative border border-border rounded-lg bg-card">
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

                {/* Day column */}
                <div className="flex-1 relative" onClick={handleEmptyClick}>
                    {/* Hour lines */}
                    {hours.map((hour) => (
                        <div
                            key={hour}
                            className="border-b border-border/30"
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
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
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
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
