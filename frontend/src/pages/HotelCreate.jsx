import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hotel } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import { useTranslation } from "react-i18next";

export default function HotelCreate() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [form, setForm] = useState({
        company_name: "",
        abbr: "",
        default_currency: "UYU",
        cheese_is_hotel: 1, // Automatically set as hotel
    });

    const createMutation = useFrappeCreate("Company");

    const handleSubmit = () => {
        if (!form.company_name || !form.abbr) {
            toast.error(t("hotelCreate.nameAbbrRequired", "Hotel name and abbreviation are required"));
            return;
        }

        createMutation.mutate(form, {
            onSuccess: (data) => {
                toast.success(t("hotelCreate.createSuccess", "Hotel created"));
                navigate(`/cheese/hotel-reservations?hotel=${encodeURIComponent(data.name)}`);
            },
            onError: (err) => toast.error(err?.message || t("hotelCreate.createError", "Failed to create hotel")),
        });
    };

    return (
        <CreatePageLayout
            title={t("hotelCreate.newHotel", "New Hotel")}
            description={t("hotelCreate.newHotelDescription", "Create a new hotel company")}
            icon={Hotel}
            backPath="/cheese/hotels"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("hotelCreate.createHotel", "Create Hotel")}
        >
            <div className="space-y-5">
                <div className="space-y-2">
                    <Label>{t("hotelCreate.hotelName", "Hotel Name")} <span className="text-red-500">*</span></Label>
                    <Input
                        placeholder={t("hotelCreate.hotelNamePlaceholder", "e.g. Grand Plaza Hotel")}
                        value={form.company_name}
                        onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>{t("hotelCreate.abbreviation", "Abbreviation")} <span className="text-red-500">*</span></Label>
                    <Input
                        placeholder={t("hotelCreate.abbreviationPlaceholder", "e.g. GPH")}
                        value={form.abbr}
                        onChange={(e) => setForm(f => ({ ...f, abbr: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">{t("hotelCreate.abbreviationHint", "A short identifier for the hotel (2-5 characters).")}</p>
                </div>
                <div className="space-y-2">
                    <Label>{t("hotelCreate.defaultCurrency", "Default Currency")}</Label>
                    <Input
                        value={form.default_currency}
                        onChange={(e) => setForm(f => ({ ...f, default_currency: e.target.value }))}
                    />
                </div>
            </div>
        </CreatePageLayout>
    );
}
