import {
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    format,
    parse,
    differenceInMinutes,
    isToday,
    isSameDay,
    addDays,
    subDays,
    addWeeks,
    subWeeks,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    getDay,
    startOfDay,
} from "date-fns";

// Calendar constants
export const HOUR_HEIGHT = 60; // pixels per hour
export const DAY_START_HOUR = 0;
export const DAY_END_HOUR = 24;
export const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR;

/**
 * Get array of hours for the time gutter (0–23)
 */
export function getHours() {
    return Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i);
}

/**
 * Parse time string "HH:mm:ss" or "HH:mm" to { hours, minutes }
 */
export function parseTime(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(":");
    return {
        hours: parseInt(parts[0], 10) || 0,
        minutes: parseInt(parts[1], 10) || 0,
    };
}

/**
 * Convert time to minutes from midnight
 */
export function timeToMinutes(timeStr) {
    const parsed = parseTime(timeStr);
    if (!parsed) return 0;
    return parsed.hours * 60 + parsed.minutes;
}

/**
 * Get CSS position for a slot on the time grid
 */
export function getSlotPosition(timeFrom, timeTo) {
    const startMin = timeToMinutes(timeFrom);
    const endMin = timeTo ? timeToMinutes(timeTo) : startMin + 60; // default 1hr
    const top = (startMin / 60) * HOUR_HEIGHT;
    const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 20); // min 20px
    return { top, height };
}

/**
 * Calculate slot layout preventing overlaps (side-by-side rendering)
 * Returns slots with added _style prop { top, height, left, width }
 */
