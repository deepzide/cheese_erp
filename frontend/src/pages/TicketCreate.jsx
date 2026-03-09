import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";

export default function TicketCreate() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ contact_id: "", experience_id: "", slot_id: "", party_size: "1" });
    const createMutation = useFrappeCreate("Cheese Ticket");

    const handleSubmit = () => {
        if (!form.contact_id || !form.experience_id) { toast.error("Contact and experience are required"); return; }
        createMutation.mutate({
            contact: form.contact_id,
            experience: form.experience_id,
            experience_slot: form.slot_id || undefined,
            party_size: parseInt(form.party_size) || 1,
            status: "PENDING",
        }, {
            onSuccess: () => { toast.success("Ticket created"); navigate("/cheese/tickets"); },
            onError: (err) => toast.error(err?.message || "Failed to create ticket"),
        });
    };

    return (
        <CreatePageLayout
            title="New Ticket"
            description="Create a pending ticket for a guest"
            icon={Ticket}
            backPath="/cheese/tickets"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Ticket"
        >
            <div className="space-y-5">
                <div className="space-y-2">
                    <Label>Contact <span className="text-red-500">*</span></Label>
                    <FrappeSearchSelect
                        doctype="Cheese Contact"
                        label="full_name"
                        value={form.contact_id}
                        onChange={(v) => setForm(f => ({ ...f, contact_id: v }))}
                        placeholder="Select a contact..."
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Experience <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Experience"
                            label="experience_info"
                            value={form.experience_id}
                            onChange={(v) => setForm(f => ({ ...f, experience_id: v }))}
                            placeholder="Select an experience..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Experience Slot</Label>
                        <FrappeSearchSelect
                            doctype="Cheese Experience Slot"
                            label="name"
                            value={form.slot_id}
                            onChange={(v) => setForm(f => ({ ...f, slot_id: v }))}
                            placeholder="Select a slot (optional)..."
                        />
                    </div>
                </div>
                <div className="space-y-2 max-w-[200px]">
                    <Label>Party Size</Label>
                    <Input type="number" min="1" max="50" value={form.party_size} onChange={(e) => setForm(f => ({ ...f, party_size: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">Number of guests</p>
                </div>
            </div>
        </CreatePageLayout>
    );
}
