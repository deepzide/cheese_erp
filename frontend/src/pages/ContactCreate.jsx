import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";

const LEGACY_LANGUAGE_TO_LABEL = {
    EN: "English",
    ES: "Spanish",
    FR: "French",
    DE: "German",
    IT: "Italian",
    PT: "Portuguese",
};

const LEGACY_CHANNEL_TO_LABEL = {
    WHATSAPP: "WhatsApp",
    EMAIL: "Email",
    SMS: "SMS",
    PHONE: "Phone",
    WEB: "Web",
};

export default function ContactCreate() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const preferredLanguageFromQuery = searchParams.get("preferred_language") || "";
    const preferredChannelFromQuery = searchParams.get("preferred_channel") || "";
    const [form, setForm] = useState({
        full_name: searchParams.get("full_name") || "",
        phone: searchParams.get("phone") || "",
        email: searchParams.get("email") || "",
        preferred_language: LEGACY_LANGUAGE_TO_LABEL[preferredLanguageFromQuery] || preferredLanguageFromQuery,
        preferred_channel: LEGACY_CHANNEL_TO_LABEL[preferredChannelFromQuery] || preferredChannelFromQuery,
    });
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
                            <SelectItem value="English">English</SelectItem>
                            <SelectItem value="Spanish">Spanish</SelectItem>
                            <SelectItem value="French">French</SelectItem>
                            <SelectItem value="German">German</SelectItem>
                            <SelectItem value="Italian">Italian</SelectItem>
                            <SelectItem value="Portuguese">Portuguese</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Preferred Channel</Label>
                    <Select value={form.preferred_channel} onValueChange={(v) => setForm(f => ({ ...f, preferred_channel: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                            <SelectItem value="Email">Email</SelectItem>
                            <SelectItem value="Phone">Phone</SelectItem>
                            <SelectItem value="SMS">SMS</SelectItem>
                            <SelectItem value="Web">Web</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </CreatePageLayout>
    );
}
