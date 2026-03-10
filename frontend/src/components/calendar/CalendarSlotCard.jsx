import React from "react";
import { Users } from "lucide-react";
import { getOccupancy, getOccupancyColor, formatTimeRange } from "./calendarUtils";

/**
 * Slot event card rendered on day/week time grids.
 * Positioned absolutely by the parent grid based on time.
 */
export default function CalendarSlotCard({ slot, style, onClick, compact = false }) {
    const occ = getOccupancy(slot.reserved_capacity, slot.max_capacity);
    const colors = getOccupancyColor(slot.reserved_capacity, slot.max_capacity, slot.slot_status);
    const isSmall = style && style.height && style.height < 40;

    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onClick?.(slot, e);
            }}
            className={`absolute left-1 right-1 rounded-md border-l-[3px] px-2 py-1 text-left transition-all
                hover:shadow-md hover:scale-[1.02] hover:z-30 cursor-pointer overflow-hidden group
                ${colors.bg} ${colors.border}`}
            style={{
                ...style,
                zIndex: 10,
            }}
            title={`${slot.experience || "Slot"} • ${formatTimeRange(slot.time_from, slot.time_to)} • ${slot.reserved_capacity || 0}/${slot.max_capacity || "—"}`}
        >
            {isSmall || compact ? (
                <div className="flex items-center gap-1 truncate">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                    <span className={`text-[10px] font-semibold truncate ${colors.text}`}>
                        {slot.experience || "Slot"}
                    </span>
                    <span className="text-[9px] text-muted-foreground ml-auto flex-shrink-0">
                        {slot.reserved_capacity || 0}/{slot.max_capacity || "—"}
                    </span>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-bold truncate ${colors.text}`}>
                            {slot.experience || "Slot"}
                        </span>
                        {slot.slot_status === "BLOCKED" && (
                            <span className="text-[9px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1 rounded">
                                BLOCKED
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {formatTimeRange(slot.time_from, slot.time_to)}
                    </p>
                    {!compact && (
                        <div className="flex items-center gap-1.5 mt-1">
                            <div className="flex-1 bg-black/10 dark:bg-white/10 rounded-full h-1">
                                <div
                                    className={`h-1 rounded-full transition-all ${colors.bar}`}
                                    style={{ width: `${Math.min(occ, 100)}%` }}
                                />
                            </div>
                            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                <Users className="w-2.5 h-2.5" />
                                {slot.reserved_capacity || 0}/{slot.max_capacity || "—"}
                            </span>
                        </div>
                    )}
                </>
            )}
        </button>
    );
}
