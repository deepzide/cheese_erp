import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supportService } from "@/api/supportService";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";

export default function SupportCreate() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const [form, setForm] = useState({
        contact_id: searchParams.get('contact') || "",
        ticket_id: searchParams.get('ticket') || "",
        description: "",
        priority: "Medium",
    });

    const createMutation = useMutation({
        mutationFn: (data) => supportService.createComplaint(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['support-cases'] });
            toast.success("Support case created");
            navigate("/cheese/support");
        },
        onError: (err) => toast.error(err?.message || "Failed to create support case"),
    });

    const handleSubmit = () => {
        if (!form.contact_id || !form.description) { toast.error("Contact and description are required"); return; }
        createMutation.mutate(form);
    };

    return (
        <CreatePageLayout
            title="New Support Case"
            description="File a complaint or support request"
            icon={Shield}
            backPath="/cheese/support"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Support Case"
        >
            <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Contact <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Contact"
                            label="full_name"
                            value={form.contact_id}
                            onChange={(v) => setForm(f => ({ ...f, contact_id: v }))}
                            placeholder="Select contact..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Related Ticket</Label>
                        <FrappeSearchSelect
                            doctype="Cheese Ticket"
                            label="name"
                            value={form.ticket_id}
                            onChange={(v) => setForm(f => ({ ...f, ticket_id: v }))}
                            placeholder="Select ticket (optional)..."
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                            <SelectItem value="Urgent">Urgent</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Description <span className="text-red-500">*</span></Label>
                    <Textarea
                        placeholder="Describe the issue in detail..."
                        rows={5}
                        value={form.description}
                        onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                    />
                </div>
            </div>
        </CreatePageLayout>
    );
}
