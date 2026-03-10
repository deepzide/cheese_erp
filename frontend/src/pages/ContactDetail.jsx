import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeDoc, useFrappeUpdate } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Mail, Phone, Calendar, Globe, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ContactDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    // Fetch Data
    const { data: contact, isLoading } = useFrappeDoc("Cheese Contact", id);
    const updateMutation = useFrappeUpdate("Cheese Contact");

    // Local State for Edit Mode
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});

    // Reset local form when fetched data changes
    useEffect(() => {
        if (contact) {
            setForm({
                full_name: contact.full_name || "",
                email: contact.email || "",
                phone: contact.phone || "",
                source: contact.source || "",
                preferred_language: contact.preferred_language || "",
                preferred_channel: contact.preferred_channel || "",
                notes: contact.notes || "",
                address: contact.address || "",
            });
        }
    }, [contact]);

    const handleFieldChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        if (!form.full_name && !form.phone) {
            toast.error("Contact requires either a name or a phone number.");
            return;
        }

        // Calculate only what changed
        const changes = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== (contact[key] || "")) {
                changes[key] = form[key];
            }
        });

        if (Object.keys(changes).length === 0) {
            setEditMode(false);
            return;
        }

        updateMutation.mutate({ name: id, data: changes }, {
            onSuccess: () => {
                toast.success("Contact updated successfully.");
                setEditMode(false);
            },
            onError: (err) => toast.error(err?.message || "Failed to update contact")
        });
    };

    return (
        <DetailPageLayout
            title={contact?.full_name || contact?.phone || "Loading Contact..."}
            subtitle={`Contact • ${id}`}
            backPath="/cheese/contacts"
            isLoading={isLoading}
            statusBadge={<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>}
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
                            <TabsTrigger value="details" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><User className="w-4 h-4 mr-2" /> Details</TabsTrigger>
                            <TabsTrigger value="activity" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Calendar className="w-4 h-4 mr-2" /> Activity & Bookings</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="pt-4 space-y-6">
                            {/* Personal Info Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <User className="w-4 h-4 mr-2" /> Personal Information
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <EditableField label="Full Name" value={form.full_name} onChange={(v) => handleFieldChange("full_name", v)} editMode={editMode} />
                                        <EditableField label="Phone Number" type="tel" value={form.phone} onChange={(v) => handleFieldChange("phone", v)} editMode={editMode} />
                                        <EditableField label="Email Address" type="email" value={form.email} onChange={(v) => handleFieldChange("email", v)} editMode={editMode} />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Preferences & Details Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <MapPin className="w-4 h-4 mr-2" /> Preferences & Address
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <EditableField label="Address (Linked)" value={form.address} onChange={(v) => handleFieldChange("address", v)} editMode={editMode} doctype="Address" searchLabel="address_title" />
                                        <EditableField label="Source" value={form.source} onChange={(v) => handleFieldChange("source", v)} editMode={editMode} />
                                        <EditableField label="Preferred Language" value={form.preferred_language} onChange={(v) => handleFieldChange("preferred_language", v)} editMode={editMode} />
                                        <EditableField label="Preferred Channel" value={form.preferred_channel} onChange={(v) => handleFieldChange("preferred_channel", v)} editMode={editMode} />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Notes Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Internal Notes</CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    {editMode ? (
                                        <textarea
                                            value={form.notes}
                                            onChange={(e) => handleFieldChange("notes", e.target.value)}
                                            placeholder="Add notes about this contact..."
                                            className="w-full min-h-[120px] p-3 text-sm border rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                        />
                                    ) : (
                                        <div className="text-sm whitespace-pre-wrap">{form.notes || <span className="text-muted-foreground italic">No notes</span>}</div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="activity" className="pt-4">
                            <Card className="border-border/60 shadow-sm">
                                <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center">
                                    <Search className="w-8 h-8 mb-4 opacity-20" />
                                    <p>Activity history will be populated here as tickets and bookings are made for {contact?.full_name || "this contact"}.</p>
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
                                <p className="text-sm font-medium">{contact?.creation ? new Date(contact.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Last Modified</Label>
                                <p className="text-sm font-medium">{contact?.modified ? new Date(contact.modified).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Owner</Label>
                                <p className="text-sm font-medium">{contact?.owner || "—"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                <button onClick={() => navigate(`/cheese/leads/new?contact=${id}`)} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium">Create Lead for Contact</button>
                                <button onClick={() => navigate(`/cheese/tickets/new?contact=${id}`)} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium">Create Ticket</button>
                                <button onClick={() => navigate(`/cheese/support/new?contact=${id}`)} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium">Log Support Case</button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DetailPageLayout>
    );
}
