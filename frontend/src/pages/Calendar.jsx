import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Users } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, getDay } from "date-fns";

const mockSlotsByDate = {};
const baseDate = new Date();
for (let i = -5; i < 30; i++) {
    const d = new Date(baseDate); d.setDate(d.getDate() + i);
    const key = format(d, 'yyyy-MM-dd');
    const count = Math.floor(Math.random() * 6);
    if (count > 0) {
        const total = Math.floor(Math.random() * 40) + 10;
        const booked = Math.floor(Math.random() * total);
        mockSlotsByDate[key] = { slots: count, total, booked, occupancy: Math.round((booked / total) * 100) };
    }
}

const daySlots = [
    { time: "09:00", experience: "Wine Tasting", capacity: 15, booked: 12, status: "OPEN" },
    { time: "10:30", experience: "Cheese Factory", capacity: 20, booked: 18, status: "OPEN" },
    { time: "12:00", experience: "Gourmet Lunch", capacity: 20, booked: 20, status: "CLOSED" },
    { time: "14:00", experience: "Artisan Workshop", capacity: 12, booked: 3, status: "OPEN" },
    { time: "16:00", experience: "VIP Cave Tour", capacity: 8, booked: 6, status: "OPEN" },
];

export default function CalendarPage() {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDay = getDay(monthStart);
    const blanks = Array(startDay).fill(null);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <CalendarDays className="w-6 h-6 text-cheese-600" /> Calendar
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Slot availability overview</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar Grid */}
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
                                const data = mockSlotsByDate[key];
                                const today = isToday(day);
                                const selected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === key;
                                let bg = 'bg-white hover:bg-gray-50';
                                if (data) {
                                    if (data.occupancy >= 90) bg = 'bg-red-50 hover:bg-red-100 border-red-200';
                                    else if (data.occupancy >= 60) bg = 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200';
                                    else bg = 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200';
                                }
                                if (selected) bg = 'bg-cheese-100 border-cheese-400 ring-2 ring-cheese-300';

                                return (
                                    <button
                                        key={key}
                                        onClick={() => setSelectedDate(day)}
                                        className={`aspect-square rounded-lg border text-sm flex flex-col items-center justify-center transition-all ${bg} ${today ? 'font-bold' : ''}`}
                                    >
                                        <span className={`${today ? 'w-6 h-6 rounded-full bg-cheese-500 text-black flex items-center justify-center text-xs' : ''}`}>
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
                        <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t">
                            {[{ color: 'bg-emerald-500', label: 'Available' }, { color: 'bg-yellow-500', label: 'Filling' }, { color: 'bg-red-500', label: 'Full' }].map(l => (
                                <div key={l.label} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-full ${l.color}`} /><span className="text-xs text-muted-foreground">{l.label}</span></div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Day Detail */}
                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Clock className="w-4 h-4 text-cheese-600" />
                            {selectedDate ? format(selectedDate, 'EEEE, MMM d') : "Select a date"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {selectedDate ? (
                            <div className="space-y-2">
                                {daySlots.map((slot, i) => {
                                    const occ = Math.round((slot.booked / slot.capacity) * 100);
                                    return (
                                        <div key={i} className="p-3 bg-gray-50 rounded-lg">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-mono font-bold text-sm">{slot.time}</span>
                                                <Badge variant={slot.status === 'OPEN' ? 'success' : 'destructive'} className="text-[10px]">{slot.status}</Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-2">{slot.experience}</p>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                                    <div className={`h-1.5 rounded-full ${occ >= 90 ? 'bg-red-500' : occ >= 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${occ}%` }} />
                                                </div>
                                                <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />{slot.booked}/{slot.capacity}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-muted-foreground">
                                <CalendarDays className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                <p className="text-sm">Click a date to view slots</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </motion.div>
    );
}
