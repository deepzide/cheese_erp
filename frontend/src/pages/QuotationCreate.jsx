import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";

export default function QuotationCreate() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ lead: "", route: "", total_price: "", deposit_amount: "" });
    const createMutation = useFrappeCreate("Cheese Quotation");

    const handleSubmit = () => {
        if (!form.lead || !form.route || !form.total_price) { toast.error("Lead, route, and total price are required"); return; }
        createMutation.mutate({
            ...form,
            status: "Draft",
            total_price: parseFloat(form.total_price),
            deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : 0,
        }, {
            onSuccess: () => { toast.success("Quotation created"); navigate("/cheese/quotations"); },
            onError: (err) => toast.error(err?.message || "Failed to create quotation"),
        });
    };

    return (
        <CreatePageLayout
            title="New Quotation"
            description="Create a price quote for a lead"
            icon={FileText}
            backPath="/cheese/quotations"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Quotation"
        >
            <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Lead <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Lead"
                            label="contact"
                            value={form.lead}
                            onChange={(v) => setForm(f => ({ ...f, lead: v }))}
                            placeholder="Select a lead..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Route <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Cheese Route"
                            label="route_info"
                            value={form.route}
                            onChange={(v) => setForm(f => ({ ...f, route: v }))}
                            placeholder="Select a route..."
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Total Price ($) <span className="text-red-500">*</span></Label>
                        <Input type="number" min="0" step="0.01" placeholder="1500.00" value={form.total_price} onChange={(e) => setForm(f => ({ ...f, total_price: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Deposit Amount ($)</Label>
                        <Input type="number" min="0" step="0.01" placeholder="500.00" value={form.deposit_amount} onChange={(e) => setForm(f => ({ ...f, deposit_amount: e.target.value }))} />
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}
