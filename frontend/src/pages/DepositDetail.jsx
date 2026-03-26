import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeDoc, useFrappeUpdate } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, Ticket, Users, Clock, CreditCard, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

const STATUS_CONFIG = {
    PENDING: { label: "Pending", class: "bg-yellow-500/15 text-yellow-700 border-yellow-300 dark:text-yellow-400 dark:border-yellow-700" },
    PAID: { label: "Paid", class: "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700" },
    PARTIAL: { label: "Partial", class: "bg-blue-500/15 text-blue-700 border-blue-300 dark:text-blue-400 dark:border-blue-700" },
    OVERDUE: { label: "Overdue", class: "bg-red-500/15 text-red-700 border-red-300 dark:text-red-400 dark:border-red-700" },
    REFUNDED: { label: "Refunded", class: "bg-purple-500/15 text-purple-700 border-purple-300 dark:text-purple-400 dark:border-purple-700" },
    FORFEITED: { label: "Forfeited", class: "bg-slate-500/15 text-slate-700 border-slate-300 dark:text-slate-400 dark:border-slate-700" },
    CANCELLED: { label: "Cancelled", class: "bg-red-500/15 text-red-700 border-red-300 dark:text-red-400 dark:border-red-700" },
};

export default function DepositDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { data: deposit, isLoading } = useFrappeDoc("Cheese Deposit", id);
    const updateMutation = useFrappeUpdate("Cheese Deposit");
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});

    useEffect(() => {
        if (deposit) {
            setForm({
                status: deposit.status || "PENDING",
                amount_paid: deposit.amount_paid || 0,
                amount_required: deposit.amount_required || 0,
                notes: deposit.notes || "",
            });
        }
    }, [deposit]);

    const handleSave = () => {
        const changes = {};
        if (form.status !== deposit.status) changes.status = form.status;
        if (Number(form.amount_paid) !== Number(deposit.amount_paid)) changes.amount_paid = Number(form.amount_paid);
        if (form.notes !== (deposit.notes || "")) changes.notes = form.notes;

        if (Object.keys(changes).length === 0) {
            setEditMode(false);
            return;
        }

        updateMutation.mutate({ name: id, data: changes }, {
            onSuccess: () => { toast.success("Deposit updated"); setEditMode(false); },
            onError: (err) => toast.error(err?.message || "Failed to update"),
        });
    };

    const quickStatusChange = (newStatus) => {
        updateMutation.mutate({ name: id, data: { status: newStatus } }, {
            onSuccess: () => toast.success(`Deposit marked as ${newStatus}`),
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    const status = deposit?.status || "PENDING";
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;

    return (
        <DetailPageLayout
            title={id}
            subtitle={`Deposit for ${deposit?.entity_type || ""} ${deposit?.entity_id || ""}`}
            backPath="/cheese/deposits"
            isLoading={isLoading}
            statusBadge={<Badge variant="outline" className={config.class}>{config.label}</Badge>}
            onEditToggle={() => setEditMode(!editMode)}
            editMode={editMode}
            onSave={handleSave}
            isSaving={updateMutation.isPending}
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* Payment Info */}
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <DollarSign className="w-4 h-4 mr-2" /> Payment Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                <EditableField label="Amount Required" type="number" value={form.amount_required} editMode={false} />
                                <EditableField label="Amount Paid" type="number" value={form.amount_paid} onChange={(v) => setForm(f => ({ ...f, amount_paid: v }))} editMode={editMode} />
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Balance</Label>
                                    <p className={`text-sm font-bold ${Number(form.amount_required) - Number(form.amount_paid) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                        ${(Number(form.amount_required) - Number(form.amount_paid)).toFixed(2)}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    {editMode ? (
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-muted-foreground">Status</Label>
                                            <select
                                                value={form.status}
                                                onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                            >
                                                {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                                                    <option key={key} value={key}>{val.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <EditableField label="Status" value={form.status} editMode={false} />
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Linked Entity */}
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <CreditCard className="w-4 h-4 mr-2" /> Linked Entity
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                <EditableField label="Entity Type" value={deposit?.entity_type || "—"} editMode={false} />
                                <EditableField label="Entity ID" value={deposit?.entity_id || "—"} editMode={false} />
                                <EditableField label="Contact" value={deposit?.contact || "—"} editMode={false} />
                                <EditableField label="Due At" value={deposit?.due_at ? new Date(deposit.due_at).toLocaleString() : "—"} editMode={false} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Notes */}
                    {editMode && (
                        <Card className="border-border/60 shadow-sm">
                            <CardHeader className="border-b bg-muted/20 pb-4">
                                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Notes</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                <textarea
                                    value={form.notes}
                                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                                    rows={4}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                    placeholder="Add notes about this deposit..."
                                />
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Right Sidebar - Actions */}
                <div className="space-y-6">
                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                {status === "PENDING" && (
                                    <Button variant="outline" size="sm" onClick={() => quickStatusChange("PAID")} className="justify-start text-emerald-700">
                                        <CheckCircle className="w-4 h-4 mr-2" /> Mark as Paid
                                    </Button>
                                )}
                                {(status === "PENDING" || status === "PARTIAL") && (
                                    <Button variant="outline" size="sm" onClick={() => quickStatusChange("CANCELLED")} className="justify-start text-red-700">
                                        <XCircle className="w-4 h-4 mr-2" /> Cancel Deposit
                                    </Button>
                                )}
                                {status === "PAID" && (
                                    <Button variant="outline" size="sm" onClick={() => quickStatusChange("REFUNDED")} className="justify-start text-purple-700">
                                        <AlertTriangle className="w-4 h-4 mr-2" /> Refund
                                    </Button>
                                )}
                                {deposit?.entity_id && (
                                    <Button variant="outline" size="sm" className="justify-start" onClick={() => {
                                        if (deposit.entity_type === "Cheese Ticket") navigate(`/cheese/tickets/${deposit.entity_id}`);
                                        else if (deposit.entity_type === "Cheese Route Booking") navigate(`/cheese/bookings/${deposit.entity_id}`);
                                    }}>
                                        <Ticket className="w-4 h-4 mr-2" /> View {deposit.entity_type === "Cheese Ticket" ? "Ticket" : "Booking"}
                                    </Button>
                                )}
                                {deposit?.contact && (
                                    <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate(`/cheese/contacts/${deposit.contact}`)}>
                                        <Users className="w-4 h-4 mr-2" /> View Contact
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">System Info</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Created</Label>
                                <p className="text-sm">{deposit?.creation ? new Date(deposit.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Last Modified</Label>
                                <p className="text-sm">{deposit?.modified ? new Date(deposit.modified).toLocaleString() : "—"}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DetailPageLayout>
    );
}
