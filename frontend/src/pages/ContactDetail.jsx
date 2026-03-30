import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeDoc, useFrappeUpdate, useFrappeList } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Mail, Phone, Calendar, Globe, MapPin, Search, Ticket, MessageSquare, ShoppingCart, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContactDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    // Fetch Data
    const { data: contact, isLoading } = useFrappeDoc("Cheese Contact", id);
    const updateMutation = useFrappeUpdate("Cheese Contact");

    const { data: tickets = [], isLoading: ticketsLoading } = useFrappeList("Cheese Ticket", {
        filters: { contact: id },
        fields: ["name", "status", "experience", "party_size", "creation", "slot", "route"],
        pageSize: 50,
        orderBy: "creation desc",
        enabled: !!id,
    });

    const { data: conversations = [], isLoading: convsLoading } = useFrappeList("Conversation", {
        filters: { contact: id },
        fields: ["name", "channel", "status", "summary", "modified"],
        pageSize: 20,
        orderBy: "modified desc",
        enabled: !!id,
    });

    const { data: leads = [], isLoading: leadsLoading } = useFrappeList("Cheese Lead", {
        filters: { contact: id },
        fields: ["name", "status", "interest_type", "creation"],
        pageSize: 20,
        orderBy: "creation desc",
        enabled: !!id,
    });

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

    if (!isLoading && !contact) {
        return (
            <DetailPageLayout
                title="Contact not found"
                subtitle={`Contact • ${id || "Unknown"}`}
                backPath="/cheese/contacts"
                isLoading={false}
            >
                <div className="p-6">
                    <Card className="border-border/60 shadow-sm">
                        <CardContent className="p-8 text-center text-muted-foreground">
                            The requested contact was not found or is no longer available.
                        </CardContent>
                    </Card>
                </div>
            </DetailPageLayout>
        );
    }

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

                        <TabsContent value="activity" className="pt-4 space-y-6">
                            {/* Tickets */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Ticket className="w-4 h-4 mr-2" /> Tickets ({tickets.length})
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4">
                                    {ticketsLoading ? (
                                        <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                                    ) : tickets.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">No tickets for this contact</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {tickets.map(t => (
                                                <div key={t.name} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => navigate(`/cheese/tickets/${t.name}`)}>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium">{t.name}</p>
                                                        <p className="text-xs text-muted-foreground">{t.experience || "—"} · {t.party_size || 1} guests</p>
                                                    </div>
                                                    <Badge variant="outline" className="text-xs shrink-0 ml-2">{t.status}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Conversations */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <MessageSquare className="w-4 h-4 mr-2" /> Conversations ({conversations.length})
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4">
                                    {convsLoading ? (
                                        <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                                    ) : conversations.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">No conversations for this contact</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {conversations.map(c => (
                                                <div key={c.name} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => navigate(`/cheese/conversations?contact=${id}`)}>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium">{c.name}</p>
                                                        <p className="text-xs text-muted-foreground truncate">{c.summary || "No summary"}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                                        <Badge variant="outline" className="text-xs">{c.channel}</Badge>
                                                        <Badge variant="outline" className="text-xs">{c.status}</Badge>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Leads */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <UserCheck className="w-4 h-4 mr-2" /> Leads ({leads.length})
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4">
                                    {leadsLoading ? (
                                        <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                                    ) : leads.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">No leads for this contact</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {leads.map(l => (
                                                <div key={l.name} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => navigate(`/cheese/leads/${l.name}`)}>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium">{l.name}</p>
                                                        <p className="text-xs text-muted-foreground">{l.interest_type || "—"}</p>
                                                    </div>
                                                    <Badge variant="outline" className="text-xs shrink-0 ml-2">{l.status}</Badge>
                                                </div>
                                            ))}
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
