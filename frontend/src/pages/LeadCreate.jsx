import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
    const { t } = useTranslation();
    const contactId = searchParams.get("contact") || "";
    const [form, setForm] = useState({
        contact: searchParams.get("contact") || "",
        interest_type: searchParams.get("interest_type") || "",
        status: searchParams.get("status") || "OPEN",
    });
    const backPath = contactId ? `/cheese/contacts/${contactId}` : "/cheese/leads";
    const createMutation = useFrappeCreate("Cheese Lead");

    const handleSubmit = () => {
        if (!form.contact) { toast.error(t("tickets.selectContact", "Contact is required")); return; }
        createMutation.mutate(form, {
            onSuccess: () => { toast.success(t("leads.createSuccess", "Lead created")); navigate("/cheese/leads"); },
            onError: (err) => toast.error(err?.message || t("leads.createError", "Failed to create lead")),
        });
    };

    return (
        <CreatePageLayout
            title={t("leads.newLead", "New Lead")}
            description={t("leads.newLeadDesc", "Register a new sales lead")}
            icon={UserPlus}
            backPath={backPath}
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("leads.createLead", "Create Lead")}
        >
            <div className="space-y-5">
                <div className="space-y-2">
                    <Label>{t("nav.contacts", "Contact")} <span className="text-red-500">*</span></Label>
                    <FrappeSearchSelect
                        doctype="Cheese Contact"
                        label="full_name"
                        value={form.contact}
                        onChange={(v) => setForm(f => ({ ...f, contact: v }))}
                        placeholder={t("tickets.selectContact", "Select a contact...")}
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("leads.interestType", "Interest Type")}</Label>
                        <Select value={form.interest_type} onValueChange={(v) => setForm(f => ({ ...f, interest_type: v }))}>
                            <SelectTrigger><SelectValue placeholder={t("leads.selectInterest", "Select interest")} /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Route">{t("nav.routes", "Route")}</SelectItem>
                                <SelectItem value="Experience">{t("nav.experiences", "Experience")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>{t("common.status", "Status")}</Label>
                        <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="OPEN">{t("status.OPEN", "OPEN")}</SelectItem>
                                <SelectItem value="IN_PROGRESS">{t("status.IN_PROGRESS", "IN_PROGRESS")}</SelectItem>
                                <SelectItem value="CONVERTED">{t("status.CONVERTED", "CONVERTED")}</SelectItem>
                                <SelectItem value="LOST">{t("status.LOST", "LOST")}</SelectItem>
                                <SelectItem value="DISCARDED">{t("status.DISCARDED", "DISCARDED")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}
