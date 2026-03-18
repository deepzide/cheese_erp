import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ExperienceCreate() {
    const navigate = useNavigate();
    const createMutation = useFrappeCreate("Cheese Experience");

    const [form, setForm] = useState({
        experience_info: "",
        company: "",
        status: "OFFLINE",
        individual_price: "",
        route_price: "",
        event_duration_hours: "",
        deposit_required: false,
        deposit_type: "Amount",
        deposit_value: "",
        deposit_ttl_hours: 48,
    });

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = () => {
        if (!form.experience_info || !form.company) {
            toast.error("Experience name and company are required");
            return;
        }

        const hours = parseFloat(form.event_duration_hours) || 0;

        createMutation.mutate(
            {
                // Use experience name as document name for Frappe's prompt autoname
                name: form.experience_info,
                experience_info: form.experience_info,
                company: form.company,
                status: form.status,
                individual_price: form.individual_price
                    ? Number(form.individual_price)
                    : 0,
                route_price: form.route_price ? Number(form.route_price) : 0,
                event_duration: hours > 0 ? Math.round(hours * 3600) : 0,
                deposit_required: form.deposit_required ? 1 : 0,
                deposit_type: form.deposit_type,
                deposit_value: form.deposit_value
                    ? Number(form.deposit_value)
                    : 0,
                deposit_ttl_hours: form.deposit_ttl_hours
                    ? Number(form.deposit_ttl_hours)
                    : 48,
            },
            {
                onSuccess: (res) => {
                    const payload = res?.message || res;
                    const name =
                        payload?.name || payload?.data?.name || undefined;
                    toast.success("Experience created");
                    if (name) {
                        navigate(`/cheese/experiences/${name}`);
                    } else {
                        navigate("/cheese/experiences");
                    }
                },
                onError: (err) =>
                    toast.error(err?.message || "Failed to create experience"),
            }
        );
    };

    return (
        <CreatePageLayout
            title="New Experience"
            description="Create a new experience/activity for your routes"
            icon={Sparkles}
            backPath="/cheese/experiences"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Experience"
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Experience Name</Label>
                        <Input
                            value={form.experience_info}
                            onChange={(e) =>
                                handleChange("experience_info", e.target.value)
                            }
                            placeholder="e.g. Tasting Menu"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Company</Label>
                        <FrappeSearchSelect
                            doctype="Company"
                            label="name"
                            value={form.company}
                            onChange={(v) => handleChange("company", v)}
                            placeholder="Select provider company..."
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="space-y-2">
                        <Label>Status</Label>
                        <select
                            value={form.status}
                            onChange={(e) =>
                                handleChange("status", e.target.value)
                            }
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            <option value="ONLINE">ONLINE</option>
                            <option value="OFFLINE">OFFLINE</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Event Duration (Hours)</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.25"
                            value={form.event_duration_hours}
                            onChange={(e) =>
                                handleChange(
                                    "event_duration_hours",
                                    e.target.value
                                )
                            }
                            placeholder="e.g. 1.5"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Individual Price ($)</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.individual_price}
                            onChange={(e) =>
                                handleChange(
                                    "individual_price",
                                    e.target.value
                                )
                            }
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="space-y-2">
                        <Label>Route Price ($)</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.route_price}
                            onChange={(e) =>
                                handleChange("route_price", e.target.value)
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="rounded border-input"
                                checked={form.deposit_required}
                                onChange={(e) =>
                                    handleChange(
                                        "deposit_required",
                                        e.target.checked
                                    )
                                }
                            />
                            <span>Deposit Required (standalone bookings)</span>
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            If enabled, guests must pay a deposit for this
                            experience.
                        </p>
                    </div>
                    {form.deposit_required && (
                        <div className="space-y-2">
                            <Label>Deposit Type</Label>
                            <select
                                value={form.deposit_type}
                                onChange={(e) =>
                                    handleChange(
                                        "deposit_type",
                                        e.target.value
                                    )
                                }
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                <option value="Amount">Fixed Amount ($)</option>
                                <option value="%">Percentage (%)</option>
                            </select>
                        </div>
                    )}
                </div>

                {form.deposit_required && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <Label>Deposit Value</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.deposit_value}
                                onChange={(e) =>
                                    handleChange(
                                        "deposit_value",
                                        e.target.value
                                    )
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Deposit TTL (Hours)</Label>
                            <Input
                                type="number"
                                min="1"
                                step="1"
                                value={form.deposit_ttl_hours}
                                onChange={(e) =>
                                    handleChange(
                                        "deposit_ttl_hours",
                                        e.target.value
                                    )
                                }
                            />
                        </div>
                    </div>
                )}
            </div>
        </CreatePageLayout>
    );
}

