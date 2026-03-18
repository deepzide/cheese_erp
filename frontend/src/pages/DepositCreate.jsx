import React, { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { DollarSign } from "lucide-react";
import { toast } from "sonner";
import CreatePageLayout from "@/components/CreatePageLayout";
import { useFrappeDoc } from "@/lib/useApiData";
import { apiRequest } from "@/api/client";

export default function DepositCreate() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const ticketId = searchParams.get("ticket") || "";

    const { data: ticket, isLoading } = useFrappeDoc("Cheese Ticket", ticketId, {
        enabled: !!ticketId,
    });

    const [amount, setAmount] = useState("");
    const [depositInfo, setDepositInfo] = useState(null);

    const baseInfo = useMemo(
        () => ({
            contact: ticket?.contact || "",
            experience: ticket?.experience || "",
            deposit_required: ticket?.deposit_required,
            deposit_amount: ticket?.deposit_amount,
        }),
        [ticket]
    );

    const loadDeposit = async () => {
        try {
            const res = await apiRequest(
                "/api/method/cheese.api.v1.deposit_controller.get_deposit_instructions",
                {
                method: "POST",
                body: JSON.stringify({ ticket_id: ticketId }),
                }
            );
            const payload = res?.data?.message || res?.data || res;
            const data = payload?.data || payload;
            setDepositInfo(data);
            if (data?.amount_remaining != null) {
                setAmount(String(data.amount_remaining));
            }
        } catch (err) {
            toast.error(err?.message || "Failed to load deposit information");
        }
    };

    const handleSubmit = async () => {
        if (!ticketId) {
            toast.error("Missing ticket ID");
            return;
        }
        if (!amount || Number(amount) <= 0) {
            toast.error("Amount must be greater than 0");
            return;
        }

        try {
            // Ensure we have a deposit created
            if (!depositInfo) {
                await loadDeposit();
            }

            await apiRequest(
                "/api/method/cheese.api.v1.deposit_controller.record_deposit_payment",
                {
                method: "POST",
                body: JSON.stringify({
                    ticket_id: ticketId,
                    amount: Number(amount),
                    verification_method: "Manual",
                }),
                }
            );

            toast.success("Deposit payment recorded");
            navigate(`/cheese/deposits`);
        } catch (err) {
            toast.error(err?.message || "Failed to record deposit payment");
        }
    };

    return (
        <CreatePageLayout
            title="Register Deposit Payment"
            description={
                ticketId
                    ? `Record a deposit payment for ticket ${ticketId}`
                    : "Missing ticket ID in URL"
            }
            icon={DollarSign}
            backPath={ticketId ? `/cheese/tickets/${ticketId}` : "/cheese/tickets"}
            onSubmit={handleSubmit}
            isSubmitting={false}
            submitLabel="Record Payment"
            isLoading={isLoading && !!ticketId}
        >
            {ticketId ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Ticket</p>
                            <p className="text-sm font-mono">{ticketId}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Experience</p>
                            <p className="text-sm font-medium">
                                {baseInfo.experience || "—"}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Deposit Required</p>
                            <p className="text-sm font-medium">
                                {baseInfo.deposit_required ? "Yes" : "No"}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Configured Amount</p>
                            <p className="text-sm font-medium">
                                {baseInfo.deposit_amount != null
                                    ? `${baseInfo.deposit_amount}`
                                    : "—"}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={loadDeposit}
                        className="text-xs text-left px-3 py-2 rounded-md border border-dashed border-border hover:bg-muted/40 transition-colors"
                    >
                        Load deposit details
                    </button>

                    {depositInfo && (
                        <div className="text-xs text-muted-foreground space-y-1">
                            <p>Deposit ID: {depositInfo.deposit_id}</p>
                            <p>
                                Required: {depositInfo.amount_required} • Paid:{" "}
                                {depositInfo.amount_paid} • Remaining:{" "}
                                {depositInfo.amount_remaining}
                            </p>
                            <p>Status: {depositInfo.status}</p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">
                            Payment Amount
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <p className="text-[11px] text-muted-foreground">
                            You can record partial payments; the backend enforces that the total
                            paid cannot exceed the required amount.
                        </p>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-red-500">
                    No ticket specified. Please go back to the ticket and use
                    \"Register Deposit\" again.
                </p>
            )}
        </CreatePageLayout>
    );
}

