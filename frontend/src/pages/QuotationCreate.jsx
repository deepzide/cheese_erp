import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { experienceService } from "@/api/experienceService";

export default function QuotationCreate() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

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
    const createMutation = useFrappeCreate("Cheese Quotation");

    const addExperience = () => {
        setExperiences(prev => [...prev, { experience: "", slot: "", date: "", sequence: prev.length + 1 }]);
    };

    const ensureExperienceDetails = async (experienceId) => {
        if (!experienceId) return;
        if (experienceDetailsById[experienceId]) return;
        try {
            const result = await experienceService.getExperienceDetail(experienceId);
            const payload = result?.data?.message || result?.data || result;
            const details = payload?.data || payload;
            setExperienceDetailsById(prev => ({ ...prev, [experienceId]: details }));
        } catch (err) {
            toast.error(err?.message || "Failed to load experience details");
        }
    };

    const fetchSlotForDate = async (rowIndex, experienceId, date) => {
        if (!experienceId || !date) return;
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

    const handleExperienceChange = async (index, experienceId) => {
        const rowDate = experiences[index]?.date || "";
        setExperiences(prev =>
            prev.map((exp, i) => (i === index ? { ...exp, experience: experienceId, slot: "" } : exp))
        );

        await ensureExperienceDetails(experienceId);
        if (experienceId && rowDate) {
            fetchSlotForDate(index, experienceId, rowDate);
        }
    };

    const handleDateChange = (index, date) => {
        const rowExperience = experiences[index]?.experience || "";
        setExperiences(prev =>
            prev.map((exp, i) => (i === index ? { ...exp, date, slot: "" } : exp))
        );
        if (rowExperience && date) {
            fetchSlotForDate(index, rowExperience, date);
        }
    };

    const handleSlotChange = (index, slotId) => {
        setExperiences(prev => prev.map((exp, i) => (i === index ? { ...exp, slot: slotId } : exp)));
    };

    const removeExperience = (index) => {
        setExperiences(prev => prev.filter((_, i) => i !== index).map((exp, i) => ({ ...exp, sequence: i + 1 })));
    };

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
                        <FrappeSearchSelect
                            doctype="Cheese Route"
                            label="route_info"
                            value={form.route}
                            onChange={(v) => setForm(f => ({ ...f, route: v }))}
                            placeholder="Select a route..."
                        />
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
                                            <FrappeSearchSelect
                                                doctype="Cheese Experience"
                                                label="experience_info"
                                                value={exp.experience}
                                                onChange={(v) => handleExperienceChange(index, v)}
                                                placeholder="Select..."
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Slot</Label>
                                            <FrappeSearchSelect
                                                doctype="Cheese Experience Slot"
                                                label="name"
                                                value={exp.slot}
                                                onChange={(v) => handleSlotChange(index, v)}
                                                placeholder="Select slot..."
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Date</Label>
                                            <Input
                                                type="date"
                                                value={exp.date}
                                                onChange={(e) => handleDateChange(index, e.target.value)}
                                                className="h-9"
                                            />
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
