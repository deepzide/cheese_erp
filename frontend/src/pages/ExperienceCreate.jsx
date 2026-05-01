import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function ExperienceCreate() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const createMutation = useFrappeCreate("Cheese Experience");

    const [form, setForm] = useState({
        experience_info: "",
        company: "",
        status: "OFFLINE",
        package_mode: "Both",
        individual_price: "",
        route_price: "",
        event_duration_hours: "",
        deposit_ttl_hours: 48,
        deposit_required: false,
        deposit_type: "Amount",
        deposit_value: "",
    });

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = () => {
        if (!form.experience_info || !form.company) {
            toast.error(t("experiences.nameCompanyRequired", "Experience name and company are required"));
            return;
        }

        const hours = parseFloat(form.event_duration_hours) || 0;

        const payload = {
            name: form.experience_info,
            experience_info: form.experience_info,
            company: form.company,
            status: form.status,
            experience_type: "ACTIVITY",
            package_mode: form.package_mode,
            deposit_required: form.deposit_required ? 1 : 0,
            deposit_type: form.deposit_type,
            deposit_value: form.deposit_value ? Number(form.deposit_value) : 0,
            individual_price: form.individual_price ? Number(form.individual_price) : 0,
            route_price: form.route_price ? Number(form.route_price) : 0,
            event_duration: hours > 0 ? Math.round(hours * 3600) : 0,
            deposit_ttl_hours: form.deposit_ttl_hours ? Number(form.deposit_ttl_hours) : 48,
        };

        createMutation.mutate(payload, {
            onSuccess: (res) => {
                const responsePayload = res?.message || res;
                const name = responsePayload?.name || responsePayload?.data?.name || undefined;
                toast.success(t("experiences.createSuccess", "Activity created successfully"));
                if (name) {
                    navigate(`/cheese/experiences/${name}`);
                } else {
                    navigate("/cheese/experiences");
                }
            },
            onError: (err) => toast.error(err?.message || t("experiences.createError", "Failed to create experience")),
        });
    };

    return (
        <CreatePageLayout
            title={t("experiences.newExperience", "New Experience")}
            description={t("experiences.newExperienceDesc", "Create a new activity or tour for your routes")}
            icon={Sparkles}
            backPath="/cheese/experiences"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("experiences.createExperience", "Create Experience")}
        >
            <div className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("experiences.experienceName", "Experience Name")} <span className="text-red-500">*</span></Label>
                        <Input
                            value={form.experience_info}
                            onChange={(e) => handleChange("experience_info", e.target.value)}
                            placeholder={t("experiences.namePlaceholder", "e.g. Wine Tasting Menu")}
                            className="transition-all focus:ring-primary"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t("experiences.providerCompany", "Provider Company")} <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Company"
                            label="name"
                            value={form.company}
                            onChange={(v) => handleChange("company", v)}
                            placeholder={t("experiences.selectProvider", "Select provider company...")}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("common.status", "Status")}</Label>
                        <select
                            value={form.status}
                            onChange={(e) => handleChange("status", e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all"
                        >
                            <option value="ONLINE">{t("status.ONLINE", "ONLINE")}</option>
                            <option value="OFFLINE">{t("status.OFFLINE", "OFFLINE")}</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>{t("experiences.packageMode", "Package Mode")}</Label>
                        <select
                            value={form.package_mode}
                            onChange={(e) => handleChange("package_mode", e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all"
                        >
                            <option value="Establishment">{t("experiences.pkgEstablishment", "A La Carte (Standalone)")}</option>
                            <option value="Route">{t("experiences.pkgRoute", "Route Package Only")}</option>
                            <option value="Both">{t("experiences.pkgBoth", "Both Available")}</option>
                        </select>
                    </div>
                </div>

                <hr className="border-border/50" />

                <div className="space-y-6">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-medium">{t("experiences.activityDetails", "Activity Details")}</h3>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{t("experiences.perEvent", "Per Event")}</Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="space-y-2">
                            <Label>{t("experiences.individualPrice", "Individual Price ($)")}</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.individual_price}
                                onChange={(e) => handleChange("individual_price", e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("experiences.routeAddonPrice", "Route Add-on Price ($)")}</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.route_price}
                                onChange={(e) => handleChange("route_price", e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("experiences.durationHours", "Duration (Hours)")}</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.25"
                                value={form.event_duration_hours}
                                onChange={(e) => handleChange("event_duration_hours", e.target.value)}
                                placeholder={t("experiences.durationPlaceholder", "e.g. 1.5")}
                            />
                        </div>
                    </div>
                </div>

                <hr className="border-border/50" />

                <div className="space-y-6">
                    <h3 className="text-lg font-medium">{t("experiences.policiesDeposits", "Policies & Deposits")}</h3>
                    
                    <div className="p-5 bg-muted/20 border border-border/60 rounded-lg space-y-5">
                        <div className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                id="depositReq"
                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                checked={form.deposit_required}
                                onChange={(e) => handleChange("deposit_required", e.target.checked)}
                            />
                            <Label htmlFor="depositReq" className="text-base cursor-pointer">{t("experiences.requireDeposit", "Require Deposit (Standalone Bookings)")}</Label>
                        </div>
                        
                        {form.deposit_required && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 animate-in fade-in zoom-in-95 duration-200 pt-2 border-t border-border/50">
                                <div className="space-y-2">
                                    <Label>{t("experiences.depositType", "Deposit Type")}</Label>
                                    <select
                                        value={form.deposit_type}
                                        onChange={(e) => handleChange("deposit_type", e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                        <option value="Amount">{t("experiences.fixedAmount", "Fixed Amount ($)")}</option>
                                        <option value="%">{t("experiences.percentage", "Percentage (%)")}</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t("experiences.depositValue", "Deposit Value")}</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.deposit_value}
                                        onChange={(e) => handleChange("deposit_value", e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t("experiences.depositTtlHours", "Deposit TTL (Hours)")}</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={form.deposit_ttl_hours}
                                        onChange={(e) => handleChange("deposit_ttl_hours", e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">{t("experiences.timeToPay", "Time to pay before auto-cancel")}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}

