import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Shield, X } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate, useFrappeList } from "@/lib/useApiData";
import { experienceService } from "@/api/experienceService";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useTranslation } from "react-i18next";

const parseHours = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

export default function BookingPolicyCreate() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialExperience = searchParams.get("experience") || "";
    const [form, setForm] = useState({
        cancel_until_hours_before: "24",
        modify_until_hours_before: "12",
        min_hours_before_booking: "2",
    });
    const [selectedExperience, setSelectedExperience] = useState(initialExperience);
    const [linkedExperiences, setLinkedExperiences] = useState(
        initialExperience ? [initialExperience] : []
    );
    const createMutation = useFrappeCreate("Cheese Booking Policy");
    const { data: experiences = [] } = useFrappeList("Cheese Experience", {
        fields: ["name", "experience_info"],
        pageSize: 200,
    });

    const addExperience = () => {
        if (!selectedExperience) return;
        setLinkedExperiences((prev) =>
            prev.includes(selectedExperience) ? prev : [...prev, selectedExperience]
        );
        setSelectedExperience("");
    };

    const removeExperience = (experienceId) => {
        setLinkedExperiences((prev) => prev.filter((expId) => expId !== experienceId));
    };

    const handleSubmit = () => {
        createMutation.mutate({
            policy_name: linkedExperiences.length
                ? `Policy for ${linkedExperiences[0]}`
                : `Policy ${new Date().toISOString().slice(0, 10)}`,
            cancel_until_hours_before: parseHours(form.cancel_until_hours_before, 24),
            modify_until_hours_before: parseHours(form.modify_until_hours_before, 12),
            min_hours_before_booking: parseHours(form.min_hours_before_booking, 2),
        }, {
            onSuccess: async (created) => {
                const policyId = created?.name || created?.data?.name;
                if (policyId && linkedExperiences.length) {
                    try {
                        await Promise.all(
                            linkedExperiences.map((experienceId) =>
                                experienceService.linkBookingPolicy(experienceId, policyId)
                            )
                        );
                    } catch (linkErr) {
                        toast.error(linkErr?.message || t("bookingPolicy.linkFailed", "Policy created but failed to link to selected experiences"));
                        navigate("/cheese/booking-policy");
                        return;
                    }
                }
                toast.success(t("bookingPolicy.created", "Booking policy created"));
                navigate("/cheese/booking-policy");
            },
            onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
        });
    };

    return (
        <CreatePageLayout
            title={t("bookingPolicy.newPolicy", "New Booking Policy")}
            description={t("bookingPolicy.newPolicyDescription", "Set booking rules for an experience")}
            icon={Shield}
            backPath="/cheese/booking-policy"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("bookingPolicy.createPolicy", "Create Policy")}
        >
            <div className="space-y-5">
                <div className="space-y-2">
                    <Label>{t("experiences.experience", "Experience")}</Label>
                    <div className="flex items-center gap-2">
                        <FrappeSearchSelect
                            doctype="Cheese Experience"
                            label="name"
                            value={selectedExperience}
                            onChange={setSelectedExperience}
                            placeholder={t("routes.selectExperience", "Select an experience...")}
                        />
                        <Button type="button" variant="outline" onClick={addExperience}>
                            {t("common.add", "Add")}
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {linkedExperiences.map((experienceId) => {
                            const match = (Array.isArray(experiences) ? experiences : []).find((exp) => exp.name === experienceId);
                            const label = match?.experience_info || experienceId;
                            return (
                                <span key={experienceId} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                                    {label}
                                    <button type="button" onClick={() => removeExperience(experienceId)}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="space-y-2">
                        <Label>{t("bookingPolicy.cancelBeforeHours", "Cancel Before (hours)")}</Label>
                        <Input type="number" min="0" value={form.cancel_until_hours_before} onChange={(e) => setForm(f => ({ ...f, cancel_until_hours_before: e.target.value }))} />
                        <p className="text-xs text-muted-foreground">{t("bookingPolicy.cancelBeforeHint", "Guests can cancel up to this many hours before")}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>{t("bookingPolicy.modifyBeforeHours", "Modify Before (hours)")}</Label>
                        <Input type="number" min="0" value={form.modify_until_hours_before} onChange={(e) => setForm(f => ({ ...f, modify_until_hours_before: e.target.value }))} />
                        <p className="text-xs text-muted-foreground">{t("bookingPolicy.modifyBeforeHint", "Guests can modify up to this many hours before")}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>{t("bookingPolicy.minLeadHours", "Min Booking Lead (hours)")}</Label>
                        <Input type="number" min="0" value={form.min_hours_before_booking} onChange={(e) => setForm(f => ({ ...f, min_hours_before_booking: e.target.value }))} />
                        <p className="text-xs text-muted-foreground">{t("bookingPolicy.minLeadHoursHint", "Minimum hours in advance to book")}</p>
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}
