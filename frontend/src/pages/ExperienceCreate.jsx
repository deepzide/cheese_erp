import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Building, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function ExperienceCreate() {
    const navigate = useNavigate();
    const createMutation = useFrappeCreate("Cheese Experience");

    const [form, setForm] = useState({
        experience_type: "ACTIVITY",
        experience_info: "",
        company: "",
        status: "OFFLINE",
        package_mode: "Both",
        // Activity Fields
        individual_price: "",
        route_price: "",
        event_duration_hours: "",
        deposit_ttl_hours: 48,
        // Hotel Fields
        price_per_night: "",
        max_occupancy_per_unit: 2,
        min_nights_stay: 1,
        cancel_days_before: 0,
        modify_days_before: 0,
        refund_policy: "FULL",
        deposit_ttl_days: 2,
        // Shared
        deposit_required: false,
        deposit_type: "Amount",
        deposit_value: "",
    });

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = () => {
        if (!form.experience_info || !form.company) {
            toast.error("Experience name and company are required");
            return;
        }

        const isHotel = form.experience_type === "HOTEL";
        const hours = parseFloat(form.event_duration_hours) || 0;

        const payload = {
            name: form.experience_info,
            experience_info: form.experience_info,
            company: form.company,
            status: form.status,
            experience_type: form.experience_type,
            package_mode: form.package_mode,
            deposit_required: form.deposit_required ? 1 : 0,
            deposit_type: form.deposit_type,
            deposit_value: form.deposit_value ? Number(form.deposit_value) : 0,
        };

        if (isHotel) {
            payload.price_per_night = form.price_per_night ? Number(form.price_per_night) : 0;
            payload.max_occupancy_per_unit = parseInt(form.max_occupancy_per_unit) || 1;
            payload.min_nights_stay = parseInt(form.min_nights_stay) || 1;
            payload.cancel_days_before = parseInt(form.cancel_days_before) || 0;
            payload.modify_days_before = parseInt(form.modify_days_before) || 0;
            payload.refund_policy = form.refund_policy;
            payload.deposit_ttl_days = parseInt(form.deposit_ttl_days) || 1;
        } else {
            payload.individual_price = form.individual_price ? Number(form.individual_price) : 0;
            payload.route_price = form.route_price ? Number(form.route_price) : 0;
            payload.event_duration = hours > 0 ? Math.round(hours * 3600) : 0;
            payload.deposit_ttl_hours = form.deposit_ttl_hours ? Number(form.deposit_ttl_hours) : 48;
        }

        createMutation.mutate(payload, {
            onSuccess: (res) => {
                const responsePayload = res?.message || res;
                const name = responsePayload?.name || responsePayload?.data?.name || undefined;
                toast.success(`${isHotel ? "Hotel" : "Activity"} created successfully`);
                if (name) {
                    navigate(`/cheese/experiences/${name}`);
                } else {
                    navigate("/cheese/experiences");
                }
            },
            onError: (err) => toast.error(err?.message || "Failed to create experience"),
        });
    };

    const isHotel = form.experience_type === "HOTEL";

    return (
        <CreatePageLayout
            title="New Experience"
            description="Create a new activity or hotel property for your routes"
            icon={Sparkles}
            backPath="/cheese/experiences"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={`Create ${isHotel ? "Hotel" : "Experience"}`}
        >
            <div className="space-y-8">
                {/* Type Selection */}
                <div className="space-y-4 bg-muted/30 p-6 rounded-lg border border-border/50">
                    <Label className="text-base font-semibold">Experience Type</Label>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            type="button"
                            onClick={() => handleChange("experience_type", "ACTIVITY")}
                            className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${
                                !isHotel
                                    ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                                    : "border-border hover:border-primary/50 hover:bg-muted"
                            }`}
                        >
                            <MapPin className={`w-8 h-8 mb-3 ${!isHotel ? "text-primary" : "text-muted-foreground"}`} />
                            <span className={`font-semibold ${!isHotel ? "text-foreground" : "text-muted-foreground"}`}>Activity / Tour</span>
                            <span className="text-xs text-muted-foreground text-center mt-2">Guided tours, tastings, and events</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleChange("experience_type", "HOTEL")}
                            className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${
                                isHotel
                                    ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                                    : "border-border hover:border-primary/50 hover:bg-muted"
                            }`}
                        >
                            <Building className={`w-8 h-8 mb-3 ${isHotel ? "text-primary" : "text-muted-foreground"}`} />
                            <span className={`font-semibold ${isHotel ? "text-foreground" : "text-muted-foreground"}`}>Hotel / Lodging</span>
                            <span className="text-xs text-muted-foreground text-center mt-2">Nightly room bookings and accommodations</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{isHotel ? "Hotel Name" : "Experience Name"} <span className="text-red-500">*</span></Label>
                        <Input
                            value={form.experience_info}
                            onChange={(e) => handleChange("experience_info", e.target.value)}
                            placeholder={isHotel ? "e.g. Grand Plaza Resort" : "e.g. Wine Tasting Menu"}
                            className="transition-all focus:ring-primary"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Provider Company <span className="text-red-500">*</span></Label>
                        <FrappeSearchSelect
                            doctype="Company"
                            label="name"
                            value={form.company}
                            onChange={(v) => handleChange("company", v)}
                            placeholder="Select provider company..."
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Status</Label>
                        <select
                            value={form.status}
                            onChange={(e) => handleChange("status", e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all"
                        >
                            <option value="ONLINE">ONLINE</option>
                            <option value="OFFLINE">OFFLINE</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Package Mode</Label>
                        <select
                            value={form.package_mode}
                            onChange={(e) => handleChange("package_mode", e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all"
                        >
                            <option value="Establishment">A La Carte (Standalone)</option>
                            <option value="Route">Route Package Only</option>
                            <option value="Both">Both Available</option>
                        </select>
                    </div>
                </div>

                <hr className="border-border/50" />

                {/* Type-Specific Fields */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-medium">{isHotel ? "Hotel Settings" : "Activity Details"}</h3>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{isHotel ? "Nightly" : "Per Event"}</Badge>
                    </div>

                    {isHotel ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-2">
                                <Label>Price per Night ($)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.price_per_night}
                                    onChange={(e) => handleChange("price_per_night", e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Max Occupancy / Room</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={form.max_occupancy_per_unit}
                                    onChange={(e) => handleChange("max_occupancy_per_unit", e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Min Nights Stay</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={form.min_nights_stay}
                                    onChange={(e) => handleChange("min_nights_stay", e.target.value)}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-2">
                                <Label>Individual Price ($)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.individual_price}
                                    onChange={(e) => handleChange("individual_price", e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Route Add-on Price ($)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.route_price}
                                    onChange={(e) => handleChange("route_price", e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Duration (Hours)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.25"
                                    value={form.event_duration_hours}
                                    onChange={(e) => handleChange("event_duration_hours", e.target.value)}
                                    placeholder="e.g. 1.5"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <hr className="border-border/50" />

                {/* Policies & Deposits */}
                <div className="space-y-6">
                    <h3 className="text-lg font-medium">Policies & Deposits</h3>
                    
                    {isHotel && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 animate-in fade-in">
                            <div className="space-y-2">
                                <Label>Cancel Deadline (Days)</Label>
                                <Input type="number" min="0" value={form.cancel_days_before} onChange={(e) => handleChange("cancel_days_before", e.target.value)} />
                                <p className="text-[10px] text-muted-foreground">Days before check-in</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Modify Deadline (Days)</Label>
                                <Input type="number" min="0" value={form.modify_days_before} onChange={(e) => handleChange("modify_days_before", e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Refund Policy</Label>
                                <select
                                    value={form.refund_policy}
                                    onChange={(e) => handleChange("refund_policy", e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all"
                                >
                                    <option value="FULL">FULL (100% Refundable)</option>
                                    <option value="PARTIAL">PARTIAL</option>
                                    <option value="NONE">NONE (Non-Refundable)</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <div className="p-5 bg-muted/20 border border-border/60 rounded-lg space-y-5">
                        <div className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                id="depositReq"
                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                checked={form.deposit_required}
                                onChange={(e) => handleChange("deposit_required", e.target.checked)}
                            />
                            <Label htmlFor="depositReq" className="text-base cursor-pointer">Require Deposit (Standalone Bookings)</Label>
                        </div>
                        
                        {form.deposit_required && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 animate-in fade-in zoom-in-95 duration-200 pt-2 border-t border-border/50">
                                <div className="space-y-2">
                                    <Label>Deposit Type</Label>
                                    <select
                                        value={form.deposit_type}
                                        onChange={(e) => handleChange("deposit_type", e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                        <option value="Amount">Fixed Amount ($)</option>
                                        <option value="%">Percentage (%)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Deposit Value</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.deposit_value}
                                        onChange={(e) => handleChange("deposit_value", e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Deposit TTL ({isHotel ? "Days" : "Hours"})</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={isHotel ? form.deposit_ttl_days : form.deposit_ttl_hours}
                                        onChange={(e) => handleChange(isHotel ? "deposit_ttl_days" : "deposit_ttl_hours", e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">Time to pay before auto-cancel</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}

