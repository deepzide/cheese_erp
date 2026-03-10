import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { format } from "./calendarUtils";

/**
 * Dialog for admins to create a new experience slot.
 * Pre-populates date/time from the clicked grid cell.
 */
export default function CalendarCreateSlotDialog({ open, onClose, prefillDate, prefillHour, onCreated }) {
    const [experience, setExperience] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [timeFrom, setTimeFrom] = useState("");
    const [timeTo, setTimeTo] = useState("");
    const [maxCapacity, setMaxCapacity] = useState("10");

    const createMutation = useFrappeCreate("Cheese Experience Slot");

    // Pre-fill from click context
    useEffect(() => {
        if (open) {
            const dateStr = prefillDate ? format(prefillDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
            setDateFrom(dateStr);
            setDateTo(dateStr);
            if (prefillHour != null) {
                const h = String(prefillHour).padStart(2, "0");
                const hEnd = String(Math.min(prefillHour + 1, 23)).padStart(2, "0");
                setTimeFrom(`${h}:00`);
                setTimeTo(`${hEnd}:00`);
            } else {
                setTimeFrom("09:00");
                setTimeTo("10:00");
            }
            setExperience("");
            setMaxCapacity("10");
        }
    }, [open, prefillDate, prefillHour]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!experience) {
            toast.error("Please select an experience");
            return;
        }
        if (!dateFrom) {
            toast.error("Please select a date");
            return;
        }
        try {
            await createMutation.mutateAsync({
                experience,
                date_from: dateFrom,
                date_to: dateTo || dateFrom,
                time_from: timeFrom || null,
                time_to: timeTo || null,
                max_capacity: parseInt(maxCapacity, 10) || 10,
                slot_status: "OPEN",
            });
            toast.success("Slot created successfully");
            onCreated?.();
            onClose?.();
        } catch (err) {
            toast.error(err?.message || "Failed to create slot");
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="w-4 h-4 text-cheese-600" />
                        Create Time Slot
                    </DialogTitle>
                    <DialogDescription>
                        Add a new availability slot to the calendar
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Experience */}
                    <div className="space-y-1.5">
                        <Label className="text-xs">Experience *</Label>
                        <FrappeSearchSelect
                            doctype="Cheese Experience"
                            value={experience}
                            onChange={setExperience}
                            placeholder="Select experience..."
                            labelField="experience_info"
                        />
                    </div>

                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Date From *</Label>
                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => {
                                    setDateFrom(e.target.value);
                                    if (!dateTo || dateTo < e.target.value) setDateTo(e.target.value);
                                }}
                                required
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Date To</Label>
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                min={dateFrom}
                                className="h-9"
                            />
                        </div>
                    </div>

                    {/* Time Range */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Time From</Label>
                            <Input
                                type="time"
                                value={timeFrom}
                                onChange={(e) => setTimeFrom(e.target.value)}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Time To</Label>
                            <Input
                                type="time"
                                value={timeTo}
                                onChange={(e) => setTimeTo(e.target.value)}
                                className="h-9"
                            />
                        </div>
                    </div>

                    {/* Capacity */}
                    <div className="space-y-1.5">
                        <Label className="text-xs">Max Capacity *</Label>
                        <Input
                            type="number"
                            value={maxCapacity}
                            onChange={(e) => setMaxCapacity(e.target.value)}
                            min="1"
                            required
                            className="h-9 w-32"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} size="sm">
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            className="bg-cheese-500 hover:bg-cheese-600 text-black"
                            disabled={createMutation.isPending}
                        >
                            {createMutation.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Create Slot
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
