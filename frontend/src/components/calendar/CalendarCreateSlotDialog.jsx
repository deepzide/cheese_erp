import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { format } from "./calendarUtils";
import { experienceService } from "@/api/experienceService";

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
    
    // Recurrence state
    const [repeatType, setRepeatType] = useState("none");
    const [showCustomDialog, setShowCustomDialog] = useState(false);
    const [customRepeatEvery, setCustomRepeatEvery] = useState("1");
    const [customRepeatFrequency, setCustomRepeatFrequency] = useState("week");
    const [customRepeatDays, setCustomRepeatDays] = useState({ sunday: false, monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false });
    const [customEndType, setCustomEndType] = useState("never");
    const [customEndDate, setCustomEndDate] = useState("");
    const [customEndOccurrences, setCustomEndOccurrences] = useState("10");

    const createMutation = useFrappeCreate("Cheese Experience Slot");

    const toApiTime = (value) => {
        if (!value) return null;
        return value.length === 5 ? `${value}:00` : value;
    };

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
            // Reset recurrence
            setRepeatType("none");
            setShowCustomDialog(false);
            setCustomRepeatEvery("1");
            setCustomRepeatFrequency("week");
            setCustomRepeatDays({ sunday: false, monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false });
            setCustomEndType("never");
            setCustomEndDate("");
            setCustomEndOccurrences("10");
        }
    }, [open, prefillDate, prefillHour]);

    const getRecurrenceConfig = () => {
        if (repeatType === "none") return null;
        
        if (repeatType === "custom") {
            const selectedDays = Object.entries(customRepeatDays)
                .filter(([_, selected]) => selected)
                .map(([day, _]) => day);
            
            return {
                type: "custom",
                repeat_every: parseInt(customRepeatEvery, 10) || 1,
                frequency: customRepeatFrequency,
                days: selectedDays,
                end_type: customEndType,
                end_date: customEndType === "date" ? customEndDate : null,
                end_occurrences: customEndType === "occurrences" ? parseInt(customEndOccurrences, 10) : null,
            };
        }
        
        return { type: repeatType };
    };

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
        
        const recurrenceConfig = getRecurrenceConfig();
        const hasRecurrence = recurrenceConfig && recurrenceConfig.type !== "none";
        
        try {
            if (hasRecurrence) {
                // Use recurring slots API
                const result = await experienceService.createRecurringSlots({
                    experience_id: experience,
                    date_from: dateFrom,
                    date_to: dateTo || dateFrom,
                    time_from: toApiTime(timeFrom),
                    time_to: toApiTime(timeTo),
                    max_capacity: parseInt(maxCapacity, 10) || 10,
                    slot_status: "OPEN",
                    recurrence_config: recurrenceConfig,
                });
                
                const count = result?.message?.data?.slots_created || 0;
                toast.success(`Created ${count} slot${count !== 1 ? 's' : ''} successfully`);
            } else {
                // Single slot creation
                await createMutation.mutateAsync({
                    experience,
                    date_from: dateFrom,
                    date_to: dateTo || dateFrom,
                    time_from: toApiTime(timeFrom),
                    time_to: toApiTime(timeTo),
                    max_capacity: parseInt(maxCapacity, 10) || 10,
                    slot_status: "OPEN",
                });
                toast.success("Slot created successfully");
            }
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

                    {/* Recurrence */}
                    <div className="space-y-1.5">
                        <Label className="text-xs">Repeat</Label>
                        <Select value={repeatType} onValueChange={(value) => {
                            setRepeatType(value);
                            if (value === "custom") {
                                setShowCustomDialog(true);
                            }
                        }}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Does not repeat" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Does not repeat</SelectItem>
                                <SelectItem value="daily">Every day</SelectItem>
                                <SelectItem value="weekly">Every week, on {dateFrom ? new Date(dateFrom).toLocaleDateString('en-US', { weekday: 'long' }) : 'selected day'}</SelectItem>
                                <SelectItem value="weekdays">Every weekday (Monday to Friday)</SelectItem>
                                <SelectItem value="custom">Custom...</SelectItem>
                            </SelectContent>
                        </Select>
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
            
            {/* Custom Recurrence Dialog */}
            <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Custom Recurrence</DialogTitle>
                        <DialogDescription>
                            Set up a custom recurrence pattern for this slot
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4">
                        {/* Repeat Every */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Repeat every</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    value={customRepeatEvery}
                                    onChange={(e) => setCustomRepeatEvery(e.target.value)}
                                    min="1"
                                    className="h-9 w-20"
                                />
                                <Select value={customRepeatFrequency} onValueChange={setCustomRepeatFrequency}>
                                    <SelectTrigger className="h-9 flex-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="day">day(s)</SelectItem>
                                        <SelectItem value="week">week(s)</SelectItem>
                                        <SelectItem value="month">month(s)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Repeat On (for weekly) */}
                        {customRepeatFrequency === "week" && (
                            <div className="space-y-1.5">
                                <Label className="text-xs">Repeat on</Label>
                                <div className="flex gap-1">
                                    {[
                                        { key: "sunday", label: "D" },
                                        { key: "monday", label: "L" },
                                        { key: "tuesday", label: "M" },
                                        { key: "wednesday", label: "X" },
                                        { key: "thursday", label: "J" },
                                        { key: "friday", label: "V" },
                                        { key: "saturday", label: "S" },
                                    ].map(({ key, label }) => (
                                        <Button
                                            key={key}
                                            type="button"
                                            variant={customRepeatDays[key] ? "default" : "outline"}
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={() => setCustomRepeatDays(prev => ({ ...prev, [key]: !prev[key] }))}
                                        >
                                            {label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Ends */}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Ends</Label>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        id="end-never"
                                        name="end-type"
                                        checked={customEndType === "never"}
                                        onChange={() => setCustomEndType("never")}
                                        className="w-4 h-4"
                                    />
                                    <Label htmlFor="end-never" className="text-xs font-normal cursor-pointer">Never</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        id="end-date"
                                        name="end-type"
                                        checked={customEndType === "date"}
                                        onChange={() => setCustomEndType("date")}
                                        className="w-4 h-4"
                                    />
                                    <Label htmlFor="end-date" className="text-xs font-normal cursor-pointer flex items-center gap-2">
                                        On
                                        <Input
                                            type="date"
                                            value={customEndDate}
                                            onChange={(e) => setCustomEndDate(e.target.value)}
                                            min={dateFrom}
                                            disabled={customEndType !== "date"}
                                            className="h-8 w-32"
                                        />
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        id="end-occurrences"
                                        name="end-type"
                                        checked={customEndType === "occurrences"}
                                        onChange={() => setCustomEndType("occurrences")}
                                        className="w-4 h-4"
                                    />
                                    <Label htmlFor="end-occurrences" className="text-xs font-normal cursor-pointer flex items-center gap-2">
                                        After
                                        <Input
                                            type="number"
                                            value={customEndOccurrences}
                                            onChange={(e) => setCustomEndOccurrences(e.target.value)}
                                            min="1"
                                            disabled={customEndType !== "occurrences"}
                                            className="h-8 w-20"
                                        />
                                        occurrences
                                    </Label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setShowCustomDialog(false)} size="sm">
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            className="bg-cheese-500 hover:bg-cheese-600 text-black"
                            onClick={() => {
                                if (customRepeatFrequency === "week" && !Object.values(customRepeatDays).some(v => v)) {
                                    toast.error("Please select at least one day");
                                    return;
                                }
                                setShowCustomDialog(false);
                            }}
                        >
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}
