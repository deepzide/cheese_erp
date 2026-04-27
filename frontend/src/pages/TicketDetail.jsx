import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeDoc, useFrappeUpdate, useFrappeList } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Ticket, DollarSign, Calendar, Users, MapPin, Clock, MessageSquare,
    Briefcase, CreditCard, Wallet, CheckCircle, XCircle
} from "lucide-react";
import { apiRequest } from "@/api/client";

const fmt = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

const formatSlotDateTime = (slot, selectedDate) => {
    if (!slot) return { date: "—", time: "—" };
    const rawDate = selectedDate || slot.date_from;
    const date = rawDate ? new Date(rawDate + "T00:00:00").toLocaleDateString() : "—";
    const timeFrom = slot.time_from ? slot.time_from.substring(0, 5) : "";
    const timeTo = slot.time_to ? slot.time_to.substring(0, 5) : "";
    const time = timeFrom ? (timeTo ? `${timeFrom} – ${timeTo}` : timeFrom) : "—";
    return { date, time };
};

export default function TicketDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    const { data: ticket, isLoading, refetch } = useFrappeDoc("Cheese Ticket", id);
    const updateMutation = useFrappeUpdate("Cheese Ticket");

    const { data: slotDoc } = useFrappeDoc(
        "Cheese Experience Slot",
        ticket?.slot,
        { enabled: !!ticket?.slot }
    );

    const { data: experienceDoc } = useFrappeDoc(
        "Cheese Experience",
        ticket?.experience,
        { enabled: !!ticket?.experience }
    );

    // Fetch deposits for this ticket
    const { data: deposits = [] } = useFrappeList("Cheese Deposit", {
        filters: { entity_type: "Cheese Ticket", entity_id: id },
        fields: ["name", "status", "amount_required", "amount_paid", "creation"],
        enabled: !!id,
    });

    // Local State for Edit Mode
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});

    useEffect(() => {
        if (ticket) {
            setForm({
                contact: ticket.contact || "",
                company: ticket.company || "",
                experience: ticket.experience || "",
                route: ticket.route || "",
                slot: ticket.slot || "",
                selected_date: ticket.selected_date || "",
                party_size: ticket.party_size || 1,
                rooms_requested: ticket.rooms_requested || 1,
                check_in_date: ticket.check_in_date || "",
                check_out_date: ticket.check_out_date || "",
                nights: ticket.nights || 0,
                room_number_assigned: ticket.room_number_assigned || "",
                status: ticket.status || "PENDING",
                expires_at: ticket.expires_at || "",
                conversation: ticket.conversation || "",
                total_price: ticket.total_price || 0,
                deposit_required: ticket.deposit_required || 0,
                deposit_amount: ticket.deposit_amount || 0,
            });
        }
    }, [ticket]);

    const isHotel = experienceDoc?.experience_type === "HOTEL";

    const handleFieldChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        if (!form.contact || !form.experience || !form.slot) {
            toast.error("Contact, Experience, and Slot are required.");
            return;
        }
        const changes = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== (ticket[key] || "")) {
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

    const handleCreateRemainingDeposit = async () => {
        try {
            const res = await apiRequest("/api/method/cheese.api.v1.deposit_controller.create_remaining_balance_deposit", {
                method: "POST",
                body: JSON.stringify({ ticket_id: id }),
            });
            if (res?.data?.data?.deposit_id) {
                toast.success("Remaining balance deposit created");
                navigate(`/cheese/deposits/${res.data.data.deposit_id}`);
            }
        } catch (err) {
            toast.error(err?.message || "Failed to create remaining balance deposit");
        }
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

    // Computed financials
    const backendTotal = Number(ticket?.total_price || 0);
    const partySize = ticket?.party_size || form.party_size || 1;
    const roomsRequested = ticket?.rooms_requested || form.rooms_requested || 1;
    const nights = ticket?.nights || form.nights || 0;
    const unitCost = isHotel 
        ? (roomsRequested > 0 && nights > 0 ? backendTotal / (roomsRequested * nights) : 0)
        : (partySize > 0 ? backendTotal / partySize : 0);
    const totalPerTicket = backendTotal;
    const depositAmount = ticket?.deposit_amount || form.deposit_amount || 0;
    const totalDepositPaid = deposits.reduce((sum, d) => sum + (d.amount_paid || 0), 0);
    const advancePaid = Math.min(totalDepositPaid, depositAmount);
    const advancePending = Math.max(depositAmount - advancePaid, 0);
    const remainingTotal = Math.max(totalPerTicket - depositAmount, 0);
    const remainingPaid = Math.max(totalDepositPaid - depositAmount, 0);
    const remainingPending = Math.max(remainingTotal - remainingPaid, 0);

    const hasAdvancePaid = deposits.some(d => d.status === "PAID");
    const hasNoPendingDeposit = !deposits.some(d => d.status === "PENDING" || d.status === "OVERDUE");

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
                                        {isHotel ? (
                                            <EditableField label="Rooms Requested" type="number" value={form.rooms_requested} onChange={(v) => handleFieldChange("rooms_requested", v)} editMode={editMode} />
                                        ) : (
                                            <EditableField label="Party Size" type="number" value={form.party_size} onChange={(v) => handleFieldChange("party_size", v)} editMode={editMode} />
                                        )}
                                        <div className="space-y-1">
                                            {editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">Status</label>
                                                    <select value={form.status} onChange={(e) => handleFieldChange("status", e.target.value)} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring">
                                                        {["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "EXPIRED", "REJECTED", "CANCELLED", "NO_SHOW"].map(s => (
                                                            <option key={s} value={s}>{s}</option>
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
                                        <EditableField label="Route" value={form.route} onChange={(v) => handleFieldChange("route", v)} editMode={editMode} doctype="Cheese Route" searchLabel="short_description" />
                                        {editMode ? (
                                            <>
                                                <EditableField label="Slot" value={form.slot} onChange={(v) => handleFieldChange("slot", v)} editMode={editMode} doctype="Cheese Experience Slot" searchLabel="name" />
                                                {isHotel ? (
                                                    <>
                                                        <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                            <label className="text-xs text-muted-foreground">Check-in Date</label>
                                                            <input type="date" value={form.check_in_date || ""} onChange={(e) => handleFieldChange("check_in_date", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                                                        </div>
                                                        <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                            <label className="text-xs text-muted-foreground">Check-out Date</label>
                                                            <input type="date" value={form.check_out_date || ""} onChange={(e) => handleFieldChange("check_out_date", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                                                        </div>
                                                        <EditableField label="Room Assigned" value={form.room_number_assigned} onChange={(v) => handleFieldChange("room_number_assigned", v)} editMode={editMode} />
                                                    </>
                                                ) : (
                                                    <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                        <label className="text-xs text-muted-foreground">Selected Date</label>
                                                        <input type="date" value={form.selected_date || ""} onChange={(e) => handleFieldChange("selected_date", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {isHotel ? (
                                                    <>
                                                        <EditableField label="Check-in" value={form.check_in_date ? new Date(form.check_in_date + "T00:00:00").toLocaleDateString() : "—"} editMode={false} />
                                                        <EditableField label="Check-out" value={form.check_out_date ? new Date(form.check_out_date + "T00:00:00").toLocaleDateString() : "—"} editMode={false} />
                                                        <EditableField label="Nights" value={form.nights} editMode={false} />
                                                        <EditableField label="Room Assigned" value={form.room_number_assigned || "—"} editMode={false} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <EditableField label="Date" value={formatSlotDateTime(slotDoc, ticket?.selected_date).date} editMode={false} />
                                                        <EditableField label="Time" value={formatSlotDateTime(slotDoc, ticket?.selected_date).time} editMode={false} />
                                                    </>
                                                )}
                                            </>
                                        )}
                                        {editMode ? (
                                            <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                <label className="text-xs text-muted-foreground">Expires At</label>
                                                <input type="datetime-local" value={form.expires_at ? form.expires_at.substring(0, 16) : ""} onChange={(e) => handleFieldChange("expires_at", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                                            </div>
                                        ) : (
                                            <EditableField label="Expires At" value={form.expires_at ? new Date(form.expires_at).toLocaleString() : ""} editMode={false} />
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                        </TabsContent>

                        {/* ─── Financials Tab ─── */}
                        <TabsContent value="financials" className="pt-4 space-y-6">
                            {/* Experience Details Table */}
                            <Card className="border-border/60 shadow-sm overflow-hidden">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Ticket className="w-4 h-4 mr-2" /> Experience Details
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                                    <th className="text-left px-4 py-3 font-semibold">Experience</th>
                                                    <th className="text-left px-4 py-3 font-semibold">Ticket ID</th>
                                                    <th className="text-right px-4 py-3 font-semibold">{isHotel ? "Price / Night" : "Unit Cost"}</th>
                                                    <th className="text-center px-4 py-3 font-semibold">{isHotel ? "Rooms x Nights" : "Party Size"}</th>
                                                    <th className="text-right px-4 py-3 font-semibold">Total</th>
                                                    <th className="text-right px-4 py-3 font-semibold">Seña 10%</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr className="hover:bg-muted/10 transition-colors">
                                                    <td className="px-4 py-3 font-medium">
                                                        <button className="text-left hover:text-cheese-600 transition-colors" onClick={() => ticket?.experience && navigate(`/cheese/experiences/${ticket.experience}`)}>
                                                            {experienceDoc?.name || ticket?.experience || "—"}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{id}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{fmt(unitCost)}</td>
                                                    <td className="px-4 py-3 text-center">{isHotel ? `${roomsRequested} x ${nights}` : partySize}</td>
                                                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmt(totalPerTicket)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{fmt(depositAmount)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Payment Information Table */}
                            <Card className="border-border/60 shadow-sm overflow-hidden">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <DollarSign className="w-4 h-4 mr-2" /> Payment Information
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                                    <th className="text-left px-4 py-3 font-semibold">Concept</th>
                                                    <th className="text-right px-4 py-3 font-semibold">Total</th>
                                                    <th className="text-right px-4 py-3 font-semibold">Paid</th>
                                                    <th className="text-right px-4 py-3 font-semibold">Pending</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/50">
                                                <tr className="hover:bg-muted/10">
                                                    <td className="px-4 py-2.5 flex items-center gap-2">
                                                        <Wallet className="w-4 h-4 text-cheese-600" /> Seña (Advance)
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(depositAmount)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmt(advancePaid)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmt(advancePending)}</td>
                                                </tr>
                                                <tr className="hover:bg-muted/10">
                                                    <td className="px-4 py-2.5 flex items-center gap-2">
                                                        <DollarSign className="w-4 h-4 text-cheese-600" /> Remanente
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(remainingTotal)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmt(remainingPaid)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmt(remainingPending)}</td>
                                                </tr>
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-muted/30 font-bold">
                                                    <td className="px-4 py-3">Total</td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totalPerTicket)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{fmt(totalDepositPaid)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums text-red-600">{fmt(totalPerTicket - totalDepositPaid)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Ticket Card (Summary) */}
                            <Card className="border-border/60 shadow-sm overflow-hidden">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <CreditCard className="w-4 h-4 mr-2" /> Ticket Card
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                                <th className="text-left px-4 py-3 font-semibold">Concept</th>
                                                <th className="text-right px-4 py-3 font-semibold">Paid</th>
                                                <th className="text-right px-4 py-3 font-semibold">Pending</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            <tr className="hover:bg-muted/10">
                                                <td className="px-4 py-3 flex items-center gap-2">
                                                    <Wallet className="w-4 h-4 text-cheese-600" /> Advance Payment
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600">{fmt(advancePaid)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">{fmt(advancePending)}</td>
                                            </tr>
                                            <tr className="hover:bg-muted/10">
                                                <td className="px-4 py-3 flex items-center gap-2">
                                                    <DollarSign className="w-4 h-4 text-cheese-600" /> Remaining Balance
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600">{fmt(remainingPaid)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">{fmt(remainingPending)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>

                            {/* Deposit Records */}
                            {deposits.length > 0 && (
                                <Card className="border-border/60 shadow-sm">
                                    <CardHeader className="border-b bg-muted/20 pb-4">
                                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">
                                            Deposit Records
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="divide-y divide-border/50">
                                            {deposits.map((d) => (
                                                <button
                                                    key={d.name}
                                                    className="w-full p-4 flex items-center justify-between hover:bg-muted/10 transition-colors text-left"
                                                    onClick={() => navigate(`/cheese/deposits/${d.name}`)}
                                                >
                                                    <div>
                                                        <p className="text-sm font-mono">{d.name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Required: {fmt(d.amount_required)} • Paid: {fmt(d.amount_paid)}
                                                        </p>
                                                    </div>
                                                    <Badge variant="outline" className={
                                                        d.status === "PAID" ? "bg-emerald-500/15 text-emerald-700 border-emerald-200" :
                                                        d.status === "PENDING" ? "bg-yellow-500/15 text-yellow-700 border-yellow-200" :
                                                        "bg-red-500/15 text-red-700 border-red-200"
                                                    }>
                                                        {d.status}
                                                    </Badge>
                                                </button>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right Column - Sidebar */}
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
                                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate(`/cheese/deposits/new?ticket=${id}`)}>
                                    <DollarSign className="w-4 h-4 mr-2" /> Register Deposit Payment
                                </Button>
                                {hasAdvancePaid && hasNoPendingDeposit && remainingPending > 0 && (
                                    <Button variant="outline" size="sm" className="justify-start text-cheese-700" onClick={handleCreateRemainingDeposit}>
                                        <Wallet className="w-4 h-4 mr-2" /> Pay Remaining Balance
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate(`/cheese/bookings/new?ticket=${id}`)}>
                                    <Briefcase className="w-4 h-4 mr-2" /> Convert to Final Booking
                                </Button>
                                {ticket?.status !== "CONFIRMED" && (
                                    <Button variant="outline" size="sm" className="justify-start text-emerald-700" onClick={() => updateMutation.mutate({ name: id, data: { status: "CONFIRMED" } })} disabled={updateMutation.isPending}>
                                        <CheckCircle className="w-4 h-4 mr-2" /> Mark as Confirmed
                                    </Button>
                                )}
                                {ticket?.contact && (
                                    <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate(`/cheese/contacts/${ticket.contact}`)}>
                                        <Users className="w-4 h-4 mr-2" /> View Contact
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DetailPageLayout>
    );
}
