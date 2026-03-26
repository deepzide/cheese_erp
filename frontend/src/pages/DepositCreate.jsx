import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { DollarSign } from "lucide-react";
import { toast } from "sonner";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useFrappeCreate, useFrappeDoc } from "@/lib/useApiData";

export default function DepositCreate() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const ticketId = searchParams.get("ticket") || "";
    const bookingId = searchParams.get("booking") || "";
    const defaultEntityType = ticketId ? "Cheese Ticket" : (bookingId ? "Cheese Route Booking" : "");

    const [form, setForm] = useState({
        contact: "",
        entity_type: defaultEntityType,
        entity_id: ticketId || bookingId || "",
        amount_required: "",
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    });

    const createMutation = useFrappeCreate("Cheese Deposit");

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
        if (form.entity_type === "Cheese Ticket" && ticket) {
            setForm((prev) => ({
                ...prev,
                contact: ticket.contact || prev.contact,
                amount_required: ticket.deposit_amount != null ? String(ticket.deposit_amount) : prev.amount_required,
            }));
        }
        if (form.entity_type === "Cheese Route Booking" && booking) {
            setForm((prev) => ({
                ...prev,
                contact: booking.contact || prev.contact,
                amount_required: booking.deposit_amount != null ? String(booking.deposit_amount) : prev.amount_required,
            }));
        }
    }, [form.entity_type, ticket, booking]);

    const handleSubmit = () => {
        if (!form.entity_type || !form.entity_id) {
            toast.error("Select a reservation or ticket");
            return;
        }
        if (!form.amount_required || Number(form.amount_required) <= 0) {
            toast.error("Amount required must be greater than 0");
            return;
        }

        createMutation.mutate({
            entity_type: form.entity_type,
            entity_id: form.entity_id,
            amount_required: Number(form.amount_required),
            amount_paid: 0,
            status: "PENDING",
            due_at: form.due_at || undefined,
        }, {
            onSuccess: () => {
                toast.success("Deposit created");
                navigate(`/cheese/deposits`);
            },
            onError: (err) => toast.error(err?.message || "Failed to create deposit"),
        });
    };

    return (
        <CreatePageLayout
            title="Create Deposit"
            description={
                "Create a new deposit linked to a ticket or reservation."
            }
            icon={DollarSign}
            backPath="/cheese/deposits"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Deposit"
            isLoading={isLoading}
        >
            <div className="space-y-5">
                <p className="text-xs text-muted-foreground">
                    Deposits are created here only. Payment registration/modification/cancellation is not available from Deposits.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Contact</p>
                        <FrappeSearchSelect
                            doctype="Cheese Contact"
                            label="full_name"
                            value={form.contact}
                            onChange={(v) => setForm((prev) => ({ ...prev, contact: v, entity_id: "" }))}
                            placeholder="Select contact..."
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Type</p>
                        <select
                            value={form.entity_type}
                            onChange={(e) => setForm((prev) => ({ ...prev, entity_type: e.target.value, entity_id: "" }))}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                        >
                            <option value="">Select type...</option>
                            <option value="Cheese Ticket">Ticket</option>
                            <option value="Cheese Route Booking">Reservation</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Ticket / Reservation</p>
                        {form.entity_type === "Cheese Ticket" ? (
                            <FrappeSearchSelect
                                doctype="Cheese Ticket"
                                label="name"
                                value={form.entity_id}
                                onChange={(v) => setForm((prev) => ({ ...prev, entity_id: v }))}
                                filters={{ contact: form.contact }}
                                placeholder={form.contact ? "Select ticket..." : "Select contact first..."}
                                disabled={!form.contact}
                            />
                        ) : form.entity_type === "Cheese Route Booking" ? (
                            <FrappeSearchSelect
                                doctype="Cheese Route Booking"
                                label="name"
                                value={form.entity_id}
                                onChange={(v) => setForm((prev) => ({ ...prev, entity_id: v }))}
                                filters={{ contact: form.contact }}
                                placeholder={form.contact ? "Select reservation..." : "Select contact first..."}
                                disabled={!form.contact}
                            />
                        ) : (
                            <input
                                disabled
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                placeholder="Select type first..."
                            />
                        )}
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Amount Required</p>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.amount_required}
                            onChange={(e) => setForm((prev) => ({ ...prev, amount_required: e.target.value }))}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Due At</p>
                        <input
                            type="datetime-local"
                            value={form.due_at}
                            onChange={(e) => setForm((prev) => ({ ...prev, due_at: e.target.value }))}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Bank Account (for route deposits)</p>
                        <FrappeSearchSelect
                            doctype="Cheese Bank Account"
                            label="holder"
                            value={form.bank_account || ""}
                            onChange={(v) => setForm((prev) => ({ ...prev, bank_account: v }))}
                            placeholder="Select bank account..."
                        />
                    </div>
                </div>
                <div className="text-xs text-muted-foreground">
                    {form.entity_type && form.entity_id && (
                        <p>
                            Linked to: <span className="font-mono">{form.entity_id}</span>
                        </p>
                    )}
                </div>
            </div>
        </CreatePageLayout>
    );
}

