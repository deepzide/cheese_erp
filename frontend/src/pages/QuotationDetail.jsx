import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeDoc, useFrappeUpdate } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, DollarSign, Calendar, Info, Clock, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function QuotationDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    // Fetch Data
    const { data: quotation, isLoading } = useFrappeDoc("Cheese Quotation", id);
    const updateMutation = useFrappeUpdate("Cheese Quotation");

    // Local State for Edit Mode
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});

    // Reset local form when fetched data changes
    useEffect(() => {
        if (quotation) {
            setForm({
                lead: quotation.lead || "",
                establishment: quotation.establishment || "",
                route: quotation.route || "",
                valid_until: quotation.valid_until || "",
                total_price: quotation.total_price || 0,
                deposit_amount: quotation.deposit_amount || 0,
                status: quotation.status || "DRAFT",
                conversation: quotation.conversation || "",
            });
        }
    }, [quotation]);

    const handleFieldChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        if (!form.status) {
            toast.error("Status is required.");
            return;
        }

        // Calculate only what changed (basic fields, excluding child table for now)
        const changes = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== (quotation[key] || "") && !(form[key] === 0 && !quotation[key])) {
                changes[key] = form[key];
            }
        });

        if (Object.keys(changes).length === 0) {
            setEditMode(false);
            return;
        }

        updateMutation.mutate({ name: id, data: changes }, {
            onSuccess: () => {
                toast.success("Quotation updated successfully.");
                setEditMode(false);
            },
            onError: (err) => toast.error(err?.message || "Failed to update quotation")
        });
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case "DRAFT": return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">Draft</Badge>;
            case "SENT": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Sent</Badge>;
            case "ACCEPTED": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Accepted</Badge>;
            case "EXPIRED": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Expired</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <DetailPageLayout
            title={id}
            subtitle={`Linked to Lead: ${quotation?.lead || "None"}`}
            backPath="/cheese/quotations"
            isLoading={isLoading}
            statusBadge={getStatusBadge(quotation?.status)}
            onEditToggle={() => setEditMode(!editMode)}
            editMode={editMode}
            onSave={handleSave}
            isSaving={updateMutation.isPending}
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left/Main Column - Forms */}
                <div className="lg:col-span-2 space-y-6">
                    <Tabs defaultValue="details" className="w-full">
                        <TabsList className="w-full justify-start h-12 bg-muted/50 p-1">
                            <TabsTrigger value="details" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><FileText className="w-4 h-4 mr-2" /> Quote Details</TabsTrigger>
                            <TabsTrigger value="experiences" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Calendar className="w-4 h-4 mr-2" /> Experiences List</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="pt-4 space-y-6">
                            {/* Core Info Summary Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Info className="w-4 h-4 mr-2" /> Proposal Information
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <EditableField label="Lead" value={form.lead} onChange={(v) => handleFieldChange("lead", v)} editMode={editMode} doctype="Cheese Lead" searchLabel="contact" />
                                        <EditableField label="Establishment (Company)" value={form.establishment} onChange={(v) => handleFieldChange("establishment", v)} editMode={editMode} doctype="Company" searchLabel="name" />
                                        <EditableField label="Route" value={form.route} onChange={(v) => handleFieldChange("route", v)} editMode={editMode} doctype="Cheese Route" searchLabel="route_info" />
                                        <EditableField label="Conversation" value={form.conversation} onChange={(v) => handleFieldChange("conversation", v)} editMode={editMode} doctype="Conversation" searchLabel="name" />

                                        <div className="space-y-1">
                                            {editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">Status</label>
                                                    <select
                                                        value={form.status}
                                                        onChange={(e) => handleFieldChange("status", e.target.value)}
                                                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="DRAFT">DRAFT</option>
                                                        <option value="SENT">SENT</option>
                                                        <option value="ACCEPTED">ACCEPTED</option>
                                                        <option value="EXPIRED">EXPIRED</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <EditableField label="Status" value={form.status} editMode={false} />
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Financials & Validity Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <DollarSign className="w-4 h-4 mr-2" /> Pricing & Terms
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <EditableField label="Total Price ($)" type="number" value={form.total_price} onChange={(v) => handleFieldChange("total_price", v)} editMode={editMode} />
                                        <EditableField label="Deposit Amount ($)" type="number" value={form.deposit_amount} onChange={(v) => handleFieldChange("deposit_amount", v)} editMode={editMode} />

                                        {editMode ? (
                                            <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                <label className="text-xs text-muted-foreground">Valid Until</label>
                                                <input
                                                    type="datetime-local"
                                                    value={form.valid_until ? form.valid_until.substring(0, 16) : ""}
                                                    onChange={(e) => handleFieldChange("valid_until", e.target.value)}
                                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                />
                                            </div>
                                        ) : (
                                            <EditableField label="Valid Until" value={form.valid_until ? new Date(form.valid_until).toLocaleString() : ""} editMode={false} />
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="experiences" className="pt-4">
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Included Experiences</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {quotation?.experiences && quotation.experiences.length > 0 ? (
                                        <div className="divide-y divide-border/50">
                                            {quotation.experiences.map((exp, i) => (
                                                <div key={i} className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-semibold bg-muted px-2 py-0.5 rounded text-muted-foreground">#{exp.sequence}</span>
                                                            <p className="font-medium text-sm">{exp.experience}</p>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                                            {exp.date && <span>📅 {exp.date}</span>}
                                                            {exp.slot && <span>⏰ {exp.slot}</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                                            <Calendar className="w-8 h-8 mb-4 opacity-20" />
                                            <p>No specific experiences attached to this quotation yet.</p>
                                        </div>
                                    )}
                                    {editMode && (
                                        <div className="p-4 bg-primary/5 text-primary text-xs text-center border-t border-primary/10">
                                            Child table editing is currently read-only in inline edit mode. Navigate to the full form to modify experiences.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right Column - Metadata */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">System Information</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Created On</Label>
                                <p className="text-sm font-medium">{quotation?.creation ? new Date(quotation.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Last Modified</Label>
                                <p className="text-sm font-medium">{quotation?.modified ? new Date(quotation.modified).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Owner</Label>
                                <p className="text-sm font-medium">{quotation?.owner || "—"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">Quotation Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                {quotation?.status !== "ACCEPTED" && (
                                    <button onClick={() => updateMutation.mutate({ name: id, data: { status: "ACCEPTED" } })} disabled={updateMutation.isPending} className="text-sm text-left px-3 py-2 rounded-md bg-emerald-50 hover:bg-emerald-100 transition-colors text-emerald-700 font-medium flex items-center justify-between">
                                        <span className="flex items-center"><CheckCircle className="w-4 h-4 mr-2" /> Mark as Accepted</span>
                                    </button>
                                )}
                                <button className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center">
                                    <Clock className="w-4 h-4 mr-2" /> Send Follow-up Reminder
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DetailPageLayout>
    );
}
