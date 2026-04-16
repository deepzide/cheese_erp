import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import CreatePageLayout from "@/components/CreatePageLayout";
import { establishmentService } from "@/api/establishmentService";

export default function EstablishmentCreate() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        company_name: "",
        abbr: "",
        default_currency: "USD",
        country: "",
        email: "",
        phone_no: "",
        website: "",
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
            };
            const res = await establishmentService.createEstablishment(body);
            const msg = res?.data?.message || {};
            if (!msg.success) {
                throw new Error(msg.error?.message || msg.message || "Failed to create");
            }
            return msg.data;
        },
        onSuccess: (data) => {
            toast.success("Establishment created");
            const id = data?.company_id;
            if (id) navigate(`/cheese/establishments/${encodeURIComponent(id)}`);
            else navigate("/cheese/establishments");
        },
        onError: (err) => toast.error(err?.message || "Failed"),
    });

    const handleSubmit = () => {
        if (!form.company_name.trim()) {
            toast.error("Company name is required");
            return;
        }
        createMutation.mutate();
    };

    return (
        <CreatePageLayout
            title="New Establishment"
            description="Creates an ERPNext company (chart of accounts copied from the default company)"
            icon={Building2}
            backPath="/cheese/establishments"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Create establishment"
        >
            <div className="space-y-5 max-w-lg">
                <div className="space-y-2">
                    <Label>
                        Company name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                        value={form.company_name}
                        onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                        placeholder="e.g. My Venue Ltd"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Abbreviation</Label>
                        <Input
                            value={form.abbr}
                            onChange={(e) => setForm((f) => ({ ...f, abbr: e.target.value }))}
                            placeholder="Auto if empty"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Default currency</Label>
                        <Input
                            value={form.default_currency}
                            onChange={(e) => setForm((f) => ({ ...f, default_currency: e.target.value }))}
                            placeholder="USD"
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Country</Label>
                    <Input
                        value={form.country}
                        onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                        placeholder="Leave blank to use template company country"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                        value={form.phone_no}
                        onChange={(e) => setForm((f) => ({ ...f, phone_no: e.target.value }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Website</Label>
                    <Input
                        value={form.website}
                        onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    />
                </div>
            </div>
        </CreatePageLayout>
    );
}
