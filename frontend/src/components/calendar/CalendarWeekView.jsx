import React from "react";
import { useTranslation } from "react-i18next";
import { isToday, format, getWeekDays, getHeatCellColor } from "./calendarUtils";

/**
 * Week view — occupancy heatmap: one row per experience with slots this week,
 * one column per day. Each cell aggregates the day's slots for that experience
 * (reserved / capacity) and is colored by occupancy; the label follows the
 * active lens (occupancy "res/cap" or available spots). Clicking a cell opens
 * the day view filtered to that experience; clicking a day header opens the day.
 */
export default function CalendarWeekView({ date, slots, experiences = [], lens = "ocup", onCellClick, onDayClick }) {
    const { t } = useTranslation();
    const weekDays = getWeekDays(date);
    const dayKeys = weekDays.map((d) => format(d, "yyyy-MM-dd"));

    const expLabel = {};
    (Array.isArray(experiences) ? experiences : []).forEach((e) => {
        expLabel[e.name] = e.experience_info || e.name;
    });

    // Aggregate per (experience, day): reserved, capacity, slot count.
    const byExp = {};
    slots.forEach((s) => {
        const exp = s.experience || "—";
        dayKeys.forEach((key) => {
            if (!(s.date_from <= key && s.date_to >= key)) return;
            byExp[exp] = byExp[exp] || {};
            const cell = (byExp[exp][key] = byExp[exp][key] || { res: 0, cap: 0, count: 0 });
            cell.res += s.reserved_capacity || 0;
            cell.cap += s.max_capacity || 0;
            cell.count += 1;
        });
    });

    const rows = Object.keys(byExp).sort((a, b) =>
        (expLabel[a] || a).localeCompare(expLabel[b] || b)
    );

    const cellLabel = (cell) =>
        lens === "disp"
            ? t("calendar.free", "{{n}} libres", { n: Math.max(0, cell.cap - cell.res) })
            : `${cell.res}/${cell.cap}`;

    return (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
            <div className="overflow-x-auto">
                <div
                    className="grid min-w-[720px]"
                    style={{ gridTemplateColumns: "minmax(150px, 1.2fr) repeat(7, minmax(72px, 1fr))" }}
                >
                    {/* Header row */}
                    <div className="border-b border-r border-border bg-muted/30" />
                    {weekDays.map((day) => {
                        const today = isToday(day);
                        return (
                            <button
                                key={day.toISOString()}
                                type="button"
                                onClick={() => onDayClick?.(day)}
                                className={`text-center py-2 border-b border-r border-border/50 last:border-r-0 cursor-pointer
                                    hover:bg-muted/50 transition-colors bg-muted/30
                                    ${today ? "bg-cheese-50/50 dark:bg-cheese-950/20" : ""}`}
                            >
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                    {t(`calendar.days.${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day.getDay()]}`, format(day, "EEE"))}
                                </div>
                                <div
                                    className={`text-sm font-semibold mt-0.5
                                        ${today ? "w-7 h-7 mx-auto rounded-full bg-cheese-500 text-black flex items-center justify-center" : ""}`}
                                >
                                    {format(day, "d")}
                                </div>
                            </button>
                        );
                    })}

                    {/* Experience rows */}
                    {rows.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                            {t("calendar.emptyWeek", "Sin experiencias con horarios esta semana")}
                        </div>
                    ) : (
                        rows.map((exp) => (
                            <React.Fragment key={exp}>
                                <div className="border-b border-r border-border/50 px-2 py-1.5 text-xs font-medium flex items-center min-h-[52px]">
                                    <span className="truncate" title={expLabel[exp] || exp}>{expLabel[exp] || exp}</span>
                                </div>
                                {dayKeys.map((key, i) => {
                                    const cell = byExp[exp][key];
                                    if (!cell) {
                                        return <div key={key} className="border-b border-r border-border/30 last:border-r-0 min-h-[52px]" />;
                                    }
                                    const colors = getHeatCellColor(cell.res, cell.cap);
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => onCellClick?.(exp, weekDays[i])}
                                            className={`border-b border-r border-border/30 last:border-r-0 min-h-[52px] px-1 py-1
                                                flex flex-col items-center justify-center gap-0.5 transition-colors
                                                hover:ring-1 hover:ring-inset hover:ring-cheese-500 cursor-pointer ${colors.bg}`}
                                            title={`${expLabel[exp] || exp} · ${key} · ${cell.res}/${cell.cap}`}
                                        >
                                            <span className={`text-xs font-semibold ${colors.text}`}>{cellLabel(cell)}</span>
                                            <span className="text-[9px] text-muted-foreground">
                                                {t("calendar.slotsCount", "{{n}} franjas", { n: cell.count })}
                                            </span>
                                        </button>
                                    );
                                })}
                            </React.Fragment>
                        ))
                    )}
                </div>
            </div>

            {/* Occupancy legend */}
            <div className="flex items-center gap-3 flex-wrap px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
                <span className="font-medium">{t("calendar.legendTitle", "Ocupación:")}</span>
                <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm bg-muted/60 border border-border" /> {t("calendar.legendEmpty", "vacío")}</span>
                <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm bg-emerald-100 dark:bg-emerald-950/50" /> 1–59%</span>
                <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-950/50" /> 60–89%</span>
                <span className="flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm bg-red-100 dark:bg-red-950/50" /> 90–100%</span>
                <span className="ml-auto">{t("calendar.clickCellHint", "Clic en una celda para ver el día")}</span>
            </div>
        </div>
    );
}
