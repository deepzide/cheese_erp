import React from "react";
import { useTranslation } from "react-i18next";
import {
    format, isToday, getMonthGrid, getHeatCellColor,
} from "./calendarUtils";

/**
 * Month view — one aggregated occupancy/availability cell per day (like the
 * week heatmap), NOT individual slot times. Each day sums the reserved and
 * max capacity of that day's slots and shows both totals (occupancy res/cap
 * and available spots), colored by occupancy. Clicking a day opens Day view.
 */
export default function CalendarMonthView({ date, slots, lens = "ocup", onDayClick }) {
    const { t } = useTranslation();
    const { blanks, days } = getMonthGrid(date);

    // Aggregate per day: reserved, capacity, slot count.
    const byDate = {};
    slots.forEach((slot) => {
        if (!slot.date_from || !slot.date_to) return;
        const from = new Date(slot.date_from);
        const to = new Date(slot.date_to);
        for (let cur = new Date(from); cur <= to; cur.setDate(cur.getDate() + 1)) {
            const key = format(cur, "yyyy-MM-dd");
            const cell = (byDate[key] = byDate[key] || { res: 0, cap: 0, count: 0 });
            cell.res += slot.reserved_capacity || 0;
            cell.cap += slot.max_capacity || 0;
            cell.count += 1;
        }
    });

    return (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border">
                {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => (
                    <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-2 uppercase tracking-wider">
                        {t(`calendar.days.${d}`, d)}
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
                    const cell = byDate[key];
                    const today = isToday(day);
                    const free = cell ? Math.max(0, cell.cap - cell.res) : 0;
                    const colors = cell ? getHeatCellColor(cell.res, cell.cap) : null;

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
                                {cell && (
                                    <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                        {t("calendar.slotsCount", "{{n}} franjas", { n: cell.count })}
                                    </span>
                                )}
                            </div>

                            {/* Aggregated occupancy / availability for the day */}
                            {cell ? (
                                <div className={`rounded-md px-2 py-1.5 ${colors.bg}`}>
                                    <div className={`text-sm font-bold ${colors.text}`}>
                                        {lens === "disp"
                                            ? t("calendar.free", "{{n}} libres", { n: free })
                                            : `${cell.res}/${cell.cap}`}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        {lens === "disp"
                                            ? t("calendar.occupancyShort", "Ocup. {{res}}/{{cap}}", { res: cell.res, cap: cell.cap })
                                            : t("calendar.freeShort", "{{n}} libres", { n: free })}
                                    </div>
                                </div>
                            ) : null}
                        </button>
                    );
                })}
            </div>

            {/* Occupancy legend */}
            <div className="flex items-center gap-3 flex-wrap px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
                <span className="font-medium">{t("calendar.legendTitle", "Ocupación:")}</span>
                <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm bg-muted/60 border border-border" /> {t("calendar.legendEmpty", "vacío")}</span>
                <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm bg-emerald-100 dark:bg-emerald-950/50" /> 1–59%</span>
                <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-950/50" /> 60–89%</span>
                <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm bg-red-100 dark:bg-red-950/50" /> 90–100%</span>
                <span className="ml-auto">{t("calendar.clickDayHint", "Clic en un día para ver sus horarios")}</span>
            </div>
        </div>
    );
}
