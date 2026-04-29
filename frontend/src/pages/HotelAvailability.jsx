import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CalendarDays, AlertCircle, RefreshCw, BedDouble, Plus, Check, X, Loader2 } from "lucide-react";
import { hotelService } from "@/api/hotelService";

const CELL_COLORS = {
    OPEN: "bg-emerald-500/20 text-emerald-700 border-emerald-500/30",
    CLOSED: "bg-red-500/20 text-red-700 border-red-500/30",
    BLOCKED: "bg-gray-500/20 text-gray-500 border-gray-500/30",
    NO_SLOT: "bg-gray-100 dark:bg-gray-900 text-gray-400 border-dashed border-gray-300 dark:border-gray-700",
};

export default function HotelAvailability() {
    const queryClient = useQueryClient();
    const [selectedExperience, setSelectedExperience] = useState("");
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        return d.toISOString().split("T")[0];
    });
    const [dateTo, setDateTo] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split("T")[0];
    });
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [createForm, setCreateForm] = useState({ date_from: "", date_to: "", rooms_available: 10 });

    // Fetch all hotel experiences to choose from
    const { data: hotelsPayload } = useQuery({
        queryKey: ["hotel-experiences-list"],
        queryFn: async () => {
            const res = await hotelService.listHotels({ page: 1, page_size: 200 });
            return res?.data?.message || res?.data || {};
        },
    });

    const hotels = Array.isArray(hotelsPayload?.data) ? hotelsPayload.data : [];

    // Fetch experiences for the selected hotel
    const { data: expPayload } = useQuery({
        queryKey: ["hotel-experiences", selectedExperience ? "all" : hotels[0]?.name],
        queryFn: async () => {
            // Fetch all hotel experiences across all hotels
            const all = [];
            for (const hotel of hotels) {
                const res = await hotelService.getHotelExperiences(hotel.name, { page_size: 100 });
                const d = res?.data?.message || res?.data || {};
                if (Array.isArray(d.data)) all.push(...d.data);
            }
            return all;
        },
        enabled: hotels.length > 0,
    });

    const experiences = Array.isArray(expPayload) ? expPayload : [];

    // Get availability for selected experience
    const { data: availPayload, isLoading, error, refetch } = useQuery({
        queryKey: ["hotel-availability", selectedExperience, dateFrom, dateTo],
        queryFn: async () => {
            const res = await hotelService.getHotelAvailability(selectedExperience, { date_from: dateFrom, date_to: dateTo });
            return res?.data?.message || res?.data || {};
        },
        enabled: !!selectedExperience,
    });

    const availability = availPayload?.data || {};
    const nights = Array.isArray(availability.nights) ? availability.nights : [];

    // Create slots mutation
    const createSlotsMutation = useMutation({
        mutationFn: (data) => hotelService.createHotelSlots(data),
        onSuccess: () => {
            setShowCreateDialog(false);
            queryClient.invalidateQueries(["hotel-availability"]);
        },
    });

    const handleCreateSlots = () => {
        createSlotsMutation.mutate({
            experience_id: selectedExperience,
            date_from: createForm.date_from,
            date_to: createForm.date_to,
            rooms_available: createForm.rooms_available,
        });
    };

    // Build calendar grid
    const weeks = useMemo(() => {
        if (!nights.length) return [];
        const result = [];
        let currentWeek = [];
        for (const night of nights) {
            const dayOfWeek = new Date(night.date).getDay();
            if (currentWeek.length === 0 && dayOfWeek > 0) {
                for (let i = 0; i < dayOfWeek; i++) currentWeek.push(null);
            }
            currentWeek.push(night);
            if (currentWeek.length === 7) {
                result.push(currentWeek);
                currentWeek = [];
            }
        }
        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) currentWeek.push(null);
            result.push(currentWeek);
        }
        return result;
    }, [nights]);

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load availability</h2>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" /> Retry
                </Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <CalendarDays className="w-6 h-6 text-indigo-500" /> Hotel Availability
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage nightly room availability</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <Select value={selectedExperience} onValueChange={setSelectedExperience}>
                        <SelectTrigger className="w-56 h-9">
                            <SelectValue placeholder="Select room type…" />
                        </SelectTrigger>
                        <SelectContent>
                            {experiences.map((exp) => (
                                <SelectItem key={exp.name} value={exp.name}>{exp.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40" />
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40" />
                    {selectedExperience && (
                        <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => {
                            setCreateForm({ date_from: dateFrom, date_to: dateTo, rooms_available: 10 });
                            setShowCreateDialog(true);
                        }}>
                            <Plus className="w-4 h-4 mr-1" /> Create Slots
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {!selectedExperience ? (
                <div className="text-center py-16">
                    <BedDouble className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-muted-foreground">Select a room type</h3>
                    <p className="text-sm text-muted-foreground mt-1">Choose a hotel experience to view its nightly availability.</p>
                </div>
            ) : isLoading ? (
                <Card className="border border-border">
                    <CardContent className="p-6 space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-foreground">{nights.length}</p>
                                <p className="text-xs text-muted-foreground">Total Nights</p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-emerald-600">{nights.filter(n => n.status === "OPEN" && n.available > 0).length}</p>
                                <p className="text-xs text-muted-foreground">Available</p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-red-500">{nights.filter(n => n.status === "CLOSED" || n.available === 0).length}</p>
                                <p className="text-xs text-muted-foreground">Full</p>
                            </CardContent>
                        </Card>
                        <Card className="border border-border">
                            <CardContent className="p-4 text-center">
                                <p className="text-2xl font-bold text-gray-400">{nights.filter(n => n.status === "NO_SLOT").length}</p>
                                <p className="text-xs text-muted-foreground">No Slot</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Calendar Grid */}
                    <Card className="border border-border">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <CalendarDays className="w-4 h-4" /> Nightly Availability Grid
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            <div className="grid grid-cols-7 gap-1 mb-2">
                                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                                    <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase">{d}</div>
                                ))}
                            </div>
                            {weeks.map((week, wi) => (
                                <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                                    {week.map((night, di) => {
                                        if (!night) return <div key={di} className="h-16" />;
                                        const dateObj = new Date(night.date);
                                        const day = dateObj.getDate();
                                        const statusClass = CELL_COLORS[night.status] || CELL_COLORS.NO_SLOT;
                                        return (
                                            <div key={di} className={`h-16 rounded-lg border text-center flex flex-col items-center justify-center transition-all hover:scale-105 cursor-default ${statusClass}`}>
                                                <span className="text-[10px] font-medium opacity-60">{day}</span>
                                                <span className="text-sm font-bold">{night.available}</span>
                                                <span className="text-[9px] opacity-50">/{night.max_capacity}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500/30" /> Open</span>
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500/30" /> Full / Closed</span>
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-500/30" /> Blocked</span>
                        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-dashed border-gray-400" /> No Slot</span>
                    </div>
                </>
            )}

            {/* Create Slots Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Hotel Slots</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Date From</Label>
                                <Input type="date" value={createForm.date_from} onChange={(e) => setCreateForm(p => ({ ...p, date_from: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Date To</Label>
                                <Input type="date" value={createForm.date_to} onChange={(e) => setCreateForm(p => ({ ...p, date_to: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Rooms Available (per night)</Label>
                            <Input type="number" min="1" value={createForm.rooms_available} onChange={(e) => setCreateForm(p => ({ ...p, rooms_available: parseInt(e.target.value) || 1 }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold" onClick={handleCreateSlots} disabled={createSlotsMutation.isPending}>
                            {createSlotsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                            Create Slots
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
