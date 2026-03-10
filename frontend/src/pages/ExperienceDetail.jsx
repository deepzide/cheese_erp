import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeDoc, useFrappeUpdate } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, DollarSign, Settings, MapPin, Info, Link as LinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ExperienceDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    // Fetch Data
    const { data: exp, isLoading } = useFrappeDoc("Cheese Experience", id);
    const updateMutation = useFrappeUpdate("Cheese Experience");

    // Local State for Edit Mode
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});

    // Reset local form when fetched data changes
    useEffect(() => {
        if (exp) {
            setForm({
                company: exp.company || "",
                google_maps_link: exp.google_maps_link || "",
                description: exp.description || "",
                event_duration: exp.event_duration || 0,
                individual_price: exp.individual_price || 0,
                route_price: exp.route_price || 0,
                package_mode: exp.package_mode || "Both",
                deposit_required: exp.deposit_required || 0,
                deposit_type: exp.deposit_type || "Amount",
                deposit_value: exp.deposit_value || 0,
                deposit_ttl_hours: exp.deposit_ttl_hours || 48,
                manual_confirmation: exp.manual_confirmation || 0,
                status: exp.status || "ONLINE",
            });
        }
    }, [exp]);

    const handleFieldChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        if (!form.company) {
            toast.error("Company is required.");
            return;
        }

        const changes = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== (exp[key] || "") && !(form[key] === 0 && !exp[key])) {
                changes[key] = form[key];
            }
        });

        if (Object.keys(changes).length === 0) {
            setEditMode(false);
            return;
        }

        updateMutation.mutate({ name: id, data: changes }, {
            onSuccess: () => {
                toast.success("Experience updated successfully.");
                setEditMode(false);
            },
            onError: (err) => toast.error(err?.message || "Failed to update experience")
        });
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case "ONLINE": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Online</Badge>;
            case "OFFLINE": return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">Offline</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <DetailPageLayout
            title={id}
            subtitle={`Experience Provider: ${exp?.company || "Loading..."}`}
            backPath="/cheese/experiences"
            isLoading={isLoading}
            statusBadge={getStatusBadge(exp?.status)}
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
                            <TabsTrigger value="details" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Building2 className="w-4 h-4 mr-2" /> Details</TabsTrigger>
                            <TabsTrigger value="pricing" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><DollarSign className="w-4 h-4 mr-2" /> Pricing & Deposits</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="pt-4 space-y-6">
                            {/* Core Definition */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Info className="w-4 h-4 mr-2" /> Base Configuration
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <EditableField label="Provider Company" value={form.company} onChange={(v) => handleFieldChange("company", v)} editMode={editMode} doctype="Company" searchLabel="name" />

                                        <div className="space-y-1">
                                            {editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">Status</label>
                                                    <select
                                                        value={form.status}
                                                        onChange={(e) => handleFieldChange("status", e.target.value)}
                                                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="ONLINE">ONLINE</option>
                                                        <option value="OFFLINE">OFFLINE</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <EditableField label="Status" value={form.status} editMode={false} />
                                            )}
                                        </div>

                                        <EditableField label="Event Duration (Seconds)" type="number" value={form.event_duration} onChange={(v) => handleFieldChange("event_duration", v)} editMode={editMode} />

                                        <div className="space-y-1">
                                            {editMode ? (
                                                <EditableField label="Google Maps Link" value={form.google_maps_link} onChange={(v) => handleFieldChange("google_maps_link", v)} editMode={editMode} />
                                            ) : (
                                                <div className="space-y-1">
                                                    <label className="text-xs text-muted-foreground">Google Maps Link</label>
                                                    <div className="font-medium text-sm border-b border-transparent py-2">
                                                        {form.google_maps_link ? <a href={form.google_maps_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center"><MapPin className="w-3 h-3 mr-1" /> View on Map</a> : <span className="text-muted-foreground italic">None</span>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Info className="w-4 h-4 mr-2" /> Rich Description
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    {editMode ? (
                                        <textarea
                                            value={form.description?.replace(/<[^>]*>?/gm, '')} // Strip basic HTML for pure text editing
                                            onChange={(e) => handleFieldChange("description", e.target.value)}
                                            placeholder="Detailed experience outline..."
                                            className="w-full min-h-[160px] p-3 text-sm border rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                        />
                                    ) : (
                                        <div
                                            className="text-sm prose prose-sm max-w-none text-muted-foreground"
                                            dangerouslySetInnerHTML={{ __html: exp?.description || '<span class="italic font-normal">No description</span>' }}
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="pricing" className="pt-4 space-y-6">
                            {/* Pricing Strategy Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <DollarSign className="w-4 h-4 mr-2" /> Dynamic Pricing
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <div className="space-y-1">
                                            {editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">Package Mode</label>
                                                    <select
                                                        value={form.package_mode}
                                                        onChange={(e) => handleFieldChange("package_mode", e.target.value)}
                                                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="Establishment">A La Carte (Establishment)</option>
                                                        <option value="Route">Packaged (Route)</option>
                                                        <option value="Both">Available in Both</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <EditableField label="Package Availability" value={form.package_mode} editMode={false} />
                                            )}
                                        </div>
                                        <div /> {/* Spacing */}
                                        <EditableField label="Individual Price ($)" type="number" value={form.individual_price} onChange={(v) => handleFieldChange("individual_price", v)} editMode={editMode} />
                                        <EditableField label="Route Price ($)" type="number" value={form.route_price} onChange={(v) => handleFieldChange("route_price", v)} editMode={editMode} />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Experience Deposit Rules */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <DollarSign className="w-4 h-4 mr-2" /> Standalone Deposit Rules
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="space-y-6">
                                        {editMode ? (
                                            <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                <label className="text-xs text-muted-foreground flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!form.deposit_required}
                                                        onChange={(e) => handleFieldChange("deposit_required", e.target.checked ? 1 : 0)}
                                                        className="rounded border-gray-300 text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                                    />
                                                    Deposit Required on Independent Bookings
                                                </label>
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Deposit Required</label>
                                                <div className="font-medium text-sm border-b border-transparent py-2 px-0">{form.deposit_required ? "Yes" : "No"}</div>
                                            </div>
                                        )}

                                        {!!form.deposit_required && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-8 p-4 bg-muted/30 rounded-lg border border-border/50 animate-in slide-in-from-top-2 fade-in">
                                                <div className="space-y-1">
                                                    {editMode ? (
                                                        <div className="space-y-1.5">
                                                            <label className="text-xs text-muted-foreground">Deposit Format</label>
                                                            <select
                                                                value={form.deposit_type}
                                                                onChange={(e) => handleFieldChange("deposit_type", e.target.value)}
                                                                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                <option value="Amount">Fixed Amount ($)</option>
                                                                <option value="%">Percentage (%)</option>
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <EditableField label="Deposit Format" value={form.deposit_type} editMode={false} />
                                                    )}
                                                </div>
                                                <EditableField label="Deposit Value" type="number" value={form.deposit_value} onChange={(v) => handleFieldChange("deposit_value", v)} editMode={editMode} />
                                                <EditableField label="TTL (Hours)" type="number" value={form.deposit_ttl_hours} onChange={(v) => handleFieldChange("deposit_ttl_hours", v)} editMode={editMode} />
                                            </div>
                                        )}
                                    </div>
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
                                <p className="text-sm font-medium">{exp?.creation ? new Date(exp.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Last Modified</Label>
                                <p className="text-sm font-medium">{exp?.modified ? new Date(exp.modified).toLocaleString() : "—"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center"><Settings className="w-4 h-4 mr-2" /> Booking Rules</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            {editMode ? (
                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={!!form.manual_confirmation}
                                            onChange={(e) => handleFieldChange("manual_confirmation", e.target.checked ? 1 : 0)}
                                            className="rounded border-gray-300 text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                        />
                                        Requires Manual Confirmation
                                    </label>
                                    <p className="text-xs text-muted-foreground ml-6">If enabled, bookings cannot be auto-confirmed without human agent approval.</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <div className="font-medium text-sm py-2 px-0 flex items-center gap-2">
                                        <span className={`w-3 h-3 rounded-full ${form.manual_confirmation ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                        {form.manual_confirmation ? "Manual Confirmation Required" : "Instant Auto-Booking Enabled"}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">Experience Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                {exp?.status === "ONLINE" ? (
                                    <button onClick={() => updateMutation.mutate({ name: id, data: { status: "OFFLINE" } })} disabled={updateMutation.isPending} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                        <span>Take Experience Offline</span>
                                    </button>
                                ) : (
                                    <button onClick={() => updateMutation.mutate({ name: id, data: { status: "ONLINE" } })} disabled={updateMutation.isPending} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                        <span>Publish Experience Online</span>
                                    </button>
                                )}
                                <button className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                    <span className="flex items-center"><LinkIcon className="w-4 h-4 mr-2" /> Add to Route Template</span>
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DetailPageLayout>
    );
}
