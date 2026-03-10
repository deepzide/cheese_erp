import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeDoc, useFrappeUpdate } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, MessageSquare, Calendar, Activity, ChevronRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LeadDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    // Fetch Data
    const { data: lead, isLoading } = useFrappeDoc("Cheese Lead", id);
    const updateMutation = useFrappeUpdate("Cheese Lead");

    // Local State for Edit Mode
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});

    // Reset local form when fetched data changes
    useEffect(() => {
        if (lead) {
            setForm({
                contact: lead.contact || "",
                status: lead.status || "OPEN",
                interest_type: lead.interest_type || "",
                lost_reason: lead.lost_reason || "",
                conversation: lead.conversation || "",
            });
        }
    }, [lead]);

    const handleFieldChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        if (!form.contact) {
            toast.error("Contact is required.");
            return;
        }

        // Calculate only what changed
        const changes = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== (lead[key] || "")) {
                changes[key] = form[key];
            }
        });

        if (Object.keys(changes).length === 0) {
            setEditMode(false);
            return;
        }

        updateMutation.mutate({ name: id, data: changes }, {
            onSuccess: () => {
                toast.success("Lead updated successfully.");
                setEditMode(false);
            },
            onError: (err) => toast.error(err?.message || "Failed to update lead")
        });
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case "OPEN": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Open</Badge>;
            case "IN_PROGRESS": return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">In Progress</Badge>;
            case "CONVERTED": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Converted</Badge>;
            case "LOST":
            case "DISCARDED": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{status}</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <DetailPageLayout
            title={lead?.contact || "Loading Lead..."}
            subtitle={`Lead • ${id}`}
            backPath="/cheese/leads"
            isLoading={isLoading}
            statusBadge={getStatusBadge(lead?.status)}
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
                            <TabsTrigger value="details" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Target className="w-4 h-4 mr-2" /> Details</TabsTrigger>
                            <TabsTrigger value="activity" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Activity className="w-4 h-4 mr-2" /> Activity</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="pt-4 space-y-6">
                            {/* Lead Core Info Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Target className="w-4 h-4 mr-2" /> Lead Information
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <EditableField label="Contact" value={form.contact} onChange={(v) => handleFieldChange("contact", v)} editMode={editMode} doctype="Cheese Contact" searchLabel="full_name" />
                                        <div className="space-y-1">
                                            {/* We manually map select options if in edit mode, otherwise use standard EditableField */}
                                            {editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">Status</label>
                                                    <select
                                                        value={form.status}
                                                        onChange={(e) => handleFieldChange("status", e.target.value)}
                                                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="OPEN">OPEN</option>
                                                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                                                        <option value="CONVERTED">CONVERTED</option>
                                                        <option value="LOST">LOST</option>
                                                        <option value="DISCARDED">DISCARDED</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <EditableField label="Status" value={form.status} editMode={false} />
                                            )}
                                        </div>

                                        {editMode ? (
                                            <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                <label className="text-xs text-muted-foreground">Interest Type</label>
                                                <select
                                                    value={form.interest_type}
                                                    onChange={(e) => handleFieldChange("interest_type", e.target.value)}
                                                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <option value="">Select...</option>
                                                    <option value="Route">Route</option>
                                                    <option value="Experience">Experience</option>
                                                </select>
                                            </div>
                                        ) : (
                                            <EditableField label="Interest Type" value={form.interest_type} editMode={false} />
                                        )}

                                        {(form.status === "LOST" || form.status === "DISCARDED" || editMode) && (
                                            editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">Lost Reason</label>
                                                    <select
                                                        value={form.lost_reason}
                                                        onChange={(e) => handleFieldChange("lost_reason", e.target.value)}
                                                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="">Select...</option>
                                                        <option value="No Response">No Response</option>
                                                        <option value="Price Too High">Price Too High</option>
                                                        <option value="Not Interested">Not Interested</option>
                                                        <option value="Other">Other</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <EditableField label="Lost Reason" value={form.lost_reason} editMode={false} />
                                            )
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Linked Conversation */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <MessageSquare className="w-4 h-4 mr-2" /> Connected Conversation
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <EditableField label="Conversation" value={form.conversation} onChange={(v) => handleFieldChange("conversation", v)} editMode={editMode} doctype="Conversation" searchLabel="name" />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="activity" className="pt-4">
                            <Card className="border-border/60 shadow-sm">
                                <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center">
                                    <Activity className="w-8 h-8 mb-4 opacity-20" />
                                    <p>Lead timeline and conversion path will appear here.</p>
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
                                <Label className="text-xs text-muted-foreground">Last Interaction</Label>
                                <p className="text-sm font-medium">{lead?.last_interaction_at ? new Date(lead.last_interaction_at).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Created On</Label>
                                <p className="text-sm font-medium">{lead?.creation ? new Date(lead.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Last Modified</Label>
                                <p className="text-sm font-medium">{lead?.modified ? new Date(lead.modified).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Owner</Label>
                                <p className="text-sm font-medium">{lead?.owner || "—"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">Conversion Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                <button onClick={() => navigate(`/cheese/quotations/new?lead=${id}`)} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between group">
                                    <span className="flex items-center"><FileText className="w-4 h-4 mr-2" /> Create Quotation</span>
                                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                                <button onClick={() => navigate(`/cheese/contacts/${lead?.contact}`)} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between group">
                                    <span className="flex items-center"><Target className="w-4 h-4 mr-2" /> View Contact Setup</span>
                                    <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DetailPageLayout>
    );
}
