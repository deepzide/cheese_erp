import React, { useState } from "react";
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

export default function QuotationCreate() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [form, setForm] = useState({
        lead: searchParams.get("lead") || "",
        establishment: searchParams.get("establishment") || "",
        route: searchParams.get("route") || "",
        conversation: searchParams.get("conversation") || "",
        valid_until: "",
        total_price: searchParams.get("total_price") || "",
        deposit_amount: searchParams.get("deposit_amount") || "",
    });
    const [experiences, setExperiences] = useState([]);
    const createMutation = useFrappeCreate("Cheese Quotation");

    const addExperience = () => {
        setExperiences(prev => [...prev, { experience: "", slot: "", date: "", sequence: prev.length + 1 }]);
    };

    const updateExperience = (index, field, value) => {
        setExperiences(prev => prev.map((exp, i) => i === index ? { ...exp, [field]: value } : exp));
    };

    const removeExperience = (index) => {
        setExperiences(prev => prev.filter((_, i) => i !== index).map((exp, i) => ({ ...exp, sequence: i + 1 })));
    };

    const handleSubmit = () => {
        if (!form.lead || !form.route) { toast.error("Lead and route are required"); return; }
        const payload = {
            ...form,
            status: "DRAFT",
            total_price: form.total_price ? parseFloat(form.total_price) : 0,
            deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : 0,
            valid_until: form.valid_until || undefined,
            conversation: form.conversation || undefined,
            establishment: form.establishment || undefined,
        };
        if (experiences.length > 0) {
            payload.experiences = experiences.map(exp => ({
                experience: exp.experience,
                slot: exp.slot || undefined,
                date: exp.date || undefined,
                sequence: exp.sequence,
            }));
        }
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
                                                onChange={(v) => updateExperience(index, "experience", v)}
                                                placeholder="Select..."
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Slot</Label>
                                            <FrappeSearchSelect
                                                doctype="Cheese Experience Slot"
                                                label="name"
                                                value={exp.slot}
                                                onChange={(v) => updateExperience(index, "slot", v)}
                                                placeholder="Select slot..."
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Date</Label>
                                            <Input
                                                type="date"
                                                value={exp.date}
                                                onChange={(e) => updateExperience(index, "date", e.target.value)}
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
                        <Input type="number" min="0" step="0.01" placeholder="1500.00" value={form.total_price} onChange={(e) => setForm(f => ({ ...f, total_price: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Deposit Amount ($)</Label>
                        <Input type="number" min="0" step="0.01" placeholder="500.00" value={form.deposit_amount} onChange={(e) => setForm(f => ({ ...f, deposit_amount: e.target.value }))} />
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}
