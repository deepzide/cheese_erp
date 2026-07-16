import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import CompanySelect from "@/components/CompanySelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function ExperienceCreate() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const createMutation = useFrappeCreate("Cheese Experience");

    const [form, setForm] = useState({
        experience_info: "",
        experience_type: "ACTIVITY",
        company: "",
        status: "OFFLINE",
        package_mode: "Both",
        individual_price: "",
        currency: "UYU",
        route_price: "",
        event_duration_hours: "",
        price_per_night: "",
        max_occupancy_per_unit: "",
        min_nights_stay: 1,
        is_room: false,
        room_size: "",
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
            experience_type: form.experience_type,
            company: form.company,
            status: form.status,
            package_mode: form.package_mode,
            deposit_required: form.deposit_required ? 1 : 0,
            deposit_type: form.deposit_type,
            deposit_value: form.deposit_value ? Number(form.deposit_value) : 0,
            currency: form.currency || "UYU",
            individual_price: form.individual_price ? Number(form.individual_price) : 0,
            route_price: form.route_price ? Number(form.route_price) : 0,
            event_duration: hours > 0 ? Math.round(hours * 3600) : 0,
            price_per_night: form.price_per_night ? Number(form.price_per_night) : 0,
            max_occupancy_per_unit: form.max_occupancy_per_unit ? Number(form.max_occupancy_per_unit) : 0,
            min_nights_stay: form.min_nights_stay ? Number(form.min_nights_stay) : 1,
            is_room: form.is_room ? 1 : 0,
            room_size: form.room_size ? Number(form.room_size) : 0,
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
                        <CompanySelect
                            value={form.company}
                            onChange={(v) => handleChange("company", v)}
                            placeholder={t("experiences.selectProvider", "Select provider company...")}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("experiences.type", "Type")}</Label>
                        <select
                            value={form.experience_type}
                            onChange={(e) => handleChange("experience_type", e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all"
                        >
                            <option value="ACTIVITY">{t("experiences.activity", "Activity")}</option>
                            <option value="HOTEL">{t("nav.hotels", "Hotel")}</option>
                        </select>
                    </div>
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
                        <h3 className="text-lg font-medium">
                            {form.experience_type === "HOTEL"
                                ? t("experiences.hotelDetails", "Hotel Details")
                                : t("experiences.activityDetails", "Activity Details")}
                        </h3>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                            {form.experience_type === "HOTEL"
                                ? t("experiences.perNight", "Per Night")
                                : t("experiences.perEvent", "Per Event")}
                        </Badge>
                    </div>

                    <div className="space-y-2 max-w-[220px]">
                        <Label>{t("experiences.currency", "Moneda de los precios")}</Label>
                        <select
                            value={form.currency}
                            onChange={(e) => handleChange("currency", e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                        >
                            {["UYU","USD","EUR","BRL","ARS"].map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    {form.experience_type !== "HOTEL" && (
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
                                <Label>{t("experiences.routeAddonPrice", "Route Price ($)")}</Label>
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
                    )}
                    {form.experience_type === "HOTEL" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-2">
                                <Label>{t("experiences.pricePerNight", "Individual Price / Night ($)")}</Label>
                                <Input type="number" min="0" step="0.01" value={form.price_per_night} onChange={(e) => handleChange("price_per_night", e.target.value)} />
                                <p className="text-xs text-muted-foreground">{t("experiences.pricePerNightHelp", "Used for standalone hotel bookings (per night, per room).")}</p>
                            </div>
                            <div className="space-y-2">
                                <Label>{t("experiences.routePrice", "Route Price ($)")}</Label>
                                <Input type="number" min="0" step="0.01" value={form.route_price} onChange={(e) => handleChange("route_price", e.target.value)} />
                                <p className="text-xs text-muted-foreground">{t("experiences.hotelRoutePriceHelp", "Per-person price contributed when this hotel is included in a route.")}</p>
                            </div>
                            <div className="space-y-2">
                                <Label>{t("experiences.maxOccupancy", "Max Occupancy per Unit")}</Label>
                                <Input type="number" min="1" value={form.max_occupancy_per_unit} onChange={(e) => handleChange("max_occupancy_per_unit", e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>{t("experiences.minNightsStay", "Minimum Nights Stay")}</Label>
                                <Input type="number" min="1" value={form.min_nights_stay} onChange={(e) => handleChange("min_nights_stay", e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 pt-7">
                                    <input
                                        type="checkbox"
                                        id="is-room-create"
                                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        checked={form.is_room}
                                        onChange={(e) => handleChange("is_room", e.target.checked)}
                                    />
                                    <Label htmlFor="is-room-create" className="cursor-pointer">{t("experiences.isRoom", "Is Room")}</Label>
                                </div>
                            </div>
                            {form.is_room && (
                                <div className="space-y-2 sm:col-span-2">
                                    <Label>{t("experiences.roomSize", "Room Size (Max Guests)")}</Label>
                                    <Input type="number" min="1" value={form.room_size} onChange={(e) => handleChange("room_size", e.target.value)} />
                                    <p className="text-xs text-muted-foreground">{t("experiences.roomSizeHelp", "Maximum number of people that can book this room type.")}</p>
                                </div>
                            )}
                        </div>
                    )}
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

