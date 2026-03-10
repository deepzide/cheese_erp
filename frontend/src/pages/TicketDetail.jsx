import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeDoc, useFrappeUpdate } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ticket, DollarSign, Calendar, Users, MapPin, Clock, MessageSquare, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TicketDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    // Fetch Data
    const { data: ticket, isLoading } = useFrappeDoc("Cheese Ticket", id);
    const updateMutation = useFrappeUpdate("Cheese Ticket");

    // Local State for Edit Mode
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});

    // Reset local form when fetched data changes
    useEffect(() => {
        if (ticket) {
            setForm({
                contact: ticket.contact || "",
                company: ticket.company || "",
                experience: ticket.experience || "",
                route: ticket.route || "",
                slot: ticket.slot || "",
                party_size: ticket.party_size || 1,
                status: ticket.status || "PENDING",
                expires_at: ticket.expires_at || "",
                conversation: ticket.conversation || "",
                deposit_required: ticket.deposit_required || 0,
                deposit_amount: ticket.deposit_amount || 0,
            });
        }
    }, [ticket]);

    const handleFieldChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        if (!form.contact || !form.experience || !form.slot) {
            toast.error("Contact, Experience, and Slot are required.");
            return;
        }

        // Calculate only what changed
        const changes = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== (ticket[key] || "")) {
                // strict comparison for numeric changes
                if (!(form[key] === 0 && !ticket[key])) {
                    changes[key] = form[key];
                }
            }
        });

        if (Object.keys(changes).length === 0) {
            setEditMode(false);
            return;
        }

        updateMutation.mutate({ name: id, data: changes }, {
            onSuccess: () => {
                toast.success("Ticket updated successfully.");
                setEditMode(false);
            },
            onError: (err) => toast.error(err?.message || "Failed to update ticket")
        });
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case "PENDING": return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>;
            case "CONFIRMED": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Confirmed</Badge>;
            case "CHECKED_IN": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Checked In</Badge>;
            case "COMPLETED": return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">Completed</Badge>;
            case "EXPIRED":
            case "CANCELLED":
            case "NO_SHOW":
            case "REJECTED": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{status.replace("_", " ")}</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <DetailPageLayout
            title={id}
            subtitle={`Ticket for ${ticket?.contact || "Loading..."}`}
            backPath="/cheese/tickets"
            isLoading={isLoading}
            statusBadge={getStatusBadge(ticket?.status)}
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
                            <TabsTrigger value="details" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Ticket className="w-4 h-4 mr-2" /> Details</TabsTrigger>
                            <TabsTrigger value="financials" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><DollarSign className="w-4 h-4 mr-2" /> Financials</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="pt-4 space-y-6">
                            {/* Guest & Reservation Details Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Users className="w-4 h-4 mr-2" /> Guest & Booking Info
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <EditableField label="Contact" value={form.contact} onChange={(v) => handleFieldChange("contact", v)} editMode={editMode} doctype="Cheese Contact" searchLabel="full_name" />
                                        <EditableField label="Company" value={form.company} onChange={(v) => handleFieldChange("company", v)} editMode={editMode} doctype="Company" searchLabel="name" />
                                        <EditableField label="Party Size" type="number" value={form.party_size} onChange={(v) => handleFieldChange("party_size", v)} editMode={editMode} />

                                        <div className="space-y-1">
                                            {editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">Status</label>
                                                    <select
                                                        value={form.status}
                                                        onChange={(e) => handleFieldChange("status", e.target.value)}
                                                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="PENDING">PENDING</option>
                                                        <option value="CONFIRMED">CONFIRMED</option>
                                                        <option value="CHECKED_IN">CHECKED_IN</option>
                                                        <option value="COMPLETED">COMPLETED</option>
                                                        <option value="EXPIRED">EXPIRED</option>
                                                        <option value="REJECTED">REJECTED</option>
                                                        <option value="CANCELLED">CANCELLED</option>
                                                        <option value="NO_SHOW">NO_SHOW</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <EditableField label="Status" value={form.status} editMode={false} />
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Experience Links Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <MapPin className="w-4 h-4 mr-2" /> Experience Links
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <EditableField label="Experience" value={form.experience} onChange={(v) => handleFieldChange("experience", v)} editMode={editMode} doctype="Cheese Experience" searchLabel="name" />
                                        <EditableField label="Route" value={form.route} onChange={(v) => handleFieldChange("route", v)} editMode={editMode} doctype="Cheese Route" searchLabel="route_info" />
                                        <EditableField label="Slot" value={form.slot} onChange={(v) => handleFieldChange("slot", v)} editMode={editMode} doctype="Cheese Experience Slot" searchLabel="name" />

                                        {editMode ? (
                                            <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                <label className="text-xs text-muted-foreground">Expires At</label>
                                                <input
                                                    type="datetime-local"
                                                    value={form.expires_at ? form.expires_at.substring(0, 16) : ""}
                                                    onChange={(e) => handleFieldChange("expires_at", e.target.value)}
                                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                />
                                            </div>
                                        ) : (
                                            <EditableField label="Expires At" value={form.expires_at ? new Date(form.expires_at).toLocaleString() : ""} editMode={false} />
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Linked Conversation Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <MessageSquare className="w-4 h-4 mr-2" /> Related Conversation
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <EditableField label="Conversation" value={form.conversation} onChange={(v) => handleFieldChange("conversation", v)} editMode={editMode} doctype="Conversation" searchLabel="name" />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="financials" className="pt-4 space-y-6">
                            {/* Deposit & Pricing Information */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <DollarSign className="w-4 h-4 mr-2" /> Deposit Status
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        {editMode ? (
                                            <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                <label className="text-xs text-muted-foreground flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!form.deposit_required}
                                                        onChange={(e) => handleFieldChange("deposit_required", e.target.checked ? 1 : 0)}
                                                        className="rounded border-gray-300 text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                                    />
                                                    Deposit Required
                                                </label>
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">Deposit Required</label>
                                                <div className="font-medium text-sm border-b border-transparent py-2 px-0">{form.deposit_required ? "Yes" : "No"}</div>
                                            </div>
                                        )}

                                        <EditableField label="Deposit Amount ($)" type="number" value={form.deposit_amount} onChange={(v) => handleFieldChange("deposit_amount", v)} editMode={editMode} />
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
                                <Label className="text-xs text-muted-foreground">Ticket Created</Label>
                                <p className="text-sm font-medium">{ticket?.creation ? new Date(ticket.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Last Modified</Label>
                                <p className="text-sm font-medium">{ticket?.modified ? new Date(ticket.modified).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Owner</Label>
                                <p className="text-sm font-medium">{ticket?.owner || "—"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">Ticket Workflows</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                <button onClick={() => navigate(`/cheese/deposits/new?ticket=${id}`)} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                    <span className="flex items-center"><DollarSign className="w-4 h-4 mr-2" /> Register Deposit Payment</span>
                                </button>
                                <button onClick={() => navigate(`/cheese/bookings/new?ticket=${id}`)} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                    <span className="flex items-center"><Briefcase className="w-4 h-4 mr-2" /> Convert to Final Booking</span>
                                </button>
                                {ticket?.status !== "CONFIRMED" && (
                                    <button onClick={() => updateMutation.mutate({ name: id, data: { status: "CONFIRMED" } })} disabled={updateMutation.isPending} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                        <span className="flex items-center"><Clock className="w-4 h-4 mr-2" /> Mark as Confirmed</span>
                                    </button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DetailPageLayout>
    );
}
