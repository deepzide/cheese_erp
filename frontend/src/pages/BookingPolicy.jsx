import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Search, AlertCircle, RefreshCw, Loader2, Plus, Clock, MoreHorizontal, Sparkles, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useFrappeList, useFrappeCreate } from "@/lib/useApiData";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
import { apiRequest } from "@/api/client";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { experienceService } from "@/api/experienceService";
import { useTranslation } from "react-i18next";

const parseHours = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

export default function BookingPolicy() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const experienceFilter = searchParams.get("experience") || "";
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [editPolicy, setEditPolicy] = useState(null);
    const [form, setForm] = useState({ experience: searchParams.get('experience') || "", cancel_until_hours_before: "24", modify_until_hours_before: "12", min_hours_before_booking: "2" });
    const [editForm, setEditForm] = useState({ cancel_until_hours_before: "24", modify_until_hours_before: "12", min_hours_before_booking: "2" });
    // Multi-experience linking from the edit dialog (issue #266). We hold the
    // current set of experiences governed by the policy plus a picker for adding
    // new ones; on save we diff against the original list and link/unlink as needed.
    const [linkedExperiences, setLinkedExperiences] = useState([]);
    const [linkedExperiencesOriginal, setLinkedExperiencesOriginal] = useState([]);
    const [experiencePicker, setExperiencePicker] = useState("");
    const [savingLinks, setSavingLinks] = useState(false);

    const { activeEstablishment } = useActiveEstablishment();
    const { data: policies = [], isLoading, error, refetch } = useFrappeList("Cheese Booking Policy", {
        filters: activeEstablishment ? { company: activeEstablishment } : {},
        fields: ["name", "experience", "cancel_until_hours_before", "modify_until_hours_before", "min_hours_before_booking", "creation", "modified"],
        pageSize: 100,
    });

    // Resolve policy -> experiences from the canonical relationship on Cheese Experience.
    // Some older policies have an empty legacy `policy.experience` field even though
    // experiences are linked via `experience.booking_policy`.
    const { data: policyExperienceLinks = [] } = useFrappeList("Cheese Experience", {
        fields: ["name", "booking_policy"],
        filters: {
            booking_policy: ["is", "set"],
        },
        pageSize: 500,
    });

    const { data: linkedExperiencesData = [] } = useFrappeList("Cheese Experience", {
        fields: ["name", "booking_policy"],
        filters: editPolicy?.name ? { booking_policy: editPolicy.name } : undefined,
        pageSize: 200,
        enabled: !!editPolicy?.name,
    });

    useEffect(() => {
        if (!editPolicy?.name) {
            setLinkedExperiences([]);
            setLinkedExperiencesOriginal([]);
            return;
        }
        const names = (Array.isArray(linkedExperiencesData) ? linkedExperiencesData : [])
            .map((row) => row.name)
            .filter(Boolean);
        // Keep the legacy 1-to-1 experience field as a fallback so older policies
        // that haven't been re-linked yet still surface their experience here.
        if (editPolicy.experience && !names.includes(editPolicy.experience)) {
            names.unshift(editPolicy.experience);
        }
        setLinkedExperiences(names);
        setLinkedExperiencesOriginal(names);
    }, [editPolicy?.name, editPolicy?.experience, linkedExperiencesData]);

    const createMutation = useFrappeCreate("Cheese Booking Policy");

    const policyExperienceMap = React.useMemo(() => {
        const map = new Map();
        (Array.isArray(policyExperienceLinks) ? policyExperienceLinks : []).forEach((row) => {
            const policyName = row?.booking_policy;
            const experienceName = row?.name;
            if (!policyName || !experienceName) return;
            const prev = map.get(policyName) || [];
            if (!prev.includes(experienceName)) prev.push(experienceName);
            map.set(policyName, prev);
        });
        return map;
    }, [policyExperienceLinks]);

    const getPolicyExperiences = (policy) => {
        const linked = policyExperienceMap.get(policy?.name) || [];
        if (linked.length > 0) return linked;
        return policy?.experience ? [policy.experience] : [];
    };

    const filtered = (Array.isArray(policies) ? policies : []).filter(p => {
        const experienceNames = getPolicyExperiences(p);
        if (experienceFilter && !experienceNames.includes(experienceFilter)) return false;
        if (searchTerm) {
            const haystack = `${p.name || ""} ${experienceNames.join(" ")}`.toLowerCase();
            return haystack.includes(searchTerm.toLowerCase());
        }
        return true;
    });

    const handleCreate = () => {
        if (!form.experience) { toast.error(t("bookingPolicy.experienceRequired", "Experience is required")); return; }
        createMutation.mutate({
            experience: form.experience,
            cancel_until_hours_before: parseHours(form.cancel_until_hours_before, 24),
            modify_until_hours_before: parseHours(form.modify_until_hours_before, 12),
            min_hours_before_booking: parseHours(form.min_hours_before_booking, 2),
        }, {
            onSuccess: () => { setCreateOpen(false); toast.success(t("bookingPolicy.created", "Policy created")); },
            onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
        });
    };

    const openEdit = (policy) => {
        setEditPolicy(policy);
        setEditForm({
            cancel_until_hours_before: String(policy.cancel_until_hours_before ?? 24),
            modify_until_hours_before: String(policy.modify_until_hours_before ?? 12),
            min_hours_before_booking: String(policy.min_hours_before_booking ?? 2),
        });
    };

    const handleAddLinkedExperience = (value) => {
        if (!value) return;
        if (linkedExperiences.includes(value)) {
            setExperiencePicker("");
            return;
        }
        setLinkedExperiences((prev) => [...prev, value]);
        setExperiencePicker("");
    };

    const handleRemoveLinkedExperience = (value) => {
        setLinkedExperiences((prev) => prev.filter((exp) => exp !== value));
    };

    const persistLinkedExperiences = async () => {
        if (!editPolicy?.name) return;
        const added = linkedExperiences.filter((exp) => !linkedExperiencesOriginal.includes(exp));
        const removed = linkedExperiencesOriginal.filter((exp) => !linkedExperiences.includes(exp));

        const linkOps = added.map((exp) =>
            experienceService.linkBookingPolicy(exp, editPolicy.name)
        );
        const unlinkOps = removed.map((exp) =>
            apiRequest("/api/method/frappe.client.set_value", {
                method: "POST",
                body: JSON.stringify({
                    doctype: "Cheese Experience",
                    name: exp,
                    fieldname: "booking_policy",
                    value: "",
                }),
            })
        );

        const results = await Promise.allSettled([...linkOps, ...unlinkOps]);
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
            throw new Error(
                t(
                    "bookingPolicy.linkFailed",
                    `Some experiences could not be (un)linked (${failed} failures)`
                )
            );
        }
    };

    const handleEditSave = async () => {
        if (!editPolicy?.name) return;
        setSavingLinks(true);
        try {
            // Use the policy's first remaining experience for the time update.
            // The shared policy itself owns the time values; the legacy
            // update_booking_policy endpoint needs *some* experience to scope by.
            const scopeExperience =
                linkedExperiences[0] || editPolicy.experience || null;

            if (scopeExperience) {
                await apiRequest(
                    "/api/method/cheese.api.v1.experience_controller.update_booking_policy",
                    {
                        method: "POST",
                        body: JSON.stringify({
                            experience_id: scopeExperience,
                            cancel_until_hours_before: parseHours(
                                editForm.cancel_until_hours_before,
                                24
                            ),
                            modify_until_hours_before: parseHours(
                                editForm.modify_until_hours_before,
                                12
                            ),
                            min_hours_before_booking: parseHours(
                                editForm.min_hours_before_booking,
                                2
                            ),
                        }),
                    }
                );
            } else {
                // No scope experience — write directly to the policy doc.
                await apiRequest(`/api/resource/Cheese Booking Policy/${editPolicy.name}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        cancel_until_hours_before: parseHours(
                            editForm.cancel_until_hours_before,
                            24
                        ),
                        modify_until_hours_before: parseHours(
                            editForm.modify_until_hours_before,
                            12
                        ),
                        min_hours_before_booking: parseHours(
                            editForm.min_hours_before_booking,
                            2
                        ),
                    }),
                });
            }

            await persistLinkedExperiences();

            toast.success(t("common.saved", "Policy updated"));
            setEditPolicy(null);
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failedToUpdate", "Failed to update"));
        } finally {
            setSavingLinks(false);
        }
    };

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("bookings.loadFailed", "Failed to load booking policies")}</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="w-6 h-6 text-cheese-600" /> {t("nav.bookingPolicy", "Booking Policies")}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} ${t("bookingPolicy.items", "policies")}`}</p>
                    {experienceFilter && (
                        <p className="text-xs text-muted-foreground mt-1">{t("common.filteredBy", "Filtered by")} {t("nav.experiences", "Experience")}: {experienceFilter}</p>
                    )}
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t("common.search", "Search") + "..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button
                        className="cheese-gradient text-black font-semibold border-0 h-9"
                        onClick={() => window.location.assign("/cheese/booking-policy/new")}
                    >
                        <Plus className="w-4 h-4 mr-1" /> {t("bookingPolicy.new", "New Policy")}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading ? Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-5 space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /></CardContent></Card>
                )) : filtered.map((policy) => (
                    <motion.div key={policy.name} whileHover={{ y: -3 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-5">
                                {(() => {
                                    const displayExperiences = getPolicyExperiences(policy);
                                    const displayExperienceLabel = displayExperiences.length > 0 ? displayExperiences.join(", ") : "—";
                                    const primaryExperience = displayExperiences[0] || "";
                                    return (
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold text-foreground">{policy.name}</h3>
                                        <span className="text-xs text-muted-foreground">
                                            {t("ticket.experience", "Experience")}: {displayExperienceLabel}
                                        </span>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEdit(policy)}>
                                                <Clock className="w-3 h-3 mr-2" /> {t("bookingPolicy.editTimes", "Edit Times")}
                                            </DropdownMenuItem>
                                            {primaryExperience && (
                                                /* Real <Link> via asChild: programmatic navigate() gets lost
                                                   in the menu-close event ordering, an anchor does not. */
                                                <DropdownMenuItem asChild>
                                                    <Link to={`/cheese/experiences/${encodeURIComponent(primaryExperience)}`} className="cursor-pointer">
                                                        <Sparkles className="w-3 h-3 mr-2" /> {t("documents.viewExperience", "View Experience")}
                                                    </Link>
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                    );
                                })()}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><span>{t("bookingPolicy.cancelBeforeHours", "Cancel before (hours)")}: <strong>{policy.cancel_until_hours_before || 0}h</strong></span></div>
                                    <div className="flex items-center gap-2 text-sm"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><span>{t("bookingPolicy.modifyBeforeHours", "Modify before (hours)")}: <strong>{policy.modify_until_hours_before || 0}h</strong></span></div>
                                    <div className="flex items-center gap-2 text-sm"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><span>{t("bookingPolicy.minLeadHours", "Min booking lead (hours)")}: <strong>{policy.min_hours_before_booking || 0}h</strong></span></div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><Shield className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">{t("bookingPolicy.noneFound", "No policies found")}</p></div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> {t("bookingPolicy.newPolicy", "New Booking Policy")}</DialogTitle><DialogDescription>{t("bookingPolicy.newPolicyDescription", "Set booking rules for an experience")}</DialogDescription></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2"><Label>{t("ticket.experience", "Experience")} *</Label><Input placeholder={t("experiences.experienceNameId", "Experience ID")} value={form.experience} onChange={(e) => setForm(f => ({ ...f, experience: e.target.value }))} /></div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-2"><Label className="text-xs">{t("bookingPolicy.cancelHoursShort", "Cancel (hrs)")}</Label><Input type="number" min="0" value={form.cancel_until_hours_before} onChange={(e) => setForm(f => ({ ...f, cancel_until_hours_before: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs">{t("bookingPolicy.modifyHoursShort", "Modify (hrs)")}</Label><Input type="number" min="0" value={form.modify_until_hours_before} onChange={(e) => setForm(f => ({ ...f, modify_until_hours_before: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs">{t("bookingPolicy.minBookHoursShort", "Min Book (hrs)")}</Label><Input type="number" min="0" value={form.min_hours_before_booking} onChange={(e) => setForm(f => ({ ...f, min_hours_before_booking: e.target.value }))} /></div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel", "Cancel")}</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} {t("common.create", "Create")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editPolicy} onOpenChange={(open) => !open && setEditPolicy(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t("bookingPolicy.editTimes", "Edit Booking Policy")}</DialogTitle>
                        <DialogDescription>
                            {t("bookingPolicy.editMultiDescription", "Update the policy times and the list of experiences it governs")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t("bookingPolicy.experiences", "Experiences")}</Label>
                            <FrappeSearchSelect
                                doctype="Cheese Experience"
                                label="name"
                                value={experiencePicker}
                                onChange={handleAddLinkedExperience}
                                placeholder={t("bookingPolicy.addExperiencePlaceholder", "Add an experience...")}
                                filters={{
                                    name: linkedExperiences.length > 0 ? ["not in", linkedExperiences] : "",
                                }}
                            />
                            <p className="text-xs text-muted-foreground">{t("bookingPolicy.multiExperienceHint", "The same policy can be assigned to many experiences.")}</p>
                            {linkedExperiences.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {linkedExperiences.map((exp) => (
                                        <Badge key={exp} variant="secondary" className="flex items-center gap-1 px-2 py-1">
                                            <span className="text-xs">{exp}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveLinkedExperience(exp)}
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
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-2"><Label className="text-xs">{t("bookingPolicy.cancelHoursShort", "Cancel (hrs)")}</Label><Input type="number" min="0" value={editForm.cancel_until_hours_before} onChange={(e) => setEditForm(f => ({ ...f, cancel_until_hours_before: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs">{t("bookingPolicy.modifyHoursShort", "Modify (hrs)")}</Label><Input type="number" min="0" value={editForm.modify_until_hours_before} onChange={(e) => setEditForm(f => ({ ...f, modify_until_hours_before: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs">{t("bookingPolicy.minBookHoursShort", "Min Book (hrs)")}</Label><Input type="number" min="0" value={editForm.min_hours_before_booking} onChange={(e) => setEditForm(f => ({ ...f, min_hours_before_booking: e.target.value }))} /></div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditPolicy(null)} disabled={savingLinks}>{t("common.cancel", "Cancel")}</Button>
                        <Button onClick={handleEditSave} disabled={savingLinks}>
                            {savingLinks ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                            {t("common.save", "Save changes")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
