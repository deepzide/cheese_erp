import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { toast } from "sonner";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useFrappeDoc } from "@/lib/useApiData";
import { apiRequest } from "@/api/client";

export default function DepositCreate() {
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const ticketId = searchParams.get("ticket") || "";
    const bookingId = searchParams.get("booking") || "";
    const fromReservation = searchParams.get("from") === "reservation";
    const defaultEntityType = ticketId ? "Cheese Ticket" : (bookingId ? "Cheese Route Booking" : "");

    // Back path: if came from a hotel reservation ticket, return there
    const backPath = ticketId && fromReservation
        ? `/cheese/hotels/reservations/${ticketId}`
        : ticketId
            ? `/cheese/tickets/${ticketId}`
            : bookingId
                ? `/cheese/bookings/${bookingId}`
                : "/cheese/deposits";

    const [form, setForm] = useState({
        contact: "",
        entity_type: defaultEntityType,
        entity_id: ticketId || bookingId || "",
        amount_required: "",
        payment_amount: "",
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        bank_account: "",
    });

    const [submitting, setSubmitting] = useState(false);
    const [bankAccounts, setBankAccounts] = useState([]);

    const { data: ticket, isLoading: ticketLoading } = useFrappeDoc("Cheese Ticket", form.entity_type === "Cheese Ticket" ? form.entity_id : "", {
        enabled: form.entity_type === "Cheese Ticket" && !!form.entity_id,
    });
    const { data: booking, isLoading: bookingLoading } = useFrappeDoc("Cheese Route Booking", form.entity_type === "Cheese Route Booking" ? form.entity_id : "", {
        enabled: form.entity_type === "Cheese Route Booking" && !!form.entity_id,
    });
    const isLoading = ticketLoading || bookingLoading;

    const { data: prefilledTicket } = useFrappeDoc("Cheese Ticket", ticketId, {
        enabled: !!ticketId,
    });

    useEffect(() => {
        if (prefilledTicket?.contact) {
            setForm((prev) => ({ ...prev, contact: prefilledTicket.contact }));
        }
    }, [prefilledTicket]);

    useEffect(() => {
        const loadInstructions = async () => {
            if (form.entity_type !== "Cheese Ticket" || !form.entity_id) {
                setBankAccounts([]);
                return;
            }
            try {
                const res = await apiRequest(`/api/method/cheese.api.v1.deposit_controller.get_deposit_instructions?ticket_id=${encodeURIComponent(form.entity_id)}`);
                const payload = res?.data?.message || res?.data || res;
                const data = payload?.data || {};
                const accounts = Array.isArray(data.bank_account) ? data.bank_account : [];
                setBankAccounts(accounts);
                if (!form.bank_account && accounts.length > 0 && accounts[0].bank_account_id) {
                    setForm((prev) => ({ ...prev, bank_account: accounts[0].bank_account_id }));
                }
            } catch {
                setBankAccounts([]);
            }
        };
        loadInstructions();
    }, [form.entity_type, form.entity_id]);

    useEffect(() => {
        if (form.entity_type === "Cheese Ticket" && ticket) {
            const depositAmt = ticket.deposit_amount ?? 0;
            // If no advance deposit is configured, prefill amount_required with total_price
            // so the user can directly log the full payment
            const required = depositAmt > 0 ? depositAmt : (ticket.total_price ?? 0);
            setForm((prev) => ({
                ...prev,
                contact: ticket.contact || prev.contact,
                amount_required: required > 0 ? String(required) : prev.amount_required,
                payment_amount: prev.payment_amount || (required > 0 ? String(required) : ""),
            }));
        }
        if (form.entity_type === "Cheese Route Booking" && booking) {
            setForm((prev) => ({
                ...prev,
                contact: booking.contact || prev.contact,
                amount_required: booking.deposit_amount != null ? String(booking.deposit_amount) : prev.amount_required,
                payment_amount: prev.payment_amount || "",
            }));
        }
    }, [form.entity_type, ticket, booking]);

    const handleSubmit = async () => {
        if (!form.entity_type || !form.entity_id) {
            toast.error(t("deposits.selectReservationTicket", "Select a reservation or ticket"));
            return;
        }
        if (!form.payment_amount || Number(form.payment_amount) <= 0) {
            toast.error(t("deposits.amountGreaterThanZero", "Payment amount must be greater than 0"));
            return;
        }
        if (!form.bank_account) {
            toast.error(t("deposits.bankAccountRequired", "Bank account is required for manual deposits"));
            return;
        }
        setSubmitting(true);
        try {
            const res = await apiRequest("/api/method/cheese.api.v1.deposit_controller.record_deposit_payment", {
                method: "POST",
                body: JSON.stringify({
                    ticket_id: form.entity_id,
                    amount: Number(form.payment_amount),
                    verification_method: "Manual",
                    bank_account: form.bank_account,
                }),
            });
            const payload = res?.data?.message || res?.data || res;
            if (payload?.success === false) {
                throw new Error(payload?.error?.message || payload?.message || t("deposits.recordFailed", "Failed to record deposit payment"));
            }
            toast.success(t("deposits.recordSuccess", "Deposit payment recorded"));
            queryClient.invalidateQueries();
            // Navigate back to the origin
            navigate(backPath);
        } catch (err) {
            toast.error(err?.message || t("deposits.recordFailed", "Failed to record deposit payment"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <CreatePageLayout
            title={t("deposits.registerPayment", "Registrar Pago")}
            description={t("deposits.registerPaymentDesc", "Registra un pago parcial o total contra el ticket o reserva seleccionado.")}
            icon={DollarSign}
            backPath={backPath}
            onSubmit={handleSubmit}
            isSubmitting={submitting}
            submitLabel={t("deposits.registerPayment", "Registrar Pago")}
            isLoading={isLoading}
        >
            <div className="space-y-5">
                <p className="text-xs text-muted-foreground">
                    {t("deposits.registerPaymentHelp", "This form records partial/full payments against the existing active deposit for the selected ticket/reservation.")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{t("nav.contacts", "Contact")}</p>
                        <FrappeSearchSelect
                            doctype="Cheese Contact"
                            label="full_name"
                            value={form.contact}
                            onChange={(v) => setForm((prev) => ({ ...prev, contact: v, entity_id: "" }))}
                            placeholder={t("tickets.selectContact", "Select contact...")}
                            disabled={!!ticketId}
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{t("common.type", "Type")}</p>
                        <select
                            value={form.entity_type}
                            onChange={(e) => setForm((prev) => ({ ...prev, entity_type: e.target.value, entity_id: "" }))}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                        >
                            <option value="">{t("common.selectType", "Select type...")}</option>
                            <option value="Cheese Ticket">{t("nav.tickets", "Ticket")}</option>
                            <option value="Cheese Route Booking">{t("tickets.reservation", "Reservation")}</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{t("deposits.ticketOrReservation", "Ticket / Reservation")}</p>
                        {form.entity_type === "Cheese Ticket" ? (
                            <FrappeSearchSelect
                                doctype="Cheese Ticket"
                                label="name"
                                value={form.entity_id}
                                onChange={(v) => setForm((prev) => ({ ...prev, entity_id: v }))}
                                filters={{ contact: form.contact }}
                                placeholder={form.contact ? t("tickets.selectTicket", "Select ticket...") : t("deposits.selectContactFirst", "Select contact first...")}
                                disabled={!form.contact}
                            />
                        ) : form.entity_type === "Cheese Route Booking" ? (
                            <FrappeSearchSelect
                                doctype="Cheese Route Booking"
                                label="name"
                                value={form.entity_id}
                                onChange={(v) => setForm((prev) => ({ ...prev, entity_id: v }))}
                                filters={{ contact: form.contact }}
                                placeholder={form.contact ? t("bookings.selectReservation", "Select reservation...") : t("deposits.selectContactFirst", "Select contact first...")}
                                disabled={!form.contact}
                            />
                        ) : (
                            <input
                                disabled
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                placeholder={t("common.selectTypeFirst", "Select type first...")}
                            />
                        )}
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{t("deposits.amountRequired", "Amount Required")}</p>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.amount_required}
                            onChange={(e) => setForm((prev) => ({ ...prev, amount_required: e.target.value }))}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                            disabled
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{t("deposits.paymentAmount", "Payment Amount")}</p>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.payment_amount}
                            onChange={(e) => setForm((prev) => ({ ...prev, payment_amount: e.target.value }))}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{t("deposits.dueAt", "Due At")}</p>
                        <input
                            type="datetime-local"
                            value={form.due_at}
                            onChange={(e) => setForm((prev) => ({ ...prev, due_at: e.target.value }))}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{t("deposits.bankAccount", "Bank Account")}</p>
                        <FrappeSearchSelect
                            doctype="Cheese Bank Account"
                            label="title"
                            value={form.bank_account || ""}
                            onChange={(v) => setForm((prev) => ({ ...prev, bank_account: v }))}
                            filters={
                                form.entity_type === "Cheese Route Booking" && booking?.route
                                    ? { entity_type: "Cheese Route", entity_id: booking.route }
                                    : form.entity_type === "Cheese Ticket" && ticket?.company
                                        ? { entity_type: "Company", entity_id: ticket.company }
                                        : bankAccounts.length > 0
                                            ? { name: ["in", bankAccounts.map((a) => a.bank_account_id).filter(Boolean)] }
                                            : {}
                            }
                            placeholder={t("deposits.selectBankAccount", "Select bank account...")}
                            disabled={form.entity_type === "Cheese Route Booking" && !booking?.route}
                        />
                    </div>
                </div>
                <div className="text-xs text-muted-foreground">
                    {form.entity_type && form.entity_id && (
                        <p>
                            {t("deposits.linkedTo", "Linked to:")} <span className="font-mono">{form.entity_id}</span>
                        </p>
                    )}
                </div>
            </div>
        </CreatePageLayout>
    );
}

