import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFrappeDoc, useFrappeUpdate, useFrappeList } from "@/lib/useApiData";
import { toast } from "sonner";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Map, MapPin, DollarSign, Calendar, Info, Shield, Layers, FileText, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { experienceService } from "@/api/experienceService";
import { routeService } from "@/api/routeService";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/api/client";
import DocumentGallery from "@/components/DocumentGallery";

export default function RouteDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();

    // Fetch Data
    const { data: route, isLoading } = useFrappeDoc("Cheese Route", id);
    const updateMutation = useFrappeUpdate("Cheese Route");

    // Local State for Edit Mode
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});
    const [experienceToAdd, setExperienceToAdd] = useState("");
    const [experienceIds, setExperienceIds] = useState([]);
    const [isSavingExperiences, setIsSavingExperiences] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [newId, setNewId] = useState("");

    // Reset local form when fetched data changes
    useEffect(() => {
        if (route) {
            const sorted = Array.isArray(route.experiences)
                ? [...route.experiences].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
                : [];
            const initialIds = sorted.map((row) => row.experience).filter(Boolean);
            setExperienceIds(initialIds);
            setForm({
                short_description: route.short_description || "",
                description: route.description || "",
                google_maps_link: route.google_maps_link || "",
                status: route.status || "ONLINE",
                price_mode: route.price_mode || "Manual",
                price: route.price || 0,
                deposit_required: route.deposit_required || 0,
                deposit_type: route.deposit_type || "Amount",
                deposit_value: route.deposit_value || 0,
                deposit_ttl_hours: route.deposit_ttl_hours || 48,
            });
        }
    }, [route]);

    const handleFieldChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const { data: experiencesRaw } = useQuery({
        queryKey: ["experiences-for-route-detail"],
        queryFn: async () => {
            const result = await experienceService.listExperiences({ page_size: 100 });
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || [];
        },
        enabled: !!route,
    });

    const experiences = Array.isArray(experiencesRaw) ? experiencesRaw : [];
    const expById = useMemo(() => Object.fromEntries(experiences.map((e) => [e.name, e])), [experiences]);
    const computedRoutePrice = useMemo(() => {
        return experienceIds.reduce((sum, expId) => {
            const exp = expById[expId];
            const price = Number(exp?.route_price ?? exp?.individual_price ?? 0);
            return sum + (Number.isFinite(price) ? price : 0);
        }, 0);
    }, [experienceIds, expById]);

    // Keep price consistent with "sum from experiences" rule while editing experiences.
    useEffect(() => {
        if (!editMode) return;
        setForm((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                price_mode: "Manual",
                price: computedRoutePrice,
            };
        });
    }, [computedRoutePrice, editMode]);

    const { data: documents = [], isLoading: documentsLoading } = useFrappeList("Cheese Document", {
        enabled: !!id,
        filters: {
            entity_type: "Cheese Route",
            entity_id: id,
        },
        fields: ["name", "title", "document_type", "file_url", "status", "language", "version", "validity_date", "creation"],
        pageSize: 20,
        orderBy: "creation desc",
    });

    const { data: bankAccounts = [], isLoading: bankAccountsLoading } = useFrappeList("Cheese Bank Account", {
        enabled: !!id,
        filters: {
            entity_type: "Cheese Route",
            entity_id: id,
        },
        fields: ["name", "holder", "bank", "account", "iban", "currency", "status", "creation"],
        pageSize: 20,
        orderBy: "creation desc",
    });

    const handleMoveExperience = (fromIndex, toIndex) => {
        setExperienceIds((prev) => {
            if (toIndex < 0 || toIndex >= prev.length) return prev;
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    };

    const handleRemoveExperience = (index) => {
        setExperienceIds((prev) => prev.filter((_, i) => i !== index));
    };

    const handleAddExperienceToRoute = () => {
        if (!experienceToAdd) {
            toast.error(t("routes.selectExperienceToAdd", "Select an experience to add"));
            return;
        }
        if (experienceIds.includes(experienceToAdd)) {
            toast.error(t("routes.experienceAlreadyIncluded", "This experience is already included"));
            return;
        }
        setExperienceIds((prev) => [...prev, experienceToAdd]);
        setExperienceToAdd("");
    };

    const handleSave = async () => {
        if (!form.short_description) {
            toast.error(t("routes.shortDescRequired", "Short description is required."));
            return;
        }

        const sortedCurrent = Array.isArray(route?.experiences)
            ? [...route.experiences].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
            : [];
        const currentIds = sortedCurrent.map((row) => row.experience).filter(Boolean);
        const experiencesChanged = JSON.stringify(currentIds) !== JSON.stringify(experienceIds);

        // Calculate only what changed (scalar fields)
        const changes = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== (route[key] || "") && !(form[key] === 0 && !route[key])) {
                changes[key] = form[key];
            }
        });

        if (Object.keys(changes).length === 0 && !experiencesChanged) {
            setEditMode(false);
            return;
        }

        try {
            // Save experiences ordering through backend controller (child table update).
            if (experiencesChanged) {
                setIsSavingExperiences(true);
                const experiencesPayload = experienceIds.map((expId, idx) => ({
                    experience: expId,
                    sequence: idx + 1,
                }));
                const res = await routeService.updateRoute(id, { experiences: experiencesPayload });
                if (res?.success === false) {
                    toast.error(res?.data?.message || t("routes.updateExperiencesError", "Failed to update route experiences"));
                    return;
                }
            }

            if (Object.keys(changes).length > 0) {
                await updateMutation.mutateAsync({ name: id, data: changes });
            }

            toast.success(t("routes.updateSuccess", "Route updated successfully."));
            setEditMode(false);
        } catch (err) {
            toast.error(err?.message || t("routes.updateError", "Failed to update route"));
        } finally {
            setIsSavingExperiences(false);
        }
    };

    const handleRename = async () => {
        const targetId = (newId || "").trim();
        if (!targetId) {
            toast.error(t("experiences.newIdRequired", "New ID is required"));
            return;
        }
        try {
            await apiRequest("/api/method/frappe.model.rename_doc.rename_doc", {
                method: "POST",
                body: JSON.stringify({
                    doctype: "Cheese Route",
                    old_name: id,
                    new_name: targetId,
                    force: 1,
                    merge: 0,
                }),
            });
            toast.success(t("routes.renameSuccess", "Route ID renamed"));
            setRenameOpen(false);
            navigate(`/cheese/routes/${encodeURIComponent(targetId)}`);
        } catch (e) {
            toast.error(e?.message || t("routes.renameError", "Failed to rename route"));
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case "ONLINE": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{t("status.ONLINE", "Online")}</Badge>;
            case "OFFLINE": return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{t("status.OFFLINE", "Offline")}</Badge>;
            case "ARCHIVED": return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">{t("status.ARCHIVED", "Archived")}</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <DetailPageLayout
            title={route?.short_description || route?.route_info || route?.name || t("routes.route", "Route")}
            subtitle={`${t("routes.routeIdentifier", "Route Identifier")}: ${id}`}
            backPath="/cheese/routes"
            isLoading={isLoading}
            statusBadge={getStatusBadge(route?.status)}
            onEditToggle={() => setEditMode(!editMode)}
            editMode={editMode}
            onSave={handleSave}
            isSaving={updateMutation.isPending || isSavingExperiences}
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left/Main Column - Forms */}
                <div className="lg:col-span-2 space-y-6">
                    <Tabs defaultValue="details" className="w-full">
                        <TabsList className="w-full justify-start h-12 bg-muted/50 p-1">
                            <TabsTrigger value="details" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Map className="w-4 h-4 mr-2" /> {t("routes.generalInfo", "General Info")}</TabsTrigger>
                            <TabsTrigger value="financials" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><DollarSign className="w-4 h-4 mr-2" /> {t("experiences.pricingDeposits", "Pricing & Deposits")}</TabsTrigger>
                            <TabsTrigger value="experiences" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Layers className="w-4 h-4 mr-2" /> {t("routes.experiencesList", "Experiences List")}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="pt-4 space-y-6">
                            {/* Route Configuration */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Info className="w-4 h-4 mr-2" /> {t("routes.routeDefinition", "Route Definition")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 gap-y-6 gap-x-8">
                                        <EditableField label={t("routes.shortDescriptionName", "Short Description (Name)")} value={form.short_description} onChange={(v) => handleFieldChange("short_description", v)} editMode={editMode} />

                                        <div className="space-y-1">
                                            {editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">{t("common.status", "Status")}</label>
                                                    <select
                                                        value={form.status}
                                                        onChange={(e) => handleFieldChange("status", e.target.value)}
                                                        className="flex h-9 w-1/2 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="ONLINE">{t("status.ONLINE", "ONLINE")}</option>
                                                        <option value="OFFLINE">{t("status.OFFLINE", "OFFLINE")}</option>
                                                        <option value="ARCHIVED">{t("status.ARCHIVED", "ARCHIVED")}</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <EditableField label={t("common.status", "Status")} value={t(`status.${form.status}`, form.status)} editMode={false} />
                                            )}
                                        </div>

                                        <EditableField
                                            label={t("experiences.googleMapsLink", "Google Maps Link")}
                                            value={form.google_maps_link}
                                            onChange={(v) => handleFieldChange("google_maps_link", v)}
                                            editMode={editMode}
                                            placeholder="https://maps.google.com/..."
                                        />

                                        {!editMode && form.google_maps_link ? (
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => window.open(form.google_maps_link, "_blank")}
                                                >
                                                    {t("experiences.viewOnMap", "Open in Google Maps")}
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Info className="w-4 h-4 mr-2" /> {t("experiences.richDescription", "Rich Description")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    {editMode ? (
                                        <textarea
                                            value={form.description?.replace(/<[^>]*>?/gm, '')} // Stripping basic HTML for standard text edit
                                            onChange={(e) => handleFieldChange("description", e.target.value)}
                                            placeholder={t("experiences.descPlaceholder", "Extensive details...")}
                                            className="w-full min-h-[160px] p-3 text-sm border rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                        />
                                    ) : (
                                        <div
                                            className="text-sm prose prose-sm max-w-none text-muted-foreground"
                                            dangerouslySetInnerHTML={{ __html: route?.description || `<span class="italic font-normal">${t("common.noDescription", "No description")}</span>` }}
                                        />
                                    )}
                                </CardContent>
                            </Card>

                            {/* Route Documents */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <FileText className="w-4 h-4 mr-2" /> {t("common.documents", "Documents")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <DocumentGallery
                                        documents={documents}
                                        isLoading={documentsLoading}
                                        onAddClick={() => navigate(`/cheese/documents/new?entity_type=${encodeURIComponent("Cheese Route")}&entity_id=${encodeURIComponent(id)}`)}
                                    />
                                </CardContent>
                            </Card>

                            {/* Route Bank Accounts */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Landmark className="w-4 h-4 mr-2" /> {t("common.bankAccounts", "Bank Accounts")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {bankAccountsLoading ? (
                                        <div className="p-6 text-sm text-muted-foreground">Loading...</div>
                                    ) : bankAccounts && bankAccounts.length > 0 ? (
                                        <div className="divide-y divide-border/50">
                                            {bankAccounts.map((acct) => (
                                                <div key={acct.name} className="p-4 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors cursor-pointer" onClick={() => navigate(`/cheese/bank-accounts/${encodeURIComponent(acct.name)}`)}>
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-sm truncate">{acct.holder || acct.name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {acct.bank || "—"} {acct.iban ? `• IBAN: ${acct.iban}` : ""} {acct.currency ? `• ${acct.currency}` : ""}
                                                        </p>
                                                    </div>
                                                    <Badge variant="outline" className="text-[10px]">{acct.status || "PENDING"}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                                            <Landmark className="w-8 h-8 mb-4 opacity-20" />
                                            <p>{t("routes.noBankAccounts", "No bank accounts linked to this route yet.")}</p>
                                        </div>
                                    )}
                                    <div className="p-3 border-t border-border bg-muted/10">
                                        <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/cheese/bank-accounts/new?route=${encodeURIComponent(id)}`)}>
                                            {t("routes.addBankAccount", "Add Bank Account")}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="financials" className="pt-4 space-y-6">
                            {/* Pricing Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <DollarSign className="w-4 h-4 mr-2" /> {t("routes.pricingRules", "Pricing Rules")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <div className="space-y-1">
                                            {editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">{t("routes.priceMode", "Price Mode")}</label>
                                                    <select
                                                        value={form.price_mode}
                                                        onChange={(e) => handleFieldChange("price_mode", e.target.value)}
                                                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="Manual">{t("routes.priceManual", "Manual")}</option>
                                                        <option value="Sum">{t("routes.priceSum", "Sum (Calc from Experiences)")}</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <EditableField label={t("routes.priceMode", "Price Mode")} value={form.price_mode === 'Sum' ? t("routes.priceSum", "Sum (Calc from Experiences)") : t("routes.priceManual", "Manual")} editMode={false} />
                                            )}
                                        </div>
                                        <EditableField label={t("routes.price", "Price ($)")} type="number" value={form.price} onChange={(v) => handleFieldChange("price", v)} editMode={editMode} />
                                    </div>
                                    {form.price_mode === "Sum" && (
                                        <p className="text-xs text-amber-600 mt-4 px-3 py-2 bg-amber-50 rounded-md border border-amber-100">
                                            {t("routes.priceSumNote", "Note: When Price Mode is 'Sum', the final route price cascades from the linked Cheese Experiences.")}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Deposit Rules Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Shield className="w-4 h-4 mr-2" /> {t("experiences.standaloneDepositRules", "Deposit Rules")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="space-y-6">
                                        {editMode ? (
                                            <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                <label className="text-xs text-muted-foreground flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!form.deposit_required}
                                                        onChange={(e) => handleFieldChange("deposit_required", e.target.checked ? 1 : 0)}
                                                        className="rounded border-gray-300 text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                                    />
                                                    {t("routes.depositRequiredCb", "Deposit Required on Bookings")}
                                                </label>
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                <label className="text-xs text-muted-foreground">{t("experiences.depositRequired", "Deposit Required")}</label>
                                                <div className="font-medium text-sm border-b border-transparent py-2 px-0">{form.deposit_required ? t("common.yes", "Yes") : t("common.no", "No")}</div>
                                            </div>
                                        )}

                                        {!!form.deposit_required && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-8 p-4 bg-muted/30 rounded-lg border border-border/50 animate-in slide-in-from-top-2 fade-in">
                                                <div className="space-y-1">
                                                    {editMode ? (
                                                        <div className="space-y-1.5">
                                                            <label className="text-xs text-muted-foreground">{t("experiences.depositFormat", "Deposit Format")}</label>
                                                            <select
                                                                value={form.deposit_type}
                                                                onChange={(e) => handleFieldChange("deposit_type", e.target.value)}
                                                                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                <option value="Amount">{t("experiences.fixedAmount", "Fixed Amount ($)")}</option>
                                                                <option value="%">{t("experiences.percentage", "Percentage (%)")}</option>
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <EditableField label={t("experiences.depositFormat", "Deposit Format")} value={form.deposit_type} editMode={false} />
                                                    )}
                                                </div>
                                                <EditableField label={t("experiences.depositValue", "Deposit Value")} type="number" value={form.deposit_value} onChange={(v) => handleFieldChange("deposit_value", v)} editMode={editMode} />
                                                <EditableField label={t("experiences.ttlHours", "TTL (Hours)")} type="number" value={form.deposit_ttl_hours} onChange={(v) => handleFieldChange("deposit_ttl_hours", v)} editMode={editMode} />
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="experiences" className="pt-4">
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">{t("routes.tiedExperiences", "Tied Experiences")}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {experienceIds.length > 0 ? (
                                        <div className="divide-y divide-border/50">
                                            {experienceIds.map((expId, idx) => {
                                                const exp = expById[expId];
                                                const label = exp?.experience_info || exp?.name || expId;
                                                return (
                                                    <div key={`${expId}-${idx}`} className="p-4 flex items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="text-xs font-semibold bg-muted px-2 py-0.5 rounded text-muted-foreground">#{idx + 1}</span>
                                                            <p className="font-medium text-sm truncate">{label}</p>
                                                        </div>

                                                        {editMode ? (
                                                            <div className="flex items-center gap-1">
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleMoveExperience(idx, idx - 1)}
                                                                    disabled={idx === 0}
                                                                    className="h-8 w-8"
                                                                >
                                                                    <ChevronUp className="w-4 h-4" />
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleMoveExperience(idx, idx + 1)}
                                                                    disabled={idx === experienceIds.length - 1}
                                                                    className="h-8 w-8"
                                                                >
                                                                    <ChevronDown className="w-4 h-4" />
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleRemoveExperience(idx)}
                                                                    className="h-8 w-8"
                                                                >
                                                                    <Trash2 className="w-4 h-4 text-red-500" />
                                                                </Button>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                                            <MapPin className="w-8 h-8 mb-4 opacity-20" />
                                            <p>{t("routes.noExperiencesAdded", "No experiences have been added to this route.")}</p>
                                        </div>
                                    )}

                                    {editMode && (
                                        <div className="p-4 border-t border-border bg-muted/20 space-y-3">
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground">{t("routes.addExperience", "Add experience")}</Label>
                                                <FrappeSearchSelect
                                                    doctype="Cheese Experience"
                                                    label="name"
                                                    value={experienceToAdd}
                                                    onChange={setExperienceToAdd}
                                                    placeholder={t("routes.selectExperience", "Select an experience...")}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button type="button" variant="outline" disabled={!experienceToAdd} onClick={handleAddExperienceToRoute}>
                                                    <Trash2 className="w-4 h-4 mr-2 opacity-0" /> {/* spacing helper */}
                                                    {t("common.add", "Add")}
                                                </Button>
                                                <div className="text-xs text-muted-foreground">
                                                    {t("routes.routePriceUpdates", "Route price updates to sum of included experiences.")}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => { setNewId(id); setRenameOpen(true); }}>
                            {t("routes.renameRouteId", "Rename Route ID")}
                        </Button>
                    </div>
                </div>

                {/* Right Column - Metadata */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">{t("experiences.systemInfo", "System Information")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("routes.internalId", "Internal ID")}</Label>
                                <p className="text-sm font-medium font-mono text-muted-foreground">{id}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("experiences.createdOn", "Created On")}</Label>
                                <p className="text-sm font-medium">{route?.creation ? new Date(route.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("experiences.lastModified", "Last Modified")}</Label>
                                <p className="text-sm font-medium">{route?.modified ? new Date(route.modified).toLocaleString() : "—"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">{t("routes.routeAdminActions", "Route Admin Actions")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                {route?.status === "ONLINE" ? (
                                    <button onClick={() => updateMutation.mutate({ name: id, data: { status: "OFFLINE" } })} disabled={updateMutation.isPending} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                        <span>{t("routes.takeRouteOffline", "Take Route Offline")}</span>
                                    </button>
                                ) : (
                                    <button onClick={() => updateMutation.mutate({ name: id, data: { status: "ONLINE" } })} disabled={updateMutation.isPending} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                        <span>{t("routes.publishRouteOnline", "Publish Route Online")}</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (window.confirm(t("routes.deleteConfirm", "Delete this route? This cannot be undone."))) {
                                            routeService.deleteRoute(id)
                                                .then(() => { toast.success(t("routes.deleteSuccess", "Route deleted")); navigate("/cheese/routes"); })
                                                .catch((err) => toast.error(err?.message || t("routes.deleteError", "Failed to delete route")));
                                        }
                                    }}
                                    className="text-sm text-left px-3 py-2 rounded-md hover:bg-red-500/10 transition-colors text-red-600 dark:text-red-400 font-medium flex items-center"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" /> {t("routes.deleteRoute", "Delete Route")}
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t("routes.renameRouteId", "Rename Route ID")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Label>{t("experiences.newId", "New ID")}</Label>
                        <Input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder={t("experiences.newIdPlaceholder", "Enter new document ID")} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameOpen(false)}>{t("common.cancel", "Cancel")}</Button>
                        <Button onClick={handleRename}>{t("common.rename", "Rename")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DetailPageLayout>
    );
}
