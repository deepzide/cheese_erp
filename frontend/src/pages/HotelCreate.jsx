import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hotel } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";

export default function HotelCreate() {
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
            toast.error("Hotel name and abbreviation are required");
            return;
        }

        createMutation.mutate(form, {
            onSuccess: (data) => {
                toast.success("Hotel created");
                navigate(`/cheese/hotel-reservations?hotel=${encodeURIComponent(data.name)}`);
            },
            onError: (err) => toast.error(err?.message || "Failed to create hotel"),
        });
    };

    return (
        <CreatePageLayout
            title="New Hotel"
            description="Create a new hotel establishment"
            icon={Hotel}
            backPath="/cheese/hotels"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Hotel"
        >
            <div className="space-y-5">
                <div className="space-y-2">
                    <Label>Hotel Name <span className="text-red-500">*</span></Label>
                    <Input
                        placeholder="e.g. Grand Plaza Hotel"
                        value={form.company_name}
                        onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Abbreviation <span className="text-red-500">*</span></Label>
                    <Input
                        placeholder="e.g. GPH"
                        value={form.abbr}
                        onChange={(e) => setForm(f => ({ ...f, abbr: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">A short identifier for the hotel (2-5 characters).</p>
                </div>
                <div className="space-y-2">
                    <Label>Default Currency</Label>
                    <Input
                        value={form.default_currency}
                        onChange={(e) => setForm(f => ({ ...f, default_currency: e.target.value }))}
                    />
                </div>
            </div>
        </CreatePageLayout>
    );
}
