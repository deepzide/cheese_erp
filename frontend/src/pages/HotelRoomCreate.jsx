import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BedDouble, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useAuth } from "@/components/auth/AuthProvider";

export default function HotelRoomCreate() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useTranslation();
    const { isAdmin, userCompany } = useAuth();
    const hotelFilter = searchParams.get("hotel") || (!isAdmin ? userCompany : "") || "";

    const [form, setForm] = useState({
        name: "",
        company: hotelFilter,
        experience_type: "HOTEL",
        status: "ONLINE",
        is_room: 1,
        room_size: "2",
        price_per_night: "",
        max_occupancy_per_unit: "2",
        min_nights_stay: "1",
        cancel_days_before: 0,
        modify_days_before: 0,
        refund_policy: "FULL",
        deposit_ttl_days: 2,
        deposit_required: false,
        deposit_type: "Amount",
        deposit_value: "",
    });

    const createMutation = useFrappeCreate("Cheese Experience");

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = () => {
        if (!form.name || !form.company || !form.price_per_night) {
            toast.error(t("hotelReservations.roomNameHotelPriceRequired", "Room name, hotel, and price are required"));
            return;
        }

        const payload = {
            ...form,
            cancel_days_before: parseInt(form.cancel_days_before) || 0,
            modify_days_before: parseInt(form.modify_days_before) || 0,
            deposit_ttl_days: parseInt(form.deposit_ttl_days) || 1,
            deposit_required: form.deposit_required ? 1 : 0,
            deposit_value: form.deposit_value ? Number(form.deposit_value) : 0,
            price_per_night: form.price_per_night ? Number(form.price_per_night) : 0,
            room_size: parseInt(form.room_size) || 1,
            max_occupancy_per_unit: parseInt(form.room_size) || parseInt(form.max_occupancy_per_unit) || 1,
            min_nights_stay: parseInt(form.min_nights_stay) || 1,
        };

        createMutation.mutate(payload, {
            onSuccess: (data) => {
                toast.success(t("hotelReservations.roomCreated", "Room created"));
                navigate(`/cheese/hotel-availability`);
            },
            onError: (err) => toast.error(err?.message || t("hotelReservations.createRoomError", "Failed to create room")),
        });
    };

    return (
        <CreatePageLayout
            title={t("hotelReservations.newRoomType", "New Room Type")}
            description={t("hotelReservations.newRoomTypeDesc", "Create a new room category for a hotel")}
            icon={BedDouble}
            backPath="/cheese/hotels"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("hotelReservations.createRoom", "Create Room")}
        >
            <div className="space-y-8">
                {/* Basic Details */}
                <div className="space-y-5">
                    <div className="space-y-2">
                        <Label>{t("hotelReservations.hotel", "Hotel")} <span className="text-red-500">*</span></Label>
                        {isAdmin ? (
                            <FrappeSearchSelect
                                doctype="Company"
                                label="company_name"
                                value={form.company}
                                onChange={(v) => handleChange("company", v)}
                                filters={{ cheese_is_hotel: 1 }}
                                placeholder={t("hotelReservations.selectHotel", "Select hotel...")}
                            />
                        ) : (
                            <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-muted/50 px-3">
                                <Building2 className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{form.company}</span>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label>{t("hotelReservations.roomTypeName", "Room Type Name")} <span className="text-red-500">*</span></Label>
                        <Input
                            placeholder={t("hotelReservations.roomNamePlaceholder", "e.g. Deluxe Double Room")}
                            value={form.name}
                            onChange={(e) => handleChange("name", e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{t("hotelReservations.pricePerNight", "Price Per Night ($)")} <span className="text-red-500">*</span></Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={t("hotelReservations.pricePlaceholder", "e.g. 150.00")}
                                value={form.price_per_night}
                                onChange={(e) => handleChange("price_per_night", e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("hotelReservations.maxOccupancy", "Max Occupancy")}</Label>
                            <Input
                                type="number"
                                min="1"
                                value={form.max_occupancy_per_unit}
                                onChange={(e) => handleChange("max_occupancy_per_unit", e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{t("hotelReservations.roomSize", "Room Size")}</Label>
                            <Input
                                type="number"
                                min="1"
                                placeholder={t("hotelReservations.roomSizePlaceholder", "Max guests, e.g. 2")}
                                value={form.room_size}
                                onChange={(e) => {
                                    handleChange("room_size", e.target.value);
                                    handleChange("max_occupancy_per_unit", e.target.value);
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("hotelReservations.minNightsStay", "Min Nights Stay")}</Label>
                            <Input
                                type="number"
                                min="1"
                                value={form.min_nights_stay}
                                onChange={(e) => handleChange("min_nights_stay", e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <hr className="border-border/50" />

                {/* Policies & Deposits */}
                <div className="space-y-6">
                    <h3 className="text-lg font-medium">{t("experiences.policiesDeposits", "Policies & Deposits")}</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 animate-in fade-in">
                        <div className="space-y-2">
                            <Label>{t("experiences.cancelDeadline", "Cancel Deadline (Days)")}</Label>
                            <Input type="number" min="0" value={form.cancel_days_before} onChange={(e) => handleChange("cancel_days_before", e.target.value)} />
                            <p className="text-[10px] text-muted-foreground">{t("hotelReservations.daysBeforeCheckin", "Days before check-in")}</p>
                        </div>
                        <div className="space-y-2">
                            <Label>{t("experiences.modifyDeadline", "Modify Deadline (Days)")}</Label>
                            <Input type="number" min="0" value={form.modify_days_before} onChange={(e) => handleChange("modify_days_before", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("experiences.refundPolicy", "Refund Policy")}</Label>
                            <select
                                value={form.refund_policy}
                                onChange={(e) => handleChange("refund_policy", e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all"
                            >
                                <option value="FULL">{t("hotelReservations.refundFullLabel", "FULL (100% Refundable)")}</option>
                                <option value="PARTIAL">{t("hotelReservations.refundPartialLabel", "PARTIAL")}</option>
                                <option value="NONE">{t("hotelReservations.refundNoneLabel", "NONE (Non-Refundable)")}</option>
                            </select>
                        </div>
                    </div>

                    <div className="p-5 bg-muted/20 border border-border/60 rounded-lg space-y-5">
                        <div className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                id="depositReq"
                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                checked={form.deposit_required}
                                onChange={(e) => handleChange("deposit_required", e.target.checked)}
                            />
                            <Label htmlFor="depositReq" className="text-base cursor-pointer">{t("experiences.depositRequired", "Require Deposit")}</Label>
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
                                    <Label>{t("experiences.ttlDays", "Deposit TTL (Days)")}</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={form.deposit_ttl_days}
                                        onChange={(e) => handleChange("deposit_ttl_days", e.target.value)}
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
