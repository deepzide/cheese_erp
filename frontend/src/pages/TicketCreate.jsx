import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";

export default function TicketCreate() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [form, setForm] = useState({
        contact: searchParams.get("contact") || "",
        company: searchParams.get("company") || "",
        experience: searchParams.get("experience") || "",
        route: searchParams.get("route") || "",
        slot: searchParams.get("slot") || "",
        party_size: searchParams.get("party_size") || "1",
        conversation: searchParams.get("conversation") || "",
    });
    const createMutation = useFrappeCreate("Cheese Ticket");

    const handleSubmit = () => {
        if (!form.contact || !form.experience || !form.slot) {
            toast.error("Contact, experience, and slot are required");
            return;
        }
        createMutation.mutate({
            contact: form.contact,
            company: form.company || undefined,
            experience: form.experience,
            route: form.route || undefined,
            slot: form.slot,
            party_size: parseInt(form.party_size) || 1,
            status: "PENDING",
            conversation: form.conversation || undefined,
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
                {/* Contact & Company */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Contact <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Contact"
                            label="full_name"
                            value={form.contact}
                            onChange={(v) => setForm(f => ({ ...f, contact: v }))}
                            placeholder="Select a contact..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Company</Label>
                        <FrappeSearchSelect
                            doctype="Company"
                            label="name"
                            value={form.company}
                            onChange={(v) => setForm(f => ({ ...f, company: v }))}
                            placeholder="Select company..."
                        />
                    </div>
                </div>

                {/* Experience & Route */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Experience <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Experience"
                            label="experience_info"
                            value={form.experience}
                            onChange={(v) => setForm(f => ({ ...f, experience: v }))}
                            placeholder="Select an experience..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Route</Label>
                        <FrappeSearchSelect
                            doctype="Cheese Route"
                            label="route_info"
                            value={form.route}
                            onChange={(v) => setForm(f => ({ ...f, route: v }))}
                            placeholder="Select a route..."
                        />
                    </div>
                </div>

                {/* Slot & Party Size */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Slot <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Experience Slot"
                            label="name"
                            value={form.slot}
                            onChange={(v) => setForm(f => ({ ...f, slot: v }))}
                            placeholder="Select a slot..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Party Size <span className="text-red-500">*</span></Label>
                        <Input type="number" min="1" max="50" value={form.party_size} onChange={(e) => setForm(f => ({ ...f, party_size: e.target.value }))} />
                        <p className="text-xs text-muted-foreground">Number of guests</p>
                    </div>
                </div>

                {/* Conversation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
            </div>
        </CreatePageLayout>
    );
}
