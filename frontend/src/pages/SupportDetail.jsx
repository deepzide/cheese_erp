import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFrappeDoc, useFrappeUpdate } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Users, Ticket, MessageSquare, CheckCircle, AlertTriangle, Clock } from "lucide-react";

const STATUS_CONFIG = {
    OPEN: { label: "Open", class: "bg-blue-500/15 text-blue-700 border-blue-300 dark:text-blue-400 dark:border-blue-700" },
    IN_PROGRESS: { label: "In Progress", class: "bg-yellow-500/15 text-yellow-700 border-yellow-300 dark:text-yellow-400 dark:border-yellow-700" },
    RESOLVED: { label: "Resolved", class: "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700" },
    CLOSED: { label: "Closed", class: "bg-slate-500/15 text-slate-700 border-slate-300 dark:text-slate-400 dark:border-slate-700" },
};

const PRIORITY_CONFIG = {
    Low: "bg-slate-100 text-slate-600",
    Medium: "bg-yellow-100 text-yellow-700",
    High: "bg-orange-100 text-orange-700",
    Urgent: "bg-red-100 text-red-700",
};

export default function SupportDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { data: supportCase, isLoading, refetch } = useFrappeDoc("Cheese Support Case", id);
    const updateMutation = useFrappeUpdate("Cheese Support Case");
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});

    useEffect(() => {
        if (supportCase) {
            setForm({
                status: supportCase.status || "OPEN",
                priority: supportCase.priority || "Medium",
                description: supportCase.description || "",
                assigned_to: supportCase.assigned_to || "",
            });
        }
    }, [supportCase]);

    const handleSave = () => {
        const changes = {};
        ["status", "priority", "description", "assigned_to"].forEach(key => {
            if (form[key] !== (supportCase[key] || "")) changes[key] = form[key];
        });

        if (Object.keys(changes).length === 0) {
            setEditMode(false);
            return;
        }

        updateMutation.mutate({ name: id, data: changes }, {
            onSuccess: () => {
                toast.success(t("support.updateSuccess", "Support case updated"));
                setEditMode(false);
                refetch();
            },
            onError: (err) => toast.error(err?.message || t("support.updateError", "Failed to update")),
        });
    };

    const quickStatusChange = (newStatus) => {
        updateMutation.mutate({ name: id, data: { status: newStatus } }, {
            onSuccess: () => {
                setForm((prev) => ({ ...prev, status: newStatus }));
                toast.success(t("support.markedAs", { status: newStatus, defaultValue: `Case marked as ${newStatus}` }));
                refetch();
            },
            onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
        });
    };

    const status = supportCase?.status || "OPEN";
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN;
    const priorityCls = PRIORITY_CONFIG[supportCase?.priority] || PRIORITY_CONFIG.Medium;

    return (
        <DetailPageLayout
            title={id}
            subtitle={`${t("support.supportCase", "Support Case")} • ${supportCase?.incident_type || ""}`}
            backPath="/cheese/support"
            isLoading={isLoading}
            statusBadge={<Badge variant="outline" className={config.class}>{t(`status.${status}`, config.label)}</Badge>}
            onEditToggle={() => setEditMode(!editMode)}
            editMode={editMode}
            onSave={handleSave}
            isSaving={updateMutation.isPending}
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* Case Details */}
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <Shield className="w-4 h-4 mr-2" /> {t("support.caseDetails", "Case Details")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                <EditableField label={t("support.caseId", "Case ID")} value={supportCase?.name || "—"} editMode={false} />
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{t("support.priority", "Priority")}</Label>
                                    {editMode ? (
                                        <select
                                            value={form.priority}
                                            onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                        >
                                            <option value="Low">{t("support.low", "Low")}</option>
                                            <option value="Medium">{t("support.medium", "Medium")}</option>
                                            <option value="High">{t("support.high", "High")}</option>
                                            <option value="Urgent">{t("support.urgent", "Urgent")}</option>
                                        </select>
                                    ) : (
                                        <Badge className={priorityCls}>{supportCase?.priority ? t(`support.${supportCase.priority.toLowerCase()}`, supportCase.priority) : t("support.medium", "Medium")}</Badge>
                                    )}
                                </div>
                                {editMode ? (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">{t("common.status", "Status")}</Label>
                                        <select
                                            value={form.status}
                                            onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                        >
                                            {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                                                <option key={key} value={key}>{t(`status.${key}`, val.label)}</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <EditableField label={t("common.status", "Status")} value={t(`status.${form.status}`, STATUS_CONFIG[form.status]?.label)} editMode={false} />
                                )}
                                <EditableField label={t("support.assignedTo", "Assigned To")} value={form.assigned_to} onChange={(v) => setForm(f => ({ ...f, assigned_to: v }))} editMode={editMode} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Description */}
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <MessageSquare className="w-4 h-4 mr-2" /> {t("support.complaintDescription", "Complaint Description")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            {editMode ? (
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                                    rows={6}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                    placeholder={t("support.describeComplaint", "Describe the complaint...")}
                                />
                            ) : (
                                <p className="text-sm whitespace-pre-wrap">{supportCase?.description || t("support.noDescription", "No description provided.")}</p>
                            )}
                        </CardContent>
                    </Card>

                </div>

                {/* Right Sidebar */}
                <div className="space-y-6">
                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">{t("common.quickActions", "Quick Actions")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                {status === "OPEN" && (
                                    <Button variant="outline" size="sm" onClick={() => quickStatusChange("IN_PROGRESS")} className="justify-start">
                                        <Clock className="w-4 h-4 mr-2" /> {t("support.startWorking", "Start Working")}
                                    </Button>
                                )}
                                {status === "IN_PROGRESS" && (
                                    <Button variant="outline" size="sm" onClick={() => quickStatusChange("RESOLVED")} className="justify-start text-emerald-700">
                                        <CheckCircle className="w-4 h-4 mr-2" /> {t("support.markResolved", "Mark Resolved")}
                                    </Button>
                                )}
                                {status === "RESOLVED" && (
                                    <Button variant="outline" size="sm" onClick={() => quickStatusChange("CLOSED")} className="justify-start">
                                        <AlertTriangle className="w-4 h-4 mr-2" /> {t("support.closeCase", "Close Case")}
                                    </Button>
                                )}
                                {supportCase?.contact && (
                                    <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate(`/cheese/contacts/${encodeURIComponent(supportCase.contact)}`)}>
                                        <Users className="w-4 h-4 mr-2" /> {t("support.viewContact", "View Contact")}
                                    </Button>
                                )}
                                {supportCase?.ticket && (
                                    <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate(`/cheese/tickets/${encodeURIComponent(supportCase.ticket)}`)}>
                                        <Ticket className="w-4 h-4 mr-2" /> {t("support.viewTicket", "View Ticket")}
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* References */}
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">{t("support.references", "References")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("nav.contacts", "Contact")}</Label>
                                <p className="text-sm font-medium">{supportCase?.contact || "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("nav.tickets", "Ticket")}</Label>
                                <p className="text-sm font-medium">{supportCase?.ticket || "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("support.incidentType", "Incident Type")}</Label>
                                <p className="text-sm font-medium">{supportCase?.incident_type ? t(`support.${supportCase.incident_type.toLowerCase()}`, supportCase.incident_type) : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("nav.routes", "Route")}</Label>
                                <p className="text-sm font-medium">{supportCase?.route || "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("common.company", "Company")}</Label>
                                <p className="text-sm font-medium">{supportCase?.company || "—"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">{t("common.systemInfo", "System Info")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("common.created", "Created")}</Label>
                                <p className="text-sm">{supportCase?.creation ? new Date(supportCase.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("common.lastModified", "Last Modified")}</Label>
                                <p className="text-sm">{supportCase?.modified ? new Date(supportCase.modified).toLocaleString() : "—"}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DetailPageLayout>
    );
}
