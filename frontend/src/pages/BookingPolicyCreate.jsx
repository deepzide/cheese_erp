import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
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
    const [form, setForm] = useState({
        experience: searchParams.get('experience') || "",
        cancel_until_hours_before: "24",
        modify_until_hours_before: "12",
        min_hours_before_booking: "2",
    });
    const createMutation = useFrappeCreate("Cheese Booking Policy");

    const handleSubmit = () => {
        if (!form.experience) { toast.error(t("bookingPolicy.experienceRequired", "Experience is required")); return; }
        createMutation.mutate({
            experience: form.experience,
            cancel_until_hours_before: parseHours(form.cancel_until_hours_before, 24),
            modify_until_hours_before: parseHours(form.modify_until_hours_before, 12),
            min_hours_before_booking: parseHours(form.min_hours_before_booking, 2),
        }, {
            onSuccess: () => { toast.success(t("bookingPolicy.created", "Booking policy created")); navigate("/cheese/booking-policy"); },
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
                    <Label>{t("experiences.experience", "Experience")} <span className="text-red-500">*</span></Label>
                    <FrappeSearchSelect
                        doctype="Cheese Experience"
                        label="name"
                        value={form.experience}
                        onChange={(v) => setForm(f => ({ ...f, experience: v }))}
                        placeholder={t("routes.selectExperience", "Select an experience...")}
                    />
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
