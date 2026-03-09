import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Users, Filter, AlertCircle, RefreshCw, Ticket } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isToday, getDay } from "date-fns";
import { experienceService } from "@/api/experienceService";
import { useFrappeList } from "@/lib/useApiData";

export default function CalendarPage() {
    const navigate = useNavigate();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedExperience, setSelectedExperience] = useState(null);

    // Fetch experiences
    const { data: experiences = [] } = useFrappeList("Cheese Experience", {
        fields: ["name", "experience_info"],
        pageSize: 100,
    });

    // Fetch slots for the current month
    const monthKey = format(currentMonth, 'yyyy-MM');
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    const slotFilters = {};
    if (selectedExperience && selectedExperience !== "all") slotFilters.experience = selectedExperience;

    const { data: slotsRaw = [], isLoading, refetch } = useFrappeList("Cheese Experience Slot", {
        filters: {
            ...slotFilters,
            date_from: ["between", [format(monthStart, 'yyyy-MM-dd'), format(monthEnd, 'yyyy-MM-dd')]],
        },
        fields: ["name", "experience", "date_from", "date_to", "time_from", "time_to", "max_capacity", "reserved_capacity", "slot_status"],
        pageSize: 500,
    });

    const slots = Array.isArray(slotsRaw) ? slotsRaw : [];

    // Group slots by date
    const slotsByDate = {};
    slots.forEach(slot => {
        const key = slot.date_from;
        if (!key) return;
        if (!slotsByDate[key]) slotsByDate[key] = { slots: 0, total: 0, booked: 0 };
        slotsByDate[key].slots += 1;
        slotsByDate[key].total += (slot.max_capacity || 0);
        slotsByDate[key].booked += (slot.reserved_capacity || 0);
    });
    Object.values(slotsByDate).forEach(d => { d.occupancy = d.total > 0 ? Math.round((d.booked / d.total) * 100) : 0; });

    // Slots for selected date
    const selectedDateKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
    const daySlots = slots.filter(s => s.date_from === selectedDateKey);

    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDay = getDay(monthStart);
    const blanks = Array(startDay).fill(null);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <CalendarDays className="w-6 h-6 text-cheese-600" /> Calendar
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Slot availability overview • {isLoading ? '...' : `${slots.length} slots`}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={selectedExperience || "all"} onValueChange={(v) => setSelectedExperience(v === "all" ? null : v)}>
                        <SelectTrigger className="w-48 h-9"><Filter className="w-3 h-3 mr-1" /><SelectValue placeholder="All Activities" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Activities</SelectItem>
                            {(Array.isArray(experiences) ? experiences : []).map(exp => (
                                <SelectItem key={exp.name} value={exp.name}>{exp.experience_info || exp.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="border-0 shadow-lg lg:col-span-2">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="w-5 h-5" /></Button>
                            <CardTitle className="text-lg">{format(currentMonth, 'MMMM yyyy')}</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="w-5 h-5" /></Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-7 gap-1 mb-2">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {blanks.map((_, i) => <div key={`b-${i}`} className="aspect-square" />)}
                            {days.map((day) => {
                                const key = format(day, 'yyyy-MM-dd');
                                const data = slotsByDate[key];
                                const today = isToday(day);
                                const selected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === key;
                                let bg = 'bg-card hover:bg-muted';
                                if (data) {
                                    if (data.occupancy >= 90) bg = 'bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 border-red-200 dark:border-red-800';
                                    else if (data.occupancy >= 60) bg = 'bg-yellow-50 dark:bg-yellow-950/30 hover:bg-yellow-100 dark:hover:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800';
                                    else bg = 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800';
                                }
                                if (selected) bg = 'bg-cheese-100 dark:bg-cheese-900/40 border-cheese-400 ring-2 ring-cheese-300';

                                return (
                                    <button key={key} onClick={() => setSelectedDate(day)}
                                        className={`aspect-square rounded-lg border text-sm flex flex-col items-center justify-center transition-all ${bg} ${today ? 'font-bold' : ''}`}>
                                        <span className={today ? 'w-6 h-6 rounded-full bg-cheese-500 text-black flex items-center justify-center text-xs' : ''}>
                                            {format(day, 'd')}
                                        </span>
                                        {data && (
                                            <div className="flex items-center gap-0.5 mt-0.5">
                                                <div className={`w-1.5 h-1.5 rounded-full ${data.occupancy >= 90 ? 'bg-red-500' : data.occupancy >= 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`} />
                                                <span className="text-[9px] text-muted-foreground">{data.slots}</span>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-border">
                            {[{ color: 'bg-emerald-500', label: 'Available' }, { color: 'bg-yellow-500', label: 'Filling' }, { color: 'bg-red-500', label: 'Full' }].map(l => (
                                <div key={l.label} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-full ${l.color}`} /><span className="text-xs text-muted-foreground">{l.label}</span></div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Clock className="w-4 h-4 text-cheese-600" />
                            {selectedDate ? format(selectedDate, 'EEEE, MMM d') : "Select a date"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {selectedDate ? (
                            daySlots.length > 0 ? (
                                <div className="space-y-2">
                                    {daySlots.map((slot) => {
                                        const occ = slot.max_capacity > 0 ? Math.round(((slot.reserved_capacity || 0) / slot.max_capacity) * 100) : 0;
                                        return (
                                            <div key={slot.name} className="p-3 bg-muted rounded-lg">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-mono font-bold text-sm">{slot.time_from || '—'}{slot.time_to ? ` – ${slot.time_to}` : ''}</span>
                                                    <Badge variant={slot.slot_status === 'OPEN' ? 'outline' : 'secondary'} className="text-[10px]">{slot.slot_status || '—'}</Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground mb-2">{slot.experience || '—'}</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 bg-muted-foreground/20 rounded-full h-1.5">
                                                        <div className={`h-1.5 rounded-full ${occ >= 90 ? 'bg-red-500' : occ >= 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${occ}%` }} />
                                                    </div>
                                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />{slot.reserved_capacity || 0}/{slot.max_capacity || '—'}</span>
                                                </div>
                                                <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs w-full" onClick={() => navigate(`/cheese/tickets?slot=${slot.name}`)}>
                                                    <Ticket className="w-3 h-3 mr-1" /> View Tickets
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <CalendarDays className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                                    <p className="text-sm">No slots for this date</p>
                                </div>
                            )
                        ) : (
                            <div className="text-center py-12 text-muted-foreground">
                                <CalendarDays className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                                <p className="text-sm">Click a date to view slots</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </motion.div>
    );
}
