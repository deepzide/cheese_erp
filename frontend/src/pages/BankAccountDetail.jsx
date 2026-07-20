import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFrappeDoc, useFrappeUpdate } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Landmark, Building2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { bankAccountService } from "@/api/bankAccountService";

export default function BankAccountDetail() {
    const { t } = useTranslation();
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: account, isLoading } = useFrappeDoc("Cheese Bank Account", id);
    const updateMutation = useFrappeUpdate("Cheese Bank Account");
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});
    const [deleteOpen, setDeleteOpen] = useState(false);

    const deleteMutation = useMutation({
        mutationFn: () => bankAccountService.deleteBankAccount(id),
        onSuccess: (res) => {
            if (!res?.success) {
                toast.error(t("common.failed", "Failed"));
                return;
            }
            toast.success(t("bankAccounts.deleteSuccess", "Bank account deleted"));
            queryClient.invalidateQueries({ queryKey: ["frappe-list", "Cheese Bank Account"] });
            setDeleteOpen(false);
            navigate("/cheese/bank-accounts");
        },
        onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
    });

    useEffect(() => {
        if (account) {
            setForm({
                holder: account.holder || "",
                bank: account.bank || "",
                category: account.category || "BANK_ACCOUNT",
                account_email: account.account_email || "",
                paypal_me_link: account.paypal_me_link || "",
                mp_alias_cvu: account.mp_alias_cvu || "",
                account_country: account.account_country || "",
                dlocal_provider_network: account.dlocal_provider_network || "",
                dlocal_agreement_id: account.dlocal_agreement_id || "",
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
        ["holder", "bank", "account", "description", "iban", "currency", "status", "category", "account_email", "paypal_me_link", "mp_alias_cvu", "account_country", "dlocal_provider_network", "dlocal_agreement_id"].forEach(key => {
            if (form[key] !== (account[key] || "")) changes[key] = form[key];
        });

        if (Object.keys(changes).length === 0) {
            setEditMode(false);
            return;
        }

        updateMutation.mutate({ name: id, data: changes }, {
            onSuccess: () => { toast.success(t("bankAccounts.updateSuccess", "Bank account updated")); setEditMode(false); },
            onError: (err) => toast.error(err?.message || t("bankAccounts.updateError", "Failed to update")),
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
            subtitle={`${t("nav.bankAccounts", "Bank Accounts")} • ${account?.bank || ""}`}
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
                                <Landmark className="w-4 h-4 mr-2" /> {t("common.details", "Account Details")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">{t("bankAccounts.category", "Tipo de método de pago")}</p>
                                    {editMode ? (
                                        <select
                                            value={form.category}
                                            onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                        >
                                            <option value="BANK_ACCOUNT">{t("bankAccounts.catBANK_ACCOUNT", "Cuenta Bancaria")}</option>
                                            <option value="PAYPAL">PayPal</option>
                                            <option value="MERCADO_PAGO">Mercado Pago</option>
                                            <option value="DLOCAL">dLocal</option>
                                        </select>
                                    ) : (
                                        <p className="text-sm font-medium">{({ BANK_ACCOUNT: t("bankAccounts.catBANK_ACCOUNT", "Cuenta Bancaria"), PAYPAL: "PayPal", MERCADO_PAGO: "Mercado Pago", DLOCAL: "dLocal" })[form.category] || form.category}</p>
                                    )}
                                </div>
                                <EditableField label={t("bankAccounts.holder", "Account Holder")} value={form.holder} onChange={(v) => setForm(f => ({ ...f, holder: v }))} editMode={editMode} />
                                {form.category === "BANK_ACCOUNT" && (
                                    <EditableField label={t("bankAccounts.bank", "Bank")} value={form.bank} onChange={(v) => setForm(f => ({ ...f, bank: v }))} editMode={editMode} />
                                )}
                                {["PAYPAL", "MERCADO_PAGO"].includes(form.category) && (
                                    <EditableField label={form.category === "PAYPAL" ? t("bankAccounts.paypalEmail", "Correo de la cuenta (PayPal ID)") : t("bankAccounts.mpEmail", "Correo de la cuenta")} value={form.account_email} onChange={(v) => setForm(f => ({ ...f, account_email: v }))} editMode={editMode} />
                                )}
                                {form.category === "PAYPAL" && (
                                    <EditableField label={t("bankAccounts.paypalMe", "Enlace PayPal.Me")} value={form.paypal_me_link} onChange={(v) => setForm(f => ({ ...f, paypal_me_link: v }))} editMode={editMode} />
                                )}
                                {form.category === "MERCADO_PAGO" && (
                                    <EditableField label={t("bankAccounts.mpAlias", "Alias / CVU")} value={form.mp_alias_cvu} onChange={(v) => setForm(f => ({ ...f, mp_alias_cvu: v }))} editMode={editMode} />
                                )}
                                {["MERCADO_PAGO", "DLOCAL"].includes(form.category) && (
                                    <EditableField label={t("bankAccounts.accountCountry", "País de la cuenta")} value={form.account_country} onChange={(v) => setForm(f => ({ ...f, account_country: v }))} editMode={editMode} />
                                )}
                                {form.category === "DLOCAL" && (
                                    <>
                                        <EditableField label={t("bankAccounts.dlocalNetwork", "Proveedor local / Red")} value={form.dlocal_provider_network} onChange={(v) => setForm(f => ({ ...f, dlocal_provider_network: v }))} editMode={editMode} />
                                        <EditableField label={t("bankAccounts.dlocalAgreement", "ID de convenio / comitente")} value={form.dlocal_agreement_id} onChange={(v) => setForm(f => ({ ...f, dlocal_agreement_id: v }))} editMode={editMode} />
                                    </>
                                )}
                                <EditableField label={t("bankAccounts.account", "Account Number")} value={form.account} onChange={(v) => setForm(f => ({ ...f, account: v }))} editMode={editMode} />
                                <EditableField label={t("common.description", "Description")} value={form.description} onChange={(v) => setForm(f => ({ ...f, description: v }))} editMode={editMode} />
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
                                            <option value="PENDING">{t("status.PENDING", "Pending")}</option>
                                            <option value="ACTIVE">{t("status.ACTIVE", "Active")}</option>
                                            <option value="INACTIVE">{t("status.INACTIVE", "Inactive")}</option>
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
                                <EditableField label="Type" value={account?.entity_type === "Company" ? "Company" : "Route"} editMode={false} />
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{account?.entity_type === "Company" ? "Company" : "Route"}</Label>
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
                    <Card className="border-border/60 shadow-sm border-destructive/20">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-destructive">{t("common.dangerZone", "Danger zone")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <p className="text-xs text-muted-foreground mb-3">
                                {t(
                                    "bankAccounts.deleteHint",
                                    "Delete this bank account only if no deposits reference it.",
                                )}
                            </p>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="w-full"
                                onClick={() => setDeleteOpen(true)}
                                disabled={deleteMutation.isPending}
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t("bankAccounts.deleteAccount", "Delete bank account")}
                            </Button>
                        </CardContent>
                    </Card>

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

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("bankAccounts.confirmDelete", "Delete bank account?")}</DialogTitle>
                        <DialogDescription>
                            {t(
                                "bankAccounts.confirmDeleteDesc",
                                "This cannot be undone. Deposits that still reference this account must be updated first.",
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                            {t("common.cancel", "Cancel")}
                        </Button>
                        <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                            {deleteMutation.isPending ? t("common.deleting", "Deleting…") : t("common.delete", "Delete")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DetailPageLayout>
    );
}
