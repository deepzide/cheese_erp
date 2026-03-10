import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ChevronLeft, ChevronRight, Filter, RefreshCw, Plus, AlertCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFrappeList } from "@/lib/useApiData";
import {
    format, navigate as nav, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
} from "@/components/calendar/calendarUtils";

import CalendarWeekView from "@/components/calendar/CalendarWeekView";
import CalendarDayView from "@/components/calendar/CalendarDayView";
import CalendarMonthView from "@/components/calendar/CalendarMonthView";
import CalendarSlotDetail from "@/components/calendar/CalendarSlotDetail";
import CalendarCreateSlotDialog from "@/components/calendar/CalendarCreateSlotDialog";

const VIEWS = ["day", "week", "month"];

export default function CalendarPage() {
    const queryClient = useQueryClient();
    const [view, setView] = useState("week");
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedExperience, setSelectedExperience] = useState(null);

    // Slot detail dialog
    const [detailSlot, setDetailSlot] = useState(null);

    // Create dialog
    const [createOpen, setCreateOpen] = useState(false);
    const [createPrefillDate, setCreatePrefillDate] = useState(null);
    const [createPrefillHour, setCreatePrefillHour] = useState(null);

    // Compute date range for fetching slots
    const getDateRange = () => {
        if (view === "day") {
            const d = format(currentDate, "yyyy-MM-dd");
            return { from: d, to: d };
        }
        if (view === "week") {
            const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
            const we = endOfWeek(currentDate, { weekStartsOn: 0 });
            return { from: format(ws, "yyyy-MM-dd"), to: format(we, "yyyy-MM-dd") };
        }
        // month
        const ms = startOfMonth(currentDate);
        const me = endOfMonth(currentDate);
        return { from: format(ms, "yyyy-MM-dd"), to: format(me, "yyyy-MM-dd") };
    };

    const { from, to } = getDateRange();

    // Fetch experiences
    const { data: experiences = [] } = useFrappeList("Cheese Experience", {
        fields: ["name", "experience_info"],
        pageSize: 100,
    });

    // Fetch slots for current range
    const slotFilters = {};
    if (selectedExperience && selectedExperience !== "all") slotFilters.experience = selectedExperience;

    const { data: slotsRaw = [], isLoading, error, refetch } = useFrappeList("Cheese Experience Slot", {
        filters: {
            ...slotFilters,
            date_from: ["between", [from, to]],
        },
        fields: ["name", "experience", "date_from", "date_to", "time_from", "time_to", "max_capacity", "reserved_capacity", "slot_status"],
        pageSize: 500,
    });

    const slots = Array.isArray(slotsRaw) ? slotsRaw : [];

    // Navigation
    const handlePrev = () => setCurrentDate(nav[view].prev(currentDate));
    const handleNext = () => setCurrentDate(nav[view].next(currentDate));
    const handleToday = () => setCurrentDate(new Date());
    const title = nav[view].title(currentDate);

    // Slot click
    const handleSlotClick = useCallback((slot) => {
        setDetailSlot(slot);
    }, []);

    // Empty area click → create slot
    const handleEmptyClick = useCallback((date, hour) => {
        setCreatePrefillDate(date);
        setCreatePrefillHour(hour);
        setCreateOpen(true);
    }, []);

    // Day click from month/week view
    const handleDayClick = useCallback((day) => {
        setCurrentDate(day);
        setView("day");
    }, []);

    // After slot created
    const handleSlotCreated = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["frappe-list", "Cheese Experience Slot"] });
    }, [queryClient]);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <CalendarDays className="w-6 h-6 text-cheese-600" />
                    <div>
                        <h1 className="text-xl font-bold text-foreground">Calendar</h1>
                        <p className="text-xs text-muted-foreground">
                            {isLoading ? "Loading..." : `${slots.length} slots`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* View switcher */}
                    <Tabs value={view} onValueChange={setView}>
                        <TabsList className="h-8">
                            <TabsTrigger value="day" className="text-xs px-3 h-6">Day</TabsTrigger>
                            <TabsTrigger value="week" className="text-xs px-3 h-6">Week</TabsTrigger>
                            <TabsTrigger value="month" className="text-xs px-3 h-6">Month</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {/* Experience filter */}
                    <Select value={selectedExperience || "all"} onValueChange={(v) => setSelectedExperience(v === "all" ? null : v)}>
                        <SelectTrigger className="w-44 h-8 text-xs">
                            <Filter className="w-3 h-3 mr-1" />
                            <SelectValue placeholder="All Activities" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Activities</SelectItem>
                            {(Array.isArray(experiences) ? experiences : []).map((exp) => (
                                <SelectItem key={exp.name} value={exp.name}>
                                    {exp.experience_info || exp.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Create slot button */}
                    <Button
                        size="sm"
                        className="h-8 bg-cheese-500 hover:bg-cheese-600 text-black text-xs"
                        onClick={() => {
                            setCreatePrefillDate(currentDate);
                            setCreatePrefillHour(null);
                            setCreateOpen(true);
                        }}
                    >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        New Slot
                    </Button>

                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-8 w-8">
                        <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleToday} className="h-7 text-xs">
                        Today
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handlePrev} className="h-7 w-7">
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleNext} className="h-7 w-7">
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                <div className="w-24" /> {/* spacer for balance */}
            </div>

            {/* Error state */}
            {error ? (
                <div className="flex flex-col items-center justify-center py-16">
                    <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Failed to load slots</h3>
                    <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                    <Button onClick={() => refetch()} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-2" /> Retry
                    </Button>
                </div>
            ) : isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-[400px] w-full rounded-lg" />
                </div>
            ) : (
                <>
                    {view === "week" && (
                        <CalendarWeekView
                            date={currentDate}
                            slots={slots}
                            onSlotClick={handleSlotClick}
                            onEmptyClick={handleEmptyClick}
                            onDayClick={handleDayClick}
                        />
                    )}
                    {view === "day" && (
                        <CalendarDayView
                            date={currentDate}
                            slots={slots}
                            onSlotClick={handleSlotClick}
                            onEmptyClick={handleEmptyClick}
                        />
                    )}
                    {view === "month" && (
                        <CalendarMonthView
                            date={currentDate}
                            slots={slots}
                            onDayClick={handleDayClick}
                        />
                    )}
                </>
            )}

            {/* Slot detail dialog */}
            <CalendarSlotDetail
                slot={detailSlot}
                open={!!detailSlot}
                onClose={() => setDetailSlot(null)}
            />

            {/* Create slot dialog */}
            <CalendarCreateSlotDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                prefillDate={createPrefillDate}
                prefillHour={createPrefillHour}
                onCreated={handleSlotCreated}
            />
        </motion.div>
    );
}
