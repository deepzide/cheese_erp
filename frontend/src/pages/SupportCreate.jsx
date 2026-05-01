import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
    const { t } = useTranslation();
    const contactId = searchParams.get('contact') || '';
    const backPath = contactId ? `/cheese/contacts/${contactId}` : "/cheese/support";
    const [form, setForm] = useState({
        contact_id: searchParams.get('contact') || "",
        ticket_id: searchParams.get('ticket') || "",
        description: "",
        priority: "Medium",
        incident_type: "GENERAL",
        route_id: "",
        company_id: "",
    });

    const createMutation = useMutation({
        mutationFn: (data) => supportService.createComplaint(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['support-cases'] });
            toast.success(t("support.createSuccess", "Support case created"));
            navigate("/cheese/support");
        },
        onError: (err) => toast.error(err?.message || t("support.createError", "Failed to create support case")),
    });

    const handleSubmit = () => {
        if (!form.contact_id || !form.description) { toast.error(t("support.contactDescriptionRequired", "Contact and description are required")); return; }
        createMutation.mutate(form);
    };

    return (
        <CreatePageLayout
            title={t("support.newSupportCase", "New Support Case")}
            description={t("support.newSupportCaseDesc", "File a complaint or support request")}
            icon={Shield}
            backPath={backPath}
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("support.createSupportCase", "Create Support Case")}
        >
            <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("nav.contacts", "Contact")} <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Contact"
                            label="full_name"
                            value={form.contact_id}
                            onChange={(v) => setForm(f => ({ ...f, contact_id: v }))}
                            placeholder={t("tickets.selectContact", "Select contact...")}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t("support.relatedTicket", "Related Ticket")}</Label>
                        <FrappeSearchSelect
                            doctype="Cheese Ticket"
                            label="name"
                            value={form.ticket_id}
                            onChange={(v) => setForm(f => ({ ...f, ticket_id: v }))}
                            placeholder={t("support.selectTicketOptional", "Select ticket (optional)...")}
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>{t("support.incidentType", "Incident Type")}</Label>
                    <Select value={form.incident_type} onValueChange={(v) => setForm(f => ({ ...f, incident_type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="GENERAL">{t("support.general", "General")}</SelectItem>
                            <SelectItem value="LOCAL">{t("support.local", "Local")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("support.routeOptional", "Route (optional)")}</Label>
                        <FrappeSearchSelect
                            doctype="Cheese Route"
                            label="name"
                            value={form.route_id}
                            onChange={(v) => setForm(f => ({ ...f, route_id: v }))}
                            placeholder={t("support.filterByRoute", "Filter context by route...")}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t("support.establishmentOptional", "Establishment (optional)")}</Label>
                        <FrappeSearchSelect
                            doctype="Company"
                            label="name"
                            value={form.company_id}
                            onChange={(v) => setForm(f => ({ ...f, company_id: v }))}
                            placeholder={t("support.filterByEstablishment", "Filter context by establishment...")}
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>{t("support.priority", "Priority")}</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Low">{t("support.low", "Low")}</SelectItem>
                            <SelectItem value="Medium">{t("support.medium", "Medium")}</SelectItem>
                            <SelectItem value="High">{t("support.high", "High")}</SelectItem>
                            <SelectItem value="Urgent">{t("support.urgent", "Urgent")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>{t("support.description", "Description")} <span className="text-red-500">*</span></Label>
                    <Textarea
                        placeholder={t("support.describeIssue", "Describe the issue in detail...")}
                        rows={5}
                        value={form.description}
                        onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                    />
                </div>
            </div>
        </CreatePageLayout>
    );
}
