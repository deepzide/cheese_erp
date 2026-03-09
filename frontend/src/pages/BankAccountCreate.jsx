import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";

export default function BankAccountCreate() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [form, setForm] = useState({
        route: searchParams.get('route') || "",
        holder: "", bank: "", account: "", iban: "", currency: "EUR",
    });
    const createMutation = useFrappeCreate("Cheese Bank Account");

    const handleSubmit = () => {
        if (!form.route) { toast.error("Route is required"); return; }
        createMutation.mutate(form, {
            onSuccess: () => { toast.success("Bank account added"); navigate("/cheese/bank-accounts"); },
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    return (
        <CreatePageLayout
            title="New Bank Account"
            description="Link a bank account to a route"
            icon={Landmark}
            backPath="/cheese/bank-accounts"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Add Bank Account"
        >
            <div className="space-y-5">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Account Holder</Label>
                        <Input placeholder="Company Name" value={form.holder} onChange={(e) => setForm(f => ({ ...f, holder: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>Bank</Label>
                        <Input placeholder="Bank name" value={form.bank} onChange={(e) => setForm(f => ({ ...f, bank: e.target.value }))} />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>IBAN</Label>
                    <Input placeholder="FR76 3000 4000 0500 0006 7890 123" value={form.iban} onChange={(e) => setForm(f => ({ ...f, iban: e.target.value }))} className="font-mono" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Account Number</Label>
                        <Input placeholder="Account number" value={form.account} onChange={(e) => setForm(f => ({ ...f, account: e.target.value }))} className="font-mono" />
                    </div>
                    <div className="space-y-2">
                        <Label>Currency</Label>
                        <Select value={form.currency} onValueChange={(v) => setForm(f => ({ ...f, currency: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                                <SelectItem value="MAD">MAD</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}
