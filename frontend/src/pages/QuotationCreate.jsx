import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate, useFrappeDoc, useFrappeList } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { experienceService } from "@/api/experienceService";

export default function QuotationCreate() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const todayStr = new Date().toISOString().slice(0, 10);

    const toDatetimeLocal = (d) => {
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const defaultValidUntil = toDatetimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const defaultPartySize = parseInt(searchParams.get("party_size") || "1", 10) || 1;

    const [form, setForm] = useState({
        lead: searchParams.get("lead") || "",
        establishment: searchParams.get("establishment") || "",
        route: searchParams.get("route") || "",
        conversation: searchParams.get("conversation") || "",
        valid_until: searchParams.get("valid_until") || defaultValidUntil,
        party_size: defaultPartySize,
    });
    const [experiences, setExperiences] = useState([]);
    const [experienceDetailsById, setExperienceDetailsById] = useState({});
    const [availableDatesByRow, setAvailableDatesByRow] = useState({});
    const [availableSlotsByRow, setAvailableSlotsByRow] = useState({});
    const createMutation = useFrappeCreate("Cheese Quotation");
    const { data: routeDoc } = useFrappeDoc("Cheese Route", form.route, { enabled: !!form.route });
    const { data: routesRaw = [] } = useFrappeList("Cheese Route", {
        fields: ["name", "short_description", "status"],
        pageSize: 200,
    });
    const { data: experiencesRaw = [] } = useFrappeList("Cheese Experience", {
        fields: ["name", "experience_info", "company", "status"],
        pageSize: 500,
    });
    const routeExperienceIds = useMemo(() => {
        if (!form.route || !routeDoc?.experiences) return [];
        return routeDoc.experiences.map((row) => row.experience).filter(Boolean);
    }, [form.route, routeDoc]);

    const routeOptions = useMemo(() => {
        return (Array.isArray(routesRaw) ? routesRaw : []).filter((r) => r.status === "ONLINE");
    }, [routesRaw]);

    const experienceOptions = useMemo(() => {
        const allOnline = (Array.isArray(experiencesRaw) ? experiencesRaw : []).filter((exp) => exp.status === "ONLINE");
        if (form.route) {
            const allowed = new Set(routeExperienceIds);
            return allOnline.filter((exp) => allowed.has(exp.name));
        }
        if (form.establishment) {
            return allOnline.filter((exp) => exp.company === form.establishment);
        }
        return allOnline;
    }, [experiencesRaw, routeExperienceIds, form.route, form.establishment]);

    const addExperience = () => {
        setExperiences(prev => [...prev, { experience: "", slot: "", date: "", sequence: prev.length + 1 }]);
    };

    const ensureExperienceDetails = async (experienceId) => {
        if (!experienceId) return;
        if (experienceDetailsById[experienceId]) return experienceDetailsById[experienceId];
        try {
            const result = await experienceService.getExperienceDetail(experienceId);
            const payload = result?.data?.message || result?.data || result;
            const details = payload?.data || payload;
            setExperienceDetailsById(prev => ({ ...prev, [experienceId]: details }));
            return details;
        } catch (err) {
            toast.error(err?.message || "Failed to load experience details");
            return null;
        }
    };

    const fetchSlotForDate = async (rowIndex, experienceId, date) => {
        if (!experienceId || !date) return;
        if (date < todayStr) {
            toast.error("Past dates are not allowed.");
            return;
        }
        const partySize = parseInt(form.party_size, 10) || 1;

        try {
            const result = await experienceService.listTimeSlots(experienceId, {
                date_from: date,
                date_to: date,
                slot_status: "OPEN",
                page: 1,
                page_size: 20,
            });
            const payload = result?.data?.message || result?.data || result;
            const slots = payload?.data || [];
            const capacitySlots = slots
                .filter(s => (s.available_capacity ?? 0) >= partySize)
                .sort((a, b) => (a.time_from || "").localeCompare(b.time_from || ""));

            const best = capacitySlots[0];

            if (!best) {
                toast.error(`No open slot available for ${date} with enough capacity for ${partySize} people.`);
                return;
            }

            setExperiences(prev =>
                prev.map((exp, i) => {
                    if (i !== rowIndex) return exp;
                    if (exp.experience !== experienceId || exp.date !== date) return exp; // stale guard
                    return { ...exp, slot: best.name };
                })
            );
        } catch (err) {
            toast.error(err?.message || "Failed to fetch slot");
        }
    };

    const loadDateAndSlotOptions = async (rowIndex, experienceId) => {
        if (!experienceId) {
            setAvailableDatesByRow((prev) => ({ ...prev, [rowIndex]: [] }));
            setAvailableSlotsByRow((prev) => ({ ...prev, [rowIndex]: [] }));
            return [];
        }
        const partySizeForFilter = parseInt(form.party_size, 10) || 1;
        try {
            const result = await experienceService.listTimeSlots(experienceId, {
                date_from: todayStr,
                slot_status: "OPEN",
                page: 1,
                page_size: 500,
            });
            const payload = result?.data?.message || result?.data || result;
            const slots = payload?.data || [];
            const filteredSlots = slots
                .filter((s) => (s.available_capacity ?? 0) >= partySizeForFilter)
                .sort((a, b) => {
                    const dateCmp = (a.date_from || "").localeCompare(b.date_from || "");
                    if (dateCmp !== 0) return dateCmp;
                    return (a.time_from || "").localeCompare(b.time_from || "");
                });
            const uniqueDates = [...new Set(filteredSlots.map((s) => s.date_from).filter(Boolean))];
            setAvailableDatesByRow((prev) => ({ ...prev, [rowIndex]: uniqueDates }));
            setAvailableSlotsByRow((prev) => ({ ...prev, [rowIndex]: filteredSlots }));
            return uniqueDates;
        } catch (err) {
            toast.error(err?.message || "Failed to load available dates");
            setAvailableDatesByRow((prev) => ({ ...prev, [rowIndex]: [] }));
            setAvailableSlotsByRow((prev) => ({ ...prev, [rowIndex]: [] }));
            return [];
        }
    };

    const handleExperienceChange = async (index, experienceId) => {
        const rowDate = experiences[index]?.date || "";
        if (form.route && routeDoc?.experiences?.length) {
            const allowed = new Set(routeDoc.experiences.map((row) => row.experience));
            if (experienceId && !allowed.has(experienceId)) {
                toast.error("Selected experience does not belong to the chosen route.");
                return;
            }
        }
        setExperiences(prev =>
            prev.map((exp, i) => (i === index ? { ...exp, experience: experienceId, slot: "", date: "" } : exp))
        );

        const details = await ensureExperienceDetails(experienceId);
        if (form.establishment && details?.company && details.company !== form.establishment) {
            toast.error("Experience does not belong to selected establishment.");
            setExperiences(prev =>
                prev.map((exp, i) => (i === index ? { ...exp, experience: "", slot: "" } : exp))
            );
            return;
        }
        if (experienceId) {
            const dates = await loadDateAndSlotOptions(index, experienceId);
            const preferredDate = rowDate && dates.includes(rowDate) ? rowDate : dates[0];
            if (preferredDate) {
                setExperiences(prev =>
                    prev.map((exp, i) => (i === index ? { ...exp, date: preferredDate, slot: "" } : exp))
                );
                fetchSlotForDate(index, experienceId, preferredDate);
            } else {
                toast.error("No available slot dates for the selected experience.");
            }
        }
    };

    const handleDateChange = (index, date) => {
        if (date && date < todayStr) {
            toast.error("Past dates are not allowed.");
            return;
        }
        const rowExperience = experiences[index]?.experience || "";
        setExperiences(prev =>
            prev.map((exp, i) => (i === index ? { ...exp, date, slot: "" } : exp))
        );
        if (rowExperience && date) {
            fetchSlotForDate(index, rowExperience, date);
        }
    };

    const removeExperience = (index) => {
        setExperiences(prev => prev.filter((_, i) => i !== index).map((exp, i) => ({ ...exp, sequence: i + 1 })));
        setAvailableDatesByRow({});
        setAvailableSlotsByRow({});
    };

    useEffect(() => {
        if (!form.route) return;
        if (!routeOptions.some((r) => r.name === form.route)) {
            setForm((prev) => ({ ...prev, route: "" }));
            setExperiences((prev) => prev.map((row) => ({ ...row, experience: "", date: "", slot: "" })));
        }
    }, [form.route, routeOptions]);

    const partySize = parseInt(form.party_size, 10) || 1;
    const computedTotals = useMemo(() => {
        let totalPrice = 0;
        let depositAmount = 0;

        experiences.forEach((exp) => {
            if (!exp.experience || !exp.slot) return;
            const details = experienceDetailsById[exp.experience];
            const pricing = details?.pricing || {};
            const deposit = details?.deposit || {};

            const unitPrice = form.route ? (pricing.route_price || 0) : (pricing.individual_price || 0);
            const rowTotal = unitPrice * partySize;
            totalPrice += rowTotal;

            if (deposit.deposit_required) {
                if (deposit.deposit_type === "%") {
                    depositAmount += rowTotal * (deposit.deposit_value || 0) / 100;
                } else {
                    depositAmount += deposit.deposit_value || 0;
                }
            }
        });

        return { totalPrice, depositAmount };
    }, [experiences, experienceDetailsById, partySize, form.route]);

    const handleSubmit = () => {
        if (!form.lead || !form.route) { toast.error("Lead and route are required"); return; }
        if (form.valid_until && new Date(form.valid_until) < new Date()) {
            toast.error("Quotation cannot be created with an expired validity date.");
            return;
        }

        const filledExperiences = experiences.filter(exp => exp.experience && exp.slot);
        if (filledExperiences.length === 0) {
            toast.error("Add at least one experience with a slot (select date + auto-fetch slot).");
            return;
        }

        const payload = {
            ...form,
            status: "DRAFT",
            total_price: computedTotals.totalPrice,
            deposit_amount: computedTotals.depositAmount,
            valid_until: form.valid_until || undefined,
            conversation: form.conversation || undefined,
            establishment: form.establishment || undefined,
        };

        payload.experiences = filledExperiences.map(exp => ({
            experience: exp.experience,
            slot: exp.slot || undefined,
            date: exp.date || undefined,
            sequence: exp.sequence,
        }));

        createMutation.mutate(payload, {
            onSuccess: () => { toast.success("Quotation created"); navigate("/cheese/quotations"); },
            onError: (err) => toast.error(err?.message || "Failed to create quotation"),
        });
    };

    return (
        <CreatePageLayout
            title="New Quotation"
            description="Create a price quote for a lead"
            icon={FileText}
            backPath="/cheese/quotations"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Quotation"
        >
            <div className="space-y-6">
                {/* Lead & Establishment */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Lead <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Lead"
                            label="contact"
                            value={form.lead}
                            onChange={(v) => setForm(f => ({ ...f, lead: v }))}
                            placeholder="Select a lead..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Establishment</Label>
                        <FrappeSearchSelect
                            doctype="Company"
                            label="name"
                            value={form.establishment}
                            onChange={(v) => setForm(f => ({ ...f, establishment: v }))}
                            placeholder="Select company..."
                        />
                    </div>
                </div>

                {/* Route & Conversation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Route <span className="text-red-500">*</span></Label>
                        <Select
                            value={form.route || "none"}
                            onValueChange={(v) => setForm(f => ({ ...f, route: v === "none" ? "" : v }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select a route..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Select a route...</SelectItem>
                                {routeOptions.map((route) => (
                                    <SelectItem key={route.name} value={route.name}>
                                        {route.short_description || route.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Conversation</Label>
                        <FrappeSearchSelect
                            doctype="Conversation"
                            label="name"
                            value={form.conversation}
                            onChange={(v) => setForm(f => ({ ...f, conversation: v }))}
                            placeholder="Link a conversation..."
                        />
                    </div>
                </div>

                {/* Valid Until */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Valid Until</Label>
                        <Input
                            type="datetime-local"
                            value={form.valid_until}
                            onChange={(e) => setForm(f => ({ ...f, valid_until: e.target.value }))}
                            min={toDatetimeLocal(new Date())}
                        />
                        <p className="text-xs text-muted-foreground">When this quote expires</p>
                    </div>
                    <div className="space-y-2">
                        <Label>
                            Party Size <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            type="number"
                            min="1"
                            value={form.party_size}
                            onChange={(e) => setForm(f => ({ ...f, party_size: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Number of people for this quote</p>
                    </div>
                </div>

                {/* Experiences Table */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Experiences</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addExperience} className="h-7 text-xs">
                            <Plus className="w-3 h-3 mr-1" /> Add Experience
                        </Button>
                    </div>
                    {experiences.length === 0 ? (
                        <div className="text-center py-6 border-2 border-dashed border-border rounded-lg bg-muted/30">
                            <p className="text-sm text-muted-foreground">No experiences added yet</p>
                            <Button type="button" variant="ghost" size="sm" onClick={addExperience} className="mt-2 text-xs">
                                <Plus className="w-3 h-3 mr-1" /> Add Experience
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {experiences.map((exp, index) => (
                                <div key={index} className="p-3 border border-border rounded-lg bg-muted/20 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-muted-foreground">#{exp.sequence}</span>
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-600" onClick={() => removeExperience(index)}>
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Experience *</Label>
                                            <Select
                                                value={exp.experience || "none"}
                                                onValueChange={(v) => handleExperienceChange(index, v === "none" ? "" : v)}
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder="Select..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Select...</SelectItem>
                                                    {experienceOptions.map((eOpt) => (
                                                        <SelectItem key={eOpt.name} value={eOpt.name}>
                                                            {eOpt.experience_info || eOpt.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Date</Label>
                                            <Select
                                                value={exp.date || "none"}
                                                onValueChange={(v) => handleDateChange(index, v === "none" ? "" : v)}
                                                disabled={!exp.experience}
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder={exp.experience ? "Select date" : "Select experience first"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Select date</SelectItem>
                                                    {(availableDatesByRow[index] || []).map((dateValue) => (
                                                        <SelectItem key={dateValue} value={dateValue}>
                                                            {dateValue}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Time Slot</Label>
                                            <Select
                                                value={exp.slot || "none"}
                                                onValueChange={(v) => {
                                                    setExperiences(prev =>
                                                        prev.map((e, i) => (i === index ? { ...e, slot: v === "none" ? "" : v } : e))
                                                    );
                                                }}
                                                disabled={!exp.date}
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder={exp.date ? "Select time slot" : "Select date first"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Select time slot</SelectItem>
                                                    {(availableSlotsByRow[index] || [])
                                                        .filter((s) => s.date_from === exp.date)
                                                        .map((s) => (
                                                            <SelectItem key={s.name} value={s.name}>
                                                                {s.time_from || "All day"} – {s.time_to || ""} ({s.available_capacity ?? 0} avail.)
                                                            </SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pricing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Total Price ($)</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={Number(computedTotals.totalPrice).toFixed(2)}
                            readOnly
                            className="font-semibold"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Deposit Amount ($)</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={Number(computedTotals.depositAmount).toFixed(2)}
                            readOnly
                            className="font-semibold"
                        />
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}
