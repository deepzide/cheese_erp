import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";

export default function LeadCreate() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [form, setForm] = useState({
        contact: searchParams.get("contact") || "",
        interest_type: searchParams.get("interest_type") || "",
        status: searchParams.get("status") || "New",
    });
    const createMutation = useFrappeCreate("Cheese Lead");

    const handleSubmit = () => {
        if (!form.contact) { toast.error("Contact is required"); return; }
        createMutation.mutate(form, {
            onSuccess: () => { toast.success("Lead created"); navigate("/cheese/leads"); },
            onError: (err) => toast.error(err?.message || "Failed to create lead"),
        });
    };

    return (
        <CreatePageLayout
            title="New Lead"
            description="Register a new sales lead"
            icon={UserPlus}
            backPath="/cheese/leads"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Lead"
        >
            <div className="space-y-5">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Interest Type</Label>
                        <Select value={form.interest_type} onValueChange={(v) => setForm(f => ({ ...f, interest_type: v }))}>
                            <SelectTrigger><SelectValue placeholder="Select interest" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Route">Route</SelectItem>
                                <SelectItem value="Experience">Experience</SelectItem>
                                <SelectItem value="General">General</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="New">New</SelectItem>
                                <SelectItem value="Contacted">Contacted</SelectItem>
                                <SelectItem value="Qualified">Qualified</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}
