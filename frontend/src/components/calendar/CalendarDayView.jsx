import React, { useRef, useEffect, useState } from "react";
import { isToday, isSameDay, format, getHours, getSlotPosition, getNowPosition, HOUR_HEIGHT, TOTAL_HOURS, formatHour, calculateSlotLayout } from "./calendarUtils";
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
    const allDaySlots = slots
        .filter((s) => s.date_from <= dayKey && s.date_to >= dayKey)
        .sort((a, b) => (a.time_from || "").localeCompare(b.time_from || ""));
    const timedSlots = allDaySlots.filter((s) => s.time_from);
    const untimed = allDaySlots.filter((s) => !s.time_from);

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
        <div className="border border-border rounded-lg bg-card overflow-hidden">
            {/* All-day slots */}
            {untimed.length > 0 && (
                <div className="border-b border-border bg-muted/20 px-2 py-1.5 flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground font-medium mr-1">ALL DAY</span>
                    {untimed.map((slot) => (
                        <button
                            key={slot.name}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onSlotClick?.(slot); }}
                            className="text-[10px] px-2 py-0.5 rounded bg-cheese-100 dark:bg-cheese-900/40 text-cheese-700 dark:text-cheese-400 truncate max-w-[180px] hover:bg-cheese-200 transition-colors"
                        >
                            {slot.experience || slot.name} ({slot.reserved_capacity ?? 0}/{slot.max_capacity ?? 0})
                        </button>
                    ))}
                </div>
            )}
            <div ref={containerRef} className="overflow-auto max-h-[calc(100vh-260px)] relative">
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
                        {calculateSlotLayout(timedSlots).map((slot) => {
                            return (
                                <CalendarSlotCard
                                    key={slot.name}
                                    slot={slot}
                                    style={slot._style}
                                    onClick={onSlotClick}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
