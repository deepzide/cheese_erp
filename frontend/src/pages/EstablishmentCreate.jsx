import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import CreatePageLayout from "@/components/CreatePageLayout";
import { establishmentService } from "@/api/establishmentService";

export default function EstablishmentCreate() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [form, setForm] = useState({
        company_name: "",
        abbr: "",
        default_currency: "USD",
        country: "",
        email: "",
        phone_no: "",
        website: "",
        cheese_google_maps_link: "",
        cheese_is_hotel: false,
    });

    const createMutation = useMutation({
        mutationFn: async () => {
            const body = {
                company_name: form.company_name.trim(),
                abbr: form.abbr.trim() || undefined,
                default_currency: form.default_currency.trim() || undefined,
                country: form.country.trim() || undefined,
                email: form.email.trim() || undefined,
                phone_no: form.phone_no.trim() || undefined,
                website: form.website.trim() || undefined,
                cheese_google_maps_link: form.cheese_google_maps_link.trim() || undefined,
                google_maps_link: form.cheese_google_maps_link.trim() || undefined,
                cheese_is_hotel: form.cheese_is_hotel,
            };
            const res = await establishmentService.createEstablishment(body);
            const msg = res?.data?.message || {};
            if (!msg.success) {
                throw new Error(msg.error?.message || msg.message || t("experiences.createError", "Failed to create"));
            }
            return msg.data;
        },
        onSuccess: (data) => {
            toast.success(t("experiences.createSuccess", "Establishment created"));
            const id = data?.company_id;
            if (id) navigate(`/cheese/establishments/${encodeURIComponent(id)}`);
            else navigate("/cheese/establishments");
        },
        onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
    });

    const handleSubmit = () => {
        if (!form.company_name.trim()) {
            toast.error(t("experiences.nameCompanyRequired", "Company name is required"));
            return;
        }
        createMutation.mutate();
    };

    return (
        <CreatePageLayout
            title={t("experiences.newEstablishment", "New Establishment")}
            description={t("experiences.newEstablishmentDesc", "Creates an ERPNext company (chart of accounts copied from the default company)")}
            icon={Building2}
            backPath="/cheese/establishments"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("experiences.createEstablishment", "Create establishment")}
        >
            <div className="space-y-5 max-w-lg">
                <div className="space-y-2">
                    <Label>
                        {t("experiences.providerCompany", "Company name")} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                        value={form.company_name}
                        onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                        placeholder={t("experiences.companyPlaceholder", "e.g. My Venue Ltd")}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>{t("experiences.abbreviation", "Abbreviation")}</Label>
                        <Input
                            value={form.abbr}
                            onChange={(e) => setForm((f) => ({ ...f, abbr: e.target.value }))}
                            placeholder={t("experiences.autoIfEmpty", "Auto if empty")}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t("experiences.defaultCurrency", "Default currency")}</Label>
                        <Input
                            value={form.default_currency}
                            onChange={(e) => setForm((f) => ({ ...f, default_currency: e.target.value }))}
                            placeholder="USD"
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>{t("experiences.country", "Country")}</Label>
                    <Input
                        value={form.country}
                        onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                        placeholder={t("experiences.countryPlaceholder", "Leave blank to use template company country")}
                    />
                </div>
                <div className="space-y-2">
                    <Label>{t("common.email", "Email")}</Label>
                    <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>{t("common.phone", "Phone")}</Label>
                    <Input
                        value={form.phone_no}
                        onChange={(e) => setForm((f) => ({ ...f, phone_no: e.target.value }))}
                    />
                </div>
                <div className="flex items-center gap-2 pt-2">
                    <input
                        type="checkbox"
                        id="is_hotel"
                        className="w-4 h-4 rounded border-gray-300 text-cheese-600 focus:ring-cheese-600"
                        checked={form.cheese_is_hotel}
                        onChange={(e) => setForm(f => ({ ...f, cheese_is_hotel: e.target.checked }))}
                    />
                    <Label htmlFor="is_hotel" className="font-medium cursor-pointer">
                        {t("experiences.isHotel", "This establishment is a Hotel")}
                    </Label>
                </div>
                <div className="space-y-2">
                    <Label>{t("experiences.website", "Website")}</Label>
                    <Input
                        value={form.website}
                        onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>{t("establishment.googleMapsLink", "Google Maps Link")} (`cheese_google_maps_link`)</Label>
                    <Input
                        type="url"
                        value={form.cheese_google_maps_link}
                        onChange={(e) => setForm((f) => ({ ...f, cheese_google_maps_link: e.target.value }))}
                        placeholder={t("establishment.googleMapsPlaceholder", "https://maps.google.com/...")}
                    />
                </div>
            </div>
        </CreatePageLayout>
    );
}