export function calculateSlotLayout(slots) {
    if (!slots || slots.length === 0) return [];

    // 1. Calculate top and height for all slots
    const positionedSlots = slots.map(slot => ({
        ...slot,
        _pos: getSlotPosition(slot.time_from, slot.time_to)
    }));

    // Sort by start time, then by end time (longest first)
    positionedSlots.sort((a, b) => {
        if (a._pos.top !== b._pos.top) return a._pos.top - b._pos.top;
        return (b._pos.top + b._pos.height) - (a._pos.top + a._pos.height);
    });

    // 2. Group slots into overlapping clusters
    const clusters = [];
    let currentCluster = [];
    let clusterEnd = 0;

    positionedSlots.forEach(slot => {
        const start = slot._pos.top;
        const end = slot._pos.top + slot._pos.height;

        // Give a tiny 1px margin of error for contiguous slots
        if (currentCluster.length > 0 && start >= clusterEnd - 1) {
            clusters.push(currentCluster);
            currentCluster = [];
        }

        currentCluster.push(slot);
        clusterEnd = Math.max(clusterEnd, end);
    });
    if (currentCluster.length > 0) {
        clusters.push(currentCluster);
    }

    // 3. For each cluster, assign columns
    clusters.forEach(cluster => {
        const columns = [];
        cluster.forEach(slot => {
            let placed = false;
            for (let i = 0; i < columns.length; i++) {
                const col = columns[i];
                const lastInCol = col[col.length - 1];
                // Again, 1px margin
                if (lastInCol._pos.top + lastInCol._pos.height <= slot._pos.top + 1) {
                    col.push(slot);
                    slot._colIndex = i;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                columns.push([slot]);
                slot._colIndex = columns.length - 1;
            }
        });

        const numCols = columns.length;
        cluster.forEach(slot => {
            slot._style = {
                top: slot._pos.top,
                height: slot._pos.height,
                width: `calc(${100 / numCols}% - 4px)`,
                left: `calc(${(100 / numCols) * slot._colIndex}% + 2px)`,
            };
        });
    });

    return positionedSlots;
}

/**
 * Get occupancy percentage
 */
export function getOccupancy(reserved, max) {
    if (!max || max <= 0) return 0;
    return Math.round(((reserved || 0) / max) * 100);
}

/**
 * Get Tailwind color classes based on occupancy + status
 */
export function getOccupancyColor(reserved, max, status) {
    if (status === "BLOCKED") {
        return {
            bg: "bg-gray-100 dark:bg-gray-800/50",
            border: "border-gray-300 dark:border-gray-600",
            text: "text-gray-600 dark:text-gray-400",
            dot: "bg-gray-400",
            bar: "bg-gray-400",
        };
    }
    if (status === "CLOSED") {
        return {
            bg: "bg-gray-50 dark:bg-gray-800/30",
            border: "border-gray-200 dark:border-gray-700",
            text: "text-gray-500 dark:text-gray-500",
            dot: "bg-gray-400",
            bar: "bg-gray-400",
        };
    }
    const occ = getOccupancy(reserved, max);
    if (occ >= 90) {
        return {
            bg: "bg-red-50 dark:bg-red-950/30",
            border: "border-red-300 dark:border-red-700",
            text: "text-red-700 dark:text-red-400",
            dot: "bg-red-500",
            bar: "bg-red-500",
        };
    }
    if (occ >= 60) {
        return {
            bg: "bg-amber-50 dark:bg-amber-950/30",
            border: "border-amber-300 dark:border-amber-700",
            text: "text-amber-700 dark:text-amber-400",
            dot: "bg-amber-500",
            bar: "bg-amber-500",
        };
    }
    return {
        bg: "bg-emerald-50 dark:bg-emerald-950/30",
        border: "border-emerald-300 dark:border-emerald-700",
        text: "text-emerald-700 dark:text-emerald-400",
        dot: "bg-emerald-500",
        bar: "bg-emerald-500",
    };
}

/**
 * Color classes for an aggregated heatmap cell (week view). Reuses the same
 * occupancy palette as the slot cards, plus a muted "empty" state when the
 * cell has no reservations.
 */
export function getHeatCellColor(reserved, max) {
    if (!max || max <= 0 || (reserved || 0) === 0) {
        return { bg: "bg-muted/40", text: "text-muted-foreground", dot: "bg-muted-foreground/40" };
    }
    const occ = getOccupancy(reserved, max);
    if (occ >= 90) {
        return { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" };
    }
    if (occ >= 60) {
        return { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" };
    }
    return { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" };
}

/**
 * Get 7 days for the week containing the given date (Sunday start)
 */
export function getWeekDays(date) {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    const end = endOfWeek(date, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
}

/**
 * Get month grid days (with blanks for leading days)
 */
export function getMonthGrid(date) {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDay = getDay(monthStart);
    const blanks = Array(startDay).fill(null);
    return { blanks, days, monthStart, monthEnd };
}

/**
 * Format time for display (e.g. "09:00" → "9 AM")
 */
export function formatHour(hour) {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
}

/**
 * Format slot time range for display
 */
export function formatTimeRange(timeFrom, timeTo) {
    if (!timeFrom) return "—";
    const from = timeFrom.substring(0, 5);
    if (!timeTo) return from;
    const to = timeTo.substring(0, 5);
    return `${from} – ${to}`;
}

/**
 * Get the "now" position for the time indicator
 */
export function getNowPosition() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    return (minutes / 60) * HOUR_HEIGHT;
}

/**
 * Navigation helpers
 */
export const navigate = {
    day: {
        prev: (d) => subDays(d, 1),
        next: (d) => addDays(d, 1),
        title: (d) => format(d, "EEEE, MMMM d, yyyy"),
    },
    week: {
        prev: (d) => subWeeks(d, 1),
        next: (d) => addWeeks(d, 1),
        title: (d) => {
            const days = getWeekDays(d);
            const start = days[0];
            const end = days[6];
            if (format(start, "MMM yyyy") === format(end, "MMM yyyy")) {
                return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
            }
            return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
        },
    },
    month: {
        prev: (d) => subMonths(d, 1),
        next: (d) => addMonths(d, 1),
        title: (d) => format(d, "MMMM yyyy"),
    },
};

export { format, isToday, isSameDay, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth };
