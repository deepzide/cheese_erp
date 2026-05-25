import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, X } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import { experienceService } from "@/api/experienceService";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useTranslation } from "react-i18next";

const parseHours = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

export default function BookingPolicyCreate() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const initialExperience = searchParams.get('experience');
    const [experiences, setExperiences] = useState(
        initialExperience ? [initialExperience] : []
    );
    const [experiencePicker, setExperiencePicker] = useState("");
    const [form, setForm] = useState({
        policy_name: "",
        cancel_until_hours_before: "24",
        modify_until_hours_before: "12",
        min_hours_before_booking: "2",
    });
    const createMutation = useFrappeCreate("Cheese Booking Policy");

    const handleAddExperience = (value) => {
        if (!value) return;
        if (experiences.includes(value)) {
            setExperiencePicker("");
            return;
        }
        setExperiences((prev) => [...prev, value]);
        setExperiencePicker("");
    };

    const handleRemoveExperience = (value) => {
        setExperiences((prev) => prev.filter((exp) => exp !== value));
    };

    const handleSubmit = () => {
        if (experiences.length === 0) {
            toast.error(
                t(
                    "bookingPolicy.atLeastOneExperienceRequired",
                    "Select at least one experience for this policy"
                )
            );
            return;
        }

        const cancel = parseHours(form.cancel_until_hours_before, 24);
        const modify = parseHours(form.modify_until_hours_before, 12);
        const minBook = parseHours(form.min_hours_before_booking, 2);
        const policyName = form.policy_name?.trim() || `Policy for ${experiences.join(", ")}`;

        createMutation.mutate(
            {
                policy_name: policyName,
                cancel_until_hours_before: cancel,
                modify_until_hours_before: modify,
                min_hours_before_booking: minBook,
            },
            {
                onSuccess: async (created) => {
                    const policyId = created?.name || created?.data?.name;
                    if (!policyId) {
                        toast.error(t("bookingPolicy.linkFailed", "Policy created but missing ID"));
                        navigate("/cheese/booking-policy");
                        return;
                    }

                    // Link the same shared policy to every experience the operator
                    // picked. This is the many-to-one model from issue #266 — a
                    // booking policy can govern many experiences at once.
                    const results = await Promise.allSettled(
                        experiences.map((expId) =>
                            experienceService.linkBookingPolicy(expId, policyId)
                        )
                    );

                    const failures = results.filter((r) => r.status === "rejected");
                    if (failures.length === experiences.length) {
                        toast.error(
                            t(
                                "bookingPolicy.linkFailed",
                                "Policy created but failed to link to experiences"
                            )
                        );
                    } else if (failures.length > 0) {
                        toast.warning(
                            t(
                                "bookingPolicy.partialLink",
                                `Policy linked to ${experiences.length - failures.length}/${experiences.length} experiences`
                            )
                        );
                    } else {
                        toast.success(
                            t(
                                "bookingPolicy.createdAndLinked",
                                `Policy created and linked to ${experiences.length} experience(s)`
                            )
                        );
                    }
                    navigate("/cheese/booking-policy");
                },
                onError: (err) =>
                    toast.error(err?.message || t("common.failed", "Failed")),
            }
        );
    };

    return (
        <CreatePageLayout
            title={t("bookingPolicy.newPolicy", "New Booking Policy")}
            description={t(
                "bookingPolicy.newPolicyMultiDescription",
                "Set booking rules for one or more experiences"
            )}
            icon={Shield}
            backPath="/cheese/booking-policy"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("bookingPolicy.createPolicy", "Create Policy")}
        >
            <div className="space-y-5">
                <div className="space-y-2">
                    <Label>
                        {t("bookingPolicy.policyName", "Policy Name")}
                    </Label>
                    <Input
                        value={form.policy_name}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, policy_name: e.target.value }))
                        }
                        placeholder={t(
                            "bookingPolicy.policyNamePlaceholder",
                            "Standard cancellation 24h"
                        )}
                    />
                    <p className="text-xs text-muted-foreground">
                        {t(
                            "bookingPolicy.policyNameHint",
                            "Optional. A descriptive name is auto-generated if left empty."
                        )}
                    </p>
                </div>

                <div className="space-y-2">
                    <Label>
                        {t("bookingPolicy.experiences", "Experiences")}{" "}
                        <span className="text-red-500">*</span>
                    </Label>
                    <FrappeSearchSelect
                        doctype="Cheese Experience"
                        label="name"
                        value={experiencePicker}
                        onChange={handleAddExperience}
                        placeholder={t(
                            "bookingPolicy.addExperiencePlaceholder",
                            "Add an experience..."
                        )}
                        filters={{
                            name: experiences.length > 0 ? ["not in", experiences] : "",
                        }}
                    />
                    <p className="text-xs text-muted-foreground">
                        {t(
                            "bookingPolicy.multiExperienceHint",
                            "Pick every experience this policy should govern. The same policy can be assigned to many experiences."
                        )}
                    </p>
                    {experiences.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            {experiences.map((exp) => (
                                <Badge
                                    key={exp}
                                    variant="secondary"
                                    className="flex items-center gap-1 px-2 py-1"
                                >
                                    <span className="text-xs">{exp}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveExperience(exp)}
                                        className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                                        aria-label={t("common.remove", "Remove")}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="space-y-2">
                        <Label>
                            {t("bookingPolicy.cancelBeforeHours", "Cancel Before (hours)")}
                        </Label>
                        <Input
                            type="number"
                            min="0"
                            value={form.cancel_until_hours_before}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    cancel_until_hours_before: e.target.value,
                                }))
                            }
                        />
                        <p className="text-xs text-muted-foreground">
                            {t(
                                "bookingPolicy.cancelBeforeHint",
                                "Guests can cancel up to this many hours before"
                            )}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>
                            {t("bookingPolicy.modifyBeforeHours", "Modify Before (hours)")}
                        </Label>
                        <Input
                            type="number"
                            min="0"
                            value={form.modify_until_hours_before}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    modify_until_hours_before: e.target.value,
                                }))
                            }
                        />
                        <p className="text-xs text-muted-foreground">
                            {t(
                                "bookingPolicy.modifyBeforeHint",
                                "Guests can modify up to this many hours before"
                            )}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>
                            {t("bookingPolicy.minLeadHours", "Min Booking Lead (hours)")}
                        </Label>
                        <Input
                            type="number"
                            min="0"
                            value={form.min_hours_before_booking}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    min_hours_before_booking: e.target.value,
                                }))
                            }
                        />
                        <p className="text-xs text-muted-foreground">
                            {t(
                                "bookingPolicy.minLeadHoursHint",
                                "Minimum hours in advance to book"
                            )}
                        </p>
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}
