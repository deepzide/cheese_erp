import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";

export default function ContactCreate() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ full_name: "", phone: "", email: "", preferred_language: "", preferred_channel: "" });
    const createMutation = useFrappeCreate("Cheese Contact");

    const handleSubmit = () => {
        if (!form.full_name || !form.phone) { toast.error("Name and phone are required"); return; }
        createMutation.mutate(form, {
            onSuccess: () => { toast.success("Contact created"); navigate("/cheese/contacts"); },
            onError: (err) => toast.error(err?.message || "Failed to create contact"),
        });
    };

    return (
        <CreatePageLayout
            title="New Contact"
            description="Add a new contact to your database"
            icon={Users}
            backPath="/cheese/contacts"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Contact"
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2 sm:col-span-2">
                    <Label>Full Name <span className="text-red-500">*</span></Label>
                    <Input placeholder="John Doe" value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                    <Label>Phone <span className="text-red-500">*</span></Label>
                    <Input placeholder="+1 555-1234" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" placeholder="email@example.com" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                    <Label>Preferred Language</Label>
                    <Select value={form.preferred_language} onValueChange={(v) => setForm(f => ({ ...f, preferred_language: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="EN">English</SelectItem>
                            <SelectItem value="FR">French</SelectItem>
                            <SelectItem value="AR">Arabic</SelectItem>
                            <SelectItem value="ES">Spanish</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Preferred Channel</Label>
                    <Select value={form.preferred_channel} onValueChange={(v) => setForm(f => ({ ...f, preferred_channel: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                            <SelectItem value="EMAIL">Email</SelectItem>
                            <SelectItem value="PHONE">Phone</SelectItem>
                            <SelectItem value="SMS">SMS</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </CreatePageLayout>
    );
}
