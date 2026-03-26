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
    const initialRoute = searchParams.get('route') || "";
    const initialCompany = searchParams.get('company') || "";
    const [form, setForm] = useState({
        entity_type: initialCompany ? "Company" : "Cheese Route",
        entity_id: initialCompany || initialRoute,
        holder: "", bank: "", account: "", description: "", iban: "", currency: "UYU",
    });
    const createMutation = useFrappeCreate("Cheese Bank Account");

    const handleSubmit = () => {
        if (!form.entity_type || !form.entity_id) {
            toast.error("Route/Establishment is required");
            return;
        }
        const payload = {
            ...form,
            route: form.entity_type === "Cheese Route" ? form.entity_id : undefined,
        };
        createMutation.mutate(payload, {
            onSuccess: () => { toast.success("Bank account added"); navigate("/cheese/bank-accounts"); },
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    return (
        <CreatePageLayout
            title="New Bank Account"
            description="Link a bank account to a route or establishment"
            icon={Landmark}
            backPath="/cheese/bank-accounts"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Add Bank Account"
        >
            <div className="space-y-5">
                <div className="space-y-2">
                    <Label>Link To <span className="text-red-500">*</span></Label>
                    <Select value={form.entity_type} onValueChange={(v) => setForm(f => ({ ...f, entity_type: v, entity_id: "" }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Cheese Route">Route</SelectItem>
                            <SelectItem value="Company">Establishment</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>{form.entity_type === "Company" ? "Establishment" : "Route"} <span className="text-red-500">*</span></Label>
                    {form.entity_type === "Company" ? (
                        <FrappeSearchSelect
                            doctype="Company"
                            label="name"
                            value={form.entity_id}
                            onChange={(v) => setForm(f => ({ ...f, entity_id: v }))}
                            placeholder="Select an establishment..."
                        />
                    ) : (
                        <FrappeSearchSelect
                            doctype="Cheese Route"
                            label="name"
                            value={form.entity_id}
                            onChange={(v) => setForm(f => ({ ...f, entity_id: v }))}
                            placeholder="Select a route..."
                        />
                    )}
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
                        <Label>Description</Label>
                        <Input placeholder="e.g. Primary Account" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Currency</Label>
                        <Select value={form.currency} onValueChange={(v) => setForm(f => ({ ...f, currency: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="UYU">UYU</SelectItem>
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
