import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useFrappeDoc, useFrappeUpdate, useFrappeList } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import TicketRooms from "@/components/TicketRooms";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
    Ticket, DollarSign, Calendar, Users, MapPin, Clock, MessageSquare,
    Briefcase, CreditCard, Wallet, CheckCircle, XCircle, QrCode, Star,
    Bell, Send, Package, FileEdit, RotateCcw, LifeBuoy, Receipt, Undo2,
    History, UserX, Trash2
} from "lucide-react";
import { apiRequest, unwrapFrappeMethodData } from "@/api/client";

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
    const { t } = useTranslation();

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

    // QR tokens issued for this ticket (QR & Check-in tab)
    const { data: qrTokens = [] } = useFrappeList("Cheese QR Token", {
        filters: { ticket: id },
        fields: ["name", "status", "expires_at", "creation"],
        enabled: !!id,
    });

    // Survey responses: this ticket's review + the contact's history (Satisfacción tab)
    const { data: ticketSurveys = [] } = useFrappeList("Cheese Survey Response", {
        filters: { ticket: id },
        fields: ["name", "rating", "comment", "sent_at", "answered_at"],
        enabled: !!id,
    });
    const { data: contactSurveys = [] } = useFrappeList("Cheese Survey Response", {
        filters: { contact: ticket?.contact || "__none__" },
        fields: ["name", "ticket", "rating", "comment", "sent_at", "answered_at"],
        enabled: !!ticket?.contact,
    });

    // Conversations of the contact — the reminder is sent through the bot on the
    // conversation's channel (ticket's linked conversation, else the most recent).
    const { data: contactConvos = [] } = useFrappeList("Conversation", {
        filters: { contact: ticket?.contact || "__none__" },
        fields: ["name", "channel", "modified"],
        enabled: !!ticket?.contact,
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
                notes: ticket.notes || "",
            });
        }
    }, [ticket]);

    const isHotel = experienceDoc?.experience_type === "HOTEL";

    const handleFieldChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        if (!form.contact || !form.experience || !form.slot) {
            toast.error(t("tickets.validationError", "Contact, Experience, and Slot are required."));
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
                toast.success(t("tickets.updateSuccess", "Ticket updated successfully."));
                setEditMode(false);
            },
            onError: (err) => toast.error(err?.message || t("tickets.updateError", "Failed to update ticket"))
        });
    };

    const handleCreateRemainingDeposit = async () => {
        try {
            const res = await apiRequest("/api/method/cheese.api.v1.deposit_controller.create_remaining_balance_deposit", {
                method: "POST",
                body: JSON.stringify({ ticket_id: id }),
            });
            if (res?.data?.data?.deposit_id) {
                toast.success(t("tickets.remainingDepositSuccess", "Remaining balance deposit created"));
                navigate(`/cheese/deposits/${res.data.data.deposit_id}`);
            }
        } catch (err) {
            toast.error(err?.message || t("tickets.remainingDepositError", "Failed to create remaining balance deposit"));
        }
    };

    // ─── Reminder (send as bot through the conversation's channel) ───
    const sortedConvos = [...contactConvos].sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));
    const reminderConvo =
        (ticket?.conversation && (sortedConvos.find((c) => c.name === ticket.conversation) || { name: ticket.conversation, channel: null })) ||
        sortedConvos[0] || null;

    const [reminderOpen, setReminderOpen] = useState(false);
    const [reminderText, setReminderText] = useState("");
    const [reminderSending, setReminderSending] = useState(false);

    // WhatsApp 24h window check — the proxy returns applicable:false for other channels.
    const { data: reminderWindow } = useQuery({
        queryKey: ["ticket-reminder-window", reminderConvo?.name],
        enabled: reminderOpen && !!reminderConvo?.name,
        queryFn: async () => unwrapFrappeMethodData(
            await apiRequest(`/api/method/cheese.api.v1.bot_control_controller.whatsapp_window?conversation_id=${encodeURIComponent(reminderConvo.name)}`), {}),
    });
    const windowBlocked = !!(reminderWindow?.applicable && !reminderWindow?.active);

    const sendReminder = async () => {
        if (!reminderText.trim() || !reminderConvo?.name) return;
        try {
            setReminderSending(true);
            await apiRequest("/api/method/cheese.api.v1.bot_control_controller.send_message", {
                method: "POST",
                body: JSON.stringify({ conversation_id: reminderConvo.name, message: reminderText.trim() }),
            });
            toast.success(t("tickets.reminderSent", "Reminder sent"));
            setReminderOpen(false);
            setReminderText("");
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setReminderSending(false);
        }
    };

    // ─── Resend check-in QR (bot proxy; ERP issues QR for CONFIRMED/CHECKED_IN) ───
    const qrResendAvailable = ["CONFIRMED", "CHECKED_IN"].includes(ticket?.status);
    const [qrResending, setQrResending] = useState(false);
    const handleResendQr = async () => {
        try {
            setQrResending(true);
            await apiRequest("/api/method/cheese.api.v1.bot_control_controller.resend_ticket_qr", {
                method: "POST",
                body: JSON.stringify({ ticket_id: id }),
            });
            toast.success(t("tickets.qrResent", "QR re-sent"));
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setQrResending(false);
        }
    };

    // ─── Request satisfaction survey (bot sends it and arms the reply flow) ───
    const [surveySending, setSurveySending] = useState(false);
    const handleRequestSurvey = async () => {
        try {
            setSurveySending(true);
            await apiRequest("/api/method/cheese.api.v1.bot_control_controller.request_ticket_survey", {
                method: "POST",
                body: JSON.stringify({ ticket_id: id }),
            });
            toast.success(t("tickets.surveySent", "Survey sent"));
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setSurveySending(false);
        }
    };

    // ─── Status flow actions ───
    const [actionBusy, setActionBusy] = useState(false);
    const callTicketAction = async (endpoint, body, successMsg) => {
        try {
            setActionBusy(true);
            await apiRequest(`/api/method/cheese.api.v1.ticket_controller.${endpoint}`, {
                method: "POST",
                body: JSON.stringify(body),
            });
            toast.success(successMsg);
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setActionBusy(false);
        }
    };

    // Advance to the next state in the flow: PENDING → CONFIRMED → CHECKED_IN → COMPLETED.
    const handleAdvance = () => {
        if (ticket?.status === "PENDING") {
            callTicketAction("confirm_ticket", { ticket_id: id }, t("tickets.confirmedOk", "Reservation confirmed"));
        } else if (ticket?.status === "CONFIRMED") {
            callTicketAction("update_ticket_status", { ticket_id: id, new_status: "CHECKED_IN" }, t("tickets.checkedInOk", "Check-in registered"));
        } else if (ticket?.status === "CHECKED_IN") {
            callTicketAction("update_ticket_status", { ticket_id: id, new_status: "COMPLETED" }, t("tickets.completedOk", "Ticket completed"));
        }
    };

    const handleReject = () => {
        if (!window.confirm(t("tickets.rejectConfirm", "Reject this ticket? This cannot be undone."))) return;
        callTicketAction("reject_ticket", { ticket_id: id }, t("tickets.rejectedOk", "Ticket rejected"));
    };
    const handleNoShow = () => {
        if (!window.confirm(t("tickets.noShowConfirm", "Mark this ticket as no-show? This cannot be undone."))) return;
        callTicketAction("mark_no_show", { ticket_id: id }, t("tickets.noShowOk", "Ticket marked as no-show"));
    };
    const handleCancel = () => {
        if (!window.confirm(t("tickets.cancelConfirm", "Cancel this reservation? This cannot be undone."))) return;
        callTicketAction("cancel_ticket", { ticket_id: id }, t("tickets.cancelledOk", "Reservation cancelled"));
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case "PENDING": return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{t("status.PENDING", "Pending")}</Badge>;
            case "CONFIRMED": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{t("status.CONFIRMED", "Confirmed")}</Badge>;
            case "CHECKED_IN": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{t("status.CHECKED_IN", "Checked In")}</Badge>;
            case "COMPLETED": return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">{t("status.COMPLETED", "Completed")}</Badge>;
            case "EXPIRED":
            case "CANCELLED":
            case "NO_SHOW":
            case "REJECTED": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{t(`status.${status}`, status.replace("_", " "))}</Badge>;
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

    const hasAdvancePaid = depositAmount === 0 || deposits.some(d => d.status === "PAID" || d.status === "CONFIRMED");
    const hasNoPendingDeposit = !deposits.some(d => d.status === "PENDING" || d.status === "OVERDUE");
    const totalPending = Math.max(totalPerTicket - totalDepositPaid, 0);

    // ─── State-dependent ticket actions (new-UI flowbox) ───
    // Disabled entries are visible per the mockup but not implemented yet.
    const soon = t("tickets.comingSoon", "Not available yet");
    const goContact = { key: "contact", icon: Users, label: t("tickets.viewContact", "View Contact"), onClick: () => ticket?.contact && navigate(`/cheese/contacts/${ticket.contact}`) };
    const buildActions = () => {
        switch (ticket?.status) {
            case "PENDING":
                return {
                    primary: [
                        ...(totalPending > 0 ? [{ key: "pay", icon: CreditCard, label: t("tickets.registerDepositPayment", "Register Payment"), onClick: () => navigate(`/cheese/deposits/new?ticket=${id}`) }] : []),
                        { key: "advance", icon: CheckCircle, label: t("tickets.confirmReservation", "Confirm reservation"), onClick: handleAdvance },
                    ],
                    secondary: [
                        { key: "reminder", icon: Bell, label: t("tickets.sendReminder", "Send reminder"), onClick: () => setReminderOpen(true), disabled: !reminderConvo, title: !reminderConvo ? t("tickets.noConversation", "The contact has no bot conversation") : undefined },
                        { key: "convert", icon: Package, label: t("tickets.convertToFinalBooking", "Convert to Final Booking"), disabled: true, title: soon },
                        { key: "modify", icon: FileEdit, label: t("tickets.modifySeePolicy", "Modify (see policy)"), disabled: true, title: soon },
                        goContact,
                    ],
                    danger: [
                        { key: "reject", icon: XCircle, label: t("tickets.rejectTicket", "Reject ticket"), onClick: handleReject },
                        { key: "cancel", icon: Trash2, label: t("tickets.cancelReservation", "Cancel reservation"), onClick: handleCancel },
                    ],
                };
            case "CONFIRMED":
                return {
                    primary: [{ key: "advance", icon: CheckCircle, label: t("tickets.markCheckIn", "Mark check-in"), onClick: handleAdvance }],
                    secondary: [
                        { key: "resendqr", icon: QrCode, label: qrResending ? t("common.sending", "Sending…") : t("tickets.resendQr", "Resend QR"), onClick: handleResendQr, disabled: qrResending },
                        ...(hasAdvancePaid && hasNoPendingDeposit && remainingPending > 0 ? [{ key: "remaining", icon: Wallet, label: t("tickets.payRemainingBalance", "Register remaining balance"), onClick: handleCreateRemainingDeposit }] : []),
                        { key: "modify", icon: FileEdit, label: t("tickets.modifySeePolicy", "Modify (see policy)"), disabled: true, title: soon },
                        goContact,
                    ],
                    danger: [
                        { key: "noshow", icon: UserX, label: t("tickets.markNoShow", "Mark no-show"), onClick: handleNoShow },
                        { key: "cancel", icon: Trash2, label: t("tickets.cancelReservation", "Cancel reservation"), onClick: handleCancel },
                    ],
                };
            case "CHECKED_IN":
                return {
                    primary: [{ key: "advance", icon: CheckCircle, label: t("tickets.completeTicket", "Complete ticket"), onClick: handleAdvance }],
                    secondary: [goContact],
                    danger: [],
                };
            case "COMPLETED":
                return {
                    primary: [{ key: "review", icon: Star, label: surveySending ? t("common.sending", "Sending…") : t("tickets.requestReview", "Request review"), onClick: handleRequestSurvey, disabled: surveySending }],
                    secondary: [
                        { key: "receipt", icon: Receipt, label: t("tickets.resendReceipt", "Resend receipt"), disabled: true, title: soon },
                        { key: "support", icon: LifeBuoy, label: t("tickets.createSupportCase", "Create support case"), disabled: true, title: soon },
                        goContact,
                    ],
                    danger: [{ key: "refund", icon: Undo2, label: t("tickets.registerRefund", "Register refund"), disabled: true, title: soon }],
                };
            case "NO_SHOW":
                return {
                    primary: [totalPending > 0
                        ? { key: "penalty", icon: CreditCard, label: t("tickets.chargePenalty", "Charge penalty"), disabled: true, title: soon }
                        : { key: "reactivate", icon: RotateCcw, label: t("tickets.reactivate", "Reactivate reservation"), disabled: true, title: soon }],
                    secondary: [
                        { key: "support", icon: LifeBuoy, label: t("tickets.createSupportCase", "Create support case"), disabled: true, title: soon },
                        goContact,
                    ],
                    danger: [{ key: "cancel", icon: Trash2, label: t("tickets.cancelPermanently", "Cancel permanently"), disabled: true, title: soon }],
                };
            default: // CANCELLED / EXPIRED / REJECTED
                return {
                    primary: [{ key: "reactivate", icon: RotateCcw, label: t("tickets.reactivateNew", "Reactivate / new reservation"), disabled: true, title: soon }],
                    secondary: [goContact, { key: "history", icon: History, label: t("tickets.viewHistory", "View history"), disabled: true, title: soon }],
                    danger: [],
                };
        }
    };
    const actions = ticket ? buildActions() : { primary: [], secondary: [], danger: [] };

    const renderActionBtn = (a, variantClass) => {
        const Icon = a.icon;
        return (
            <Button
                key={a.key}
                variant="outline"
                size="sm"
                className={`justify-start w-full ${variantClass || ""}`}
                onClick={a.onClick}
                disabled={a.disabled || actionBusy}
                title={a.title}
            >
                <Icon className="w-4 h-4 mr-2" /> {a.label}
            </Button>
        );
    };

    // QR & survey derived state
    const latestQr = [...qrTokens].sort((a, b) => (b.creation || "").localeCompare(a.creation || ""))[0] || null;
    const checkInDone = ["CHECKED_IN", "COMPLETED"].includes(ticket?.status);
    const thisReview = ticketSurveys.find((r) => r.rating != null) || null;
    const answeredHistory = contactSurveys
        .filter((r) => r.rating != null)
        .sort((a, b) => (b.answered_at || b.sent_at || "").localeCompare(a.answered_at || a.sent_at || ""));
    const avgRating = answeredHistory.length
        ? (answeredHistory.reduce((s, r) => s + (r.rating || 0), 0) / answeredHistory.length).toFixed(1)
        : null;
    const ratingColor = (n) => (n <= 3 ? "text-red-600" : n === 4 ? "text-amber-600" : "text-emerald-600");

    return (
        <DetailPageLayout
            title={id}
            subtitle={`${t("tickets.ticketFor", "Ticket for")} ${ticket?.contact || t("common.loading", "Loading...")}`}
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
                            <TabsTrigger value="details" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Ticket className="w-4 h-4 mr-2" /> {t("tickets.summaryTab", "Summary")}</TabsTrigger>
                            <TabsTrigger value="financials" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><DollarSign className="w-4 h-4 mr-2" /> {t("tickets.financials", "Financials")}</TabsTrigger>
                            <TabsTrigger value="qr" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><QrCode className="w-4 h-4 mr-2" /> {t("tickets.qrCheckin", "QR & Check-in")}</TabsTrigger>
                            <TabsTrigger value="satisfaction" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Star className="w-4 h-4 mr-2" /> {t("tickets.satisfaction", "Satisfaction")}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="pt-4 space-y-6">
                            {/* Reservation information (mockup fields) */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Users className="w-4 h-4 mr-2" /> {t("tickets.reservationInfo", "Reservation Information")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        {isHotel ? (
                                            <>
                                                <EditableField label={t("tickets.guest", "Guest")} value={form.contact} onChange={(v) => handleFieldChange("contact", v)} editMode={editMode} doctype="Cheese Contact" searchLabel="full_name" />
                                                <EditableField label={t("tickets.guests", "Guests")} type="number" value={form.party_size} onChange={(v) => handleFieldChange("party_size", v)} editMode={editMode} />
                                                {editMode ? (
                                                    <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                        <label className="text-xs text-muted-foreground">{t("hotelReservations.checkInDate", "Check-in")}</label>
                                                        <input type="date" value={form.check_in_date || ""} onChange={(e) => handleFieldChange("check_in_date", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                                                    </div>
                                                ) : (
                                                    <EditableField label={t("hotelReservations.checkInDate", "Check-in")} value={form.check_in_date ? new Date(form.check_in_date + "T00:00:00").toLocaleDateString() : "—"} editMode={false} />
                                                )}
                                                <EditableField label={t("common.nights", "Nights")} value={form.nights} editMode={false} />
                                                <EditableField label={t("tickets.room", "Room")} value={form.experience} onChange={(v) => handleFieldChange("experience", v)} editMode={editMode} doctype="Cheese Experience" searchLabel="name" />
                                                <EditableField label={t("tickets.establishment", "Establishment")} value={form.company} onChange={(v) => handleFieldChange("company", v)} editMode={editMode} doctype="Company" searchLabel="name" />
                                            </>
                                        ) : (
                                            <>
                                                <EditableField label={t("common.contact", "Contact")} value={form.contact} onChange={(v) => handleFieldChange("contact", v)} editMode={editMode} doctype="Cheese Contact" searchLabel="full_name" />
                                                <EditableField label={t("tickets.groupSize", "Group size")} type="number" value={form.party_size} onChange={(v) => handleFieldChange("party_size", v)} editMode={editMode} />
                                                <EditableField label={t("tickets.experience", "Experience")} value={form.experience} onChange={(v) => handleFieldChange("experience", v)} editMode={editMode} doctype="Cheese Experience" searchLabel="name" />
                                                <EditableField label={t("tickets.establishment", "Establishment")} value={form.company} onChange={(v) => handleFieldChange("company", v)} editMode={editMode} doctype="Company" searchLabel="name" />
                                                {editMode ? (
                                                    <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                        <label className="text-xs text-muted-foreground">{t("common.date", "Date")}</label>
                                                        <input type="date" value={form.selected_date || ""} onChange={(e) => handleFieldChange("selected_date", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                                                    </div>
                                                ) : (
                                                    <EditableField label={t("common.date", "Date")} value={formatSlotDateTime(slotDoc, ticket?.selected_date).date} editMode={false} />
                                                )}
                                                <EditableField label={t("common.time", "Time")} value={formatSlotDateTime(slotDoc, ticket?.selected_date).time} editMode={false} />
                                            </>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">
                                        {t("tickets.guestNotes", "Guest notes")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    {editMode ? (
                                        <Textarea
                                            value={form.notes}
                                            onChange={(e) => handleFieldChange("notes", e.target.value)}
                                            placeholder={t("tickets.guestNotesPlaceholder", "Dietary, accessibility, or other requirements...")}
                                            className="min-h-[100px]"
                                        />
                                    ) : (
                                        <p className="text-sm whitespace-pre-wrap">
                                            {form.notes || <span className="text-muted-foreground italic">{t("common.noNotes", "No notes")}</span>}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>

                        </TabsContent>

                        {/* ─── Financials Tab ─── */}
                        <TabsContent value="financials" className="pt-4 space-y-6">
                            {/* Experience Details Table */}
                            <Card className="border-border/60 shadow-sm overflow-hidden">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Ticket className="w-4 h-4 mr-2" /> {t("tickets.experienceDetails", "Experience Details")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                                    <th className="text-left px-4 py-3 font-semibold">{t("tickets.experience", "Experience")}</th>
                                                    <th className="text-left px-4 py-3 font-semibold">{t("tickets.ticketId", "Ticket ID")}</th>
                                                    <th className="text-right px-4 py-3 font-semibold">{isHotel ? t("tickets.pricePerNight", "Price / Night") : t("tickets.unitCost", "Unit Cost")}</th>
                                                    <th className="text-center px-4 py-3 font-semibold">{isHotel ? t("tickets.roomsXNights", "Rooms x Nights") : t("hotelReservations.partySize", "Party Size")}</th>
                                                    <th className="text-right px-4 py-3 font-semibold">{t("common.total", "Total")}</th>
                                                    <th className="text-right px-4 py-3 font-semibold">{t("tickets.advance", "Seña 10%")}</th>
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
                                        <DollarSign className="w-4 h-4 mr-2" /> {t("tickets.paymentInformation", "Payment Information")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                                    <th className="text-left px-4 py-3 font-semibold">{t("tickets.concept", "Concept")}</th>
                                                    <th className="text-right px-4 py-3 font-semibold">{t("common.total", "Total")}</th>
                                                    <th className="text-right px-4 py-3 font-semibold">{t("tickets.paid", "Paid")}</th>
                                                    <th className="text-right px-4 py-3 font-semibold">{t("tickets.pending", "Pending")}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/50">
                                                <tr className="hover:bg-muted/10">
                                                    <td className="px-4 py-2.5 flex items-center gap-2">
                                                        <Wallet className="w-4 h-4 text-cheese-600" /> {t("tickets.advancePayment", "Seña (Advance)")}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(depositAmount)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmt(advancePaid)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmt(advancePending)}</td>
                                                </tr>
                                                <tr className="hover:bg-muted/10">
                                                    <td className="px-4 py-2.5 flex items-center gap-2">
                                                        <DollarSign className="w-4 h-4 text-cheese-600" /> {t("tickets.remainingBalance", "Remanente")}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(remainingTotal)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmt(remainingPaid)}</td>
                                                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmt(remainingPending)}</td>
                                                </tr>
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-muted/30 font-bold">
                                                    <td className="px-4 py-3">{t("common.total", "Total")}</td>
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
                                        <CreditCard className="w-4 h-4 mr-2" /> {t("tickets.ticketCard", "Ticket Card")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/30 text-muted-foreground text-xs uppercase">
                                                <th className="text-left px-4 py-3 font-semibold">{t("tickets.concept", "Concept")}</th>
                                                <th className="text-right px-4 py-3 font-semibold">{t("tickets.paid", "Paid")}</th>
                                                <th className="text-right px-4 py-3 font-semibold">{t("tickets.pending", "Pending")}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            <tr className="hover:bg-muted/10">
                                                <td className="px-4 py-3 flex items-center gap-2">
                                                    <Wallet className="w-4 h-4 text-cheese-600" /> {t("tickets.advancePayment", "Advance Payment")}
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600">{fmt(advancePaid)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">{fmt(advancePending)}</td>
                                            </tr>
                                            <tr className="hover:bg-muted/10">
                                                <td className="px-4 py-3 flex items-center gap-2">
                                                    <DollarSign className="w-4 h-4 text-cheese-600" /> {t("tickets.remainingBalance", "Remaining Balance")}
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
                                            {t("tickets.depositRecords", "Deposit Records")}
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
                                                            {t("tickets.required", "Required")}: {fmt(d.amount_required)} • {t("tickets.paid", "Paid")}: {fmt(d.amount_paid)}
                                                        </p>
                                                    </div>
                                                    <Badge variant="outline" className={
                                                        d.status === "PAID" ? "bg-emerald-500/15 text-emerald-700 border-emerald-200" :
                                                        d.status === "PENDING" ? "bg-yellow-500/15 text-yellow-700 border-yellow-200" :
                                                        "bg-red-500/15 text-red-700 border-red-200"
                                                    }>
                                                        {t(`status.${d.status}`, d.status)}
                                                    </Badge>
                                                </button>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>

                        {/* ─── QR & Check-in Tab ─── */}
                        <TabsContent value="qr" className="pt-4 space-y-6">
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <QrCode className="w-4 h-4 mr-2" /> {t("tickets.qrAttendance", "QR & Attendance")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">{t("tickets.qrStatus", "QR status")}</Label>
                                            <p className="text-sm font-medium">
                                                {latestQr
                                                    ? `${t(`status.${latestQr.status}`, latestQr.status)}${latestQr.expires_at ? ` · ${t("tickets.qrExpires", "expires")} ${new Date(latestQr.expires_at).toLocaleString()}` : ""}`
                                                    : t("tickets.qrNotIssued", "— not issued —")}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">{t("tickets.checkIn", "Check-in")}</Label>
                                            <p className="text-sm font-medium">
                                                {checkInDone ? t("tickets.checkInDone", "Done") : t("tickets.checkInNotDone", "— not registered —")}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Revocar / Marcar check-in remain inactive for now */}
                                    <div className="flex items-center gap-2 flex-wrap pt-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={!qrResendAvailable || qrResending}
                                            title={qrResendAvailable ? undefined : t("tickets.qrResendOnlyConfirmed", "Available for confirmed or checked-in tickets")}
                                            onClick={handleResendQr}
                                        >
                                            <QrCode className="w-4 h-4 mr-2" /> {qrResending ? t("common.sending", "Sending…") : t("tickets.resendQr", "Resend QR")}
                                        </Button>
                                        <Button variant="outline" size="sm" disabled title={soon}>
                                            <XCircle className="w-4 h-4 mr-2" /> {t("tickets.revokeQr", "Revoke")}
                                        </Button>
                                        <Button size="sm" className="bg-cheese-500 hover:bg-cheese-600 text-black" disabled title={soon}>
                                            <CheckCircle className="w-4 h-4 mr-2" /> {t("tickets.markCheckIn", "Mark check-in")}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ─── Satisfaction Tab ─── */}
                        <TabsContent value="satisfaction" className="pt-4 space-y-6">
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Star className="w-4 h-4 mr-2" /> {t("tickets.thisTicketReview", "This ticket's review")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    {thisReview ? (
                                        <div className="flex items-start gap-4">
                                            <div className={`text-3xl font-bold ${ratingColor(thisReview.rating)}`}>
                                                {thisReview.rating}★
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs text-muted-foreground">{t("tickets.thisVisitRating", "Rating for this visit")}
                                                    {thisReview.answered_at ? ` · ${new Date(thisReview.answered_at).toLocaleDateString()}` : ""}</p>
                                                {thisReview.comment ? (
                                                    <p className="text-sm mt-1">"{thisReview.comment}"</p>
                                                ) : (
                                                    <p className="text-sm mt-1 text-muted-foreground italic">{t("tickets.noComment", "No comment")}</p>
                                                )}
                                            </div>
                                        </div>
                                    ) : ticket?.status === "COMPLETED" ? (
                                        <div className="text-center py-6 space-y-3">
                                            <p className="text-sm text-muted-foreground">
                                                {t("tickets.surveyNotAnswered", "The customer has not answered this visit's survey yet.")}
                                            </p>
                                            <Button size="sm" className="bg-cheese-500 hover:bg-cheese-600 text-black" onClick={handleRequestSurvey} disabled={surveySending}>
                                                <Star className="w-4 h-4 mr-2" /> {surveySending ? t("common.sending", "Sending…") : t("tickets.requestReview", "Request review")}
                                            </Button>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-6">
                                            {t("tickets.surveyPendingComplete", "The satisfaction survey is enabled automatically when the experience is completed.")}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center justify-between">
                                        <span>{t("tickets.clientHistory", "Customer history")}</span>
                                        {avgRating && (
                                            <span className="normal-case font-normal text-xs">
                                                {t("tickets.avgReviews", "average {{avg}}★ · {{n}} reviews", { avg: avgRating, n: answeredHistory.length })}
                                            </span>
                                        )}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    {answeredHistory.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                            {t("tickets.noReviewsYet", "This customer has no answered surveys yet.")}
                                        </p>
                                    ) : (
                                        <div className="space-y-3">
                                            {answeredHistory.map((r) => (
                                                <div key={r.name} className="flex items-start gap-3 text-sm">
                                                    <span className={`font-bold shrink-0 ${ratingColor(r.rating)}`}>{r.rating}★</span>
                                                    <div className="min-w-0">
                                                        <p className="text-xs text-muted-foreground">
                                                            {(r.answered_at || r.sent_at) ? new Date(r.answered_at || r.sent_at).toLocaleDateString() : "—"}
                                                            {" · "}
                                                            <button
                                                                type="button"
                                                                className="hover:text-cheese-600 underline-offset-2 hover:underline font-mono"
                                                                onClick={() => r.ticket && navigate(`/cheese/tickets/${r.ticket}`)}
                                                            >
                                                                {r.ticket}
                                                            </button>
                                                        </p>
                                                        {r.comment && <p className="truncate">"{r.comment}"</p>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right Column - Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">{t("tickets.systemInfo", "System Information")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("tickets.ticketCreated", "Ticket Created")}</Label>
                                <p className="text-sm font-medium">{ticket?.creation ? new Date(ticket.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("tickets.lastModified", "Last Modified")}</Label>
                                <p className="text-sm font-medium">{ticket?.modified ? new Date(ticket.modified).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("tickets.owner", "Owner")}</Label>
                                <p className="text-sm font-medium">{ticket?.owner || "—"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <TicketRooms ticketId={id} isHotel={!!ticket?.check_in_date} />

                    {/* State-dependent ticket actions (new-UI flowbox) */}
                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">{t("tickets.ticketActions", "Ticket actions")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                {actions.primary.map((a) =>
                                    a.disabled
                                        ? renderActionBtn(a, "border-cheese-300")
                                        : (() => {
                                            const Icon = a.icon;
                                            return (
                                                <Button key={a.key} size="sm" className="justify-start w-full bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={a.onClick} disabled={actionBusy}>
                                                    <Icon className="w-4 h-4 mr-2" /> {a.label}
                                                </Button>
                                            );
                                        })()
                                )}
                                {actions.secondary.length > 0 && (
                                    <>
                                        <p className="text-[10px] uppercase font-semibold text-muted-foreground pt-1">{t("tickets.moreActions", "More actions")}</p>
                                        {actions.secondary.map((a) => renderActionBtn(a))}
                                    </>
                                )}
                                {actions.danger.length > 0 && (
                                    <>
                                        <div className="border-t border-border/60 my-1" />
                                        {actions.danger.map((a) => renderActionBtn(a, "text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"))}
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Send reminder as bot through the conversation's channel */}
            <Dialog open={reminderOpen} onOpenChange={(o) => { if (!o) setReminderOpen(false); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Bell className="w-4 h-4 text-cheese-600" /> {t("tickets.sendReminder", "Send reminder")}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                            {t("tickets.reminderHint", "The message is sent by the bot through the customer's conversation channel.")}
                            {reminderConvo?.channel ? ` (${reminderConvo.channel})` : ""}
                        </p>
                        {windowBlocked && (
                            <p className="text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
                                {t("tickets.windowClosed", "The WhatsApp 24-hour window for this customer is closed — the message cannot be sent until the customer writes again.")}
                            </p>
                        )}
                        {reminderWindow?.applicable && reminderWindow?.active && (
                            <p className="text-xs font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2">
                                {t("tickets.windowActive", "WhatsApp 24-hour window active.")}
                            </p>
                        )}
                        <Textarea
                            value={reminderText}
                            onChange={(e) => setReminderText(e.target.value)}
                            placeholder={t("tickets.reminderPlaceholder", "Reminder text for the customer…")}
                            className="min-h-[110px]"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setReminderOpen(false)}>{t("common.cancel", "Cancel")}</Button>
                        <Button
                            className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold"
                            onClick={sendReminder}
                            disabled={reminderSending || windowBlocked || !reminderText.trim()}
                        >
                            <Send className="w-4 h-4 mr-1.5" />
                            {reminderSending ? t("common.sending", "Sending…") : t("common.send", "Send")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DetailPageLayout>
    );
}
