import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeDoc, useFrappeUpdate } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Landmark, MapPin, Building2 } from "lucide-react";

export default function BankAccountDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { data: account, isLoading } = useFrappeDoc("Cheese Bank Account", id);
    const updateMutation = useFrappeUpdate("Cheese Bank Account");
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});

    useEffect(() => {
        if (account) {
            setForm({
                holder: account.holder || "",
                bank: account.bank || "",
                account: account.account || "",
                description: account.description || "",
                iban: account.iban || "",
                currency: account.currency || "UYU",
                status: account.status || "PENDING",
            });
        }
    }, [account]);

    const handleSave = () => {
        const changes = {};
        ["holder", "bank", "account", "description", "iban", "currency", "status"].forEach(key => {
            if (form[key] !== (account[key] || "")) changes[key] = form[key];
        });

        if (Object.keys(changes).length === 0) {
            setEditMode(false);
            return;
        }

        updateMutation.mutate({ name: id, data: changes }, {
            onSuccess: () => { toast.success("Bank account updated"); setEditMode(false); },
            onError: (err) => toast.error(err?.message || "Failed to update"),
        });
    };

    const statusBadge = (() => {
        const s = account?.status || "PENDING";
        const cls = s === "ACTIVE" ? "bg-emerald-500/15 text-emerald-700 border-emerald-300"
            : s === "INACTIVE" ? "bg-red-500/15 text-red-700 border-red-300"
                : "bg-yellow-500/15 text-yellow-700 border-yellow-300";
        return <Badge variant="outline" className={cls}>{s}</Badge>;
    })();

    return (
        <DetailPageLayout
            title={account?.holder || id}
            subtitle={`Bank Account • ${account?.bank || ""}`}
            backPath="/cheese/bank-accounts"
            isLoading={isLoading}
            statusBadge={statusBadge}
            onEditToggle={() => setEditMode(!editMode)}
            editMode={editMode}
            onSave={handleSave}
            isSaving={updateMutation.isPending}
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* Account Details */}
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <Landmark className="w-4 h-4 mr-2" /> Account Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                <EditableField label="Account Holder" value={form.holder} onChange={(v) => setForm(f => ({ ...f, holder: v }))} editMode={editMode} />
                                <EditableField label="Bank" value={form.bank} onChange={(v) => setForm(f => ({ ...f, bank: v }))} editMode={editMode} />
                                <EditableField label="Account Number" value={form.account} onChange={(v) => setForm(f => ({ ...f, account: v }))} editMode={editMode} />
                                <EditableField label="Description" value={form.description} onChange={(v) => setForm(f => ({ ...f, description: v }))} editMode={editMode} />
                                <EditableField label="IBAN" value={form.iban} onChange={(v) => setForm(f => ({ ...f, iban: v }))} editMode={editMode} />
                                {editMode ? (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Currency</Label>
                                        <select
                                            value={form.currency}
                                            onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))}
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                        >
                                            <option value="EUR">EUR</option>
                                            <option value="USD">USD</option>
                                            <option value="UYU">UYU</option>
                                            <option value="GBP">GBP</option>
                                            <option value="MAD">MAD</option>
                                        </select>
                                    </div>
                                ) : (
                                    <EditableField label="Currency" value={form.currency} editMode={false} />
                                )}
                                {editMode ? (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Status</Label>
                                        <select
                                            value={form.status}
                                            onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                        >
                                            <option value="PENDING">Pending</option>
                                            <option value="ACTIVE">Active</option>
                                            <option value="INACTIVE">Inactive</option>
                                        </select>
                                    </div>
                                ) : (
                                    <EditableField label="Status" value={form.status} editMode={false} />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Linked Entity */}
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <Building2 className="w-4 h-4 mr-2" /> Linked To
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                <EditableField label="Type" value={account?.entity_type === "Company" ? "Establishment" : "Route"} editMode={false} />
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{account?.entity_type === "Company" ? "Establishment" : "Route"}</Label>
                                    <p
                                        className="text-sm font-medium text-primary cursor-pointer hover:underline"
                                        onClick={() => {
                                            if (account?.entity_type === "Cheese Route") navigate(`/cheese/routes/${account.entity_id}`);
                                        }}
                                    >
                                        {account?.entity_id || "—"}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Sidebar */}
                <div className="space-y-6">
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">System Information</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Created On</Label>
                                <p className="text-sm">{account?.creation ? new Date(account.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Last Modified</Label>
                                <p className="text-sm">{account?.modified ? new Date(account.modified).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Owner</Label>
                                <p className="text-sm">{account?.owner || "—"}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DetailPageLayout>
    );
}
