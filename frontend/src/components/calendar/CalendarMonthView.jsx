import React from "react";
import {
    format, isToday, getMonthGrid, getOccupancy, getOccupancyColor,
} from "./calendarUtils";

/**
 * Month view — enhanced month grid with slot indicators.
 * Clicking a day switches to Day view.
 */
export default function CalendarMonthView({ date, slots, onDayClick }) {
    const { blanks, days, monthStart, monthEnd } = getMonthGrid(date);

    // Group slots by date
    const slotsByDate = {};
    slots.forEach((slot) => {
        const key = slot.date_from;
        if (!key) return;
        if (!slotsByDate[key]) slotsByDate[key] = [];
        slotsByDate[key].push(slot);
    });

    return (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-2 uppercase tracking-wider">
                        {d}
                    </div>
                ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7">
                {blanks.map((_, i) => (
                    <div key={`b-${i}`} className="min-h-[100px] border-b border-r border-border/30 bg-muted/20" />
                ))}
                {days.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const daySlots = slotsByDate[key] || [];
                    const today = isToday(day);
                    const maxShow = 3;
                    const overflow = daySlots.length > maxShow ? daySlots.length - maxShow : 0;

                    return (
                        <button
                            key={key}
                            onClick={() => onDayClick?.(day)}
                            className={`min-h-[100px] border-b border-r border-border/30 p-1.5 text-left
                                hover:bg-muted/50 transition-colors cursor-pointer group
                                ${today ? "bg-cheese-50/30 dark:bg-cheese-950/15" : ""}`}
                        >
                            {/* Day number */}
                            <div className="flex items-center justify-between mb-1">
                                <span
                                    className={`text-sm ${today
                                        ? "w-7 h-7 rounded-full bg-cheese-500 text-black flex items-center justify-center font-bold"
                                        : "text-foreground font-medium"
                                        }`}
                                >
                                    {format(day, "d")}
                                </span>
                                {daySlots.length > 0 && (
                                    <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                        {daySlots.length} slot{daySlots.length > 1 ? "s" : ""}
                                    </span>
                                )}
                            </div>

                            {/* Slot indicators */}
                            <div className="space-y-0.5">
                                {daySlots.slice(0, maxShow).map((slot) => {
                                    const colors = getOccupancyColor(slot.reserved_capacity, slot.max_capacity, slot.slot_status);
                                    return (
                                        <div
                                            key={slot.name}
                                            className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate
                                                ${colors.bg} border-l-2 ${colors.border}`}
                                        >
                                            <span className={`font-medium truncate ${colors.text}`}>
                                                {slot.time_from ? slot.time_from.substring(0, 5) : ""} {slot.experience || "Slot"}
                                            </span>
                                        </div>
                                    );
                                })}
                                {overflow > 0 && (
                                    <div className="text-[10px] text-muted-foreground font-medium pl-1">
                                        +{overflow} more
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 py-3 border-t border-border">
                {[
                    { color: "bg-emerald-500", label: "Available" },
                    { color: "bg-amber-500", label: "Filling" },
                    { color: "bg-red-500", label: "Full" },
                    { color: "bg-gray-400", label: "Blocked" },
                ].map((l) => (
                    <div key={l.label} className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                        <span className="text-[10px] text-muted-foreground">{l.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
