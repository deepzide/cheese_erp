import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFrappeDoc, useFrappeUpdate, useFrappeList } from "@/lib/useApiData";
import { useAcceptedCurrencies } from "@/lib/useAcceptedCurrencies";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import DocumentGallery from "@/components/DocumentGallery";
import InlineDocumentUploadDialog from "@/components/InlineDocumentUploadDialog";
import DetailPageLayout from "@/components/DetailPageLayout";
import EditableField from "@/components/EditableField";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, DollarSign, Settings, MapPin, Info, Link as LinkIcon, Trash2, FileText, ImagePlus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/api/client";
import { experienceService } from "@/api/experienceService";
import ExperiencePriceCalendar from "@/components/ExperiencePriceCalendar";
import { useHotelAccess } from "@/lib/useHotelAccess";

export default function ExperienceDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { isAdmin, userCompanies } = useHotelAccess();

    // Fetch Data
    const { data: exp, isLoading } = useFrappeDoc("Cheese Experience", id);
    const updateMutation = useFrappeUpdate("Cheese Experience");

    const { data: expDocs = [], isLoading: expDocsLoading } = useFrappeList("Cheese Document", {
        enabled: !!id,
        filters: {
            entity_type: "Cheese Experience",
            entity_id: id,
        },
        fields: ["name", "title", "document_type", "file_url", "status", "language", "version", "validity_date", "creation", "entity_type"],
        pageSize: 20,
        orderBy: "creation desc",
    });

    const { data: companyDocs = [], isLoading: companyDocsLoading } = useFrappeList("Cheese Document", {
        enabled: !!exp?.company,
        filters: {
            entity_type: "Company",
            entity_id: exp?.company,
        },
        fields: ["name", "title", "document_type", "file_url", "status", "language", "version", "validity_date", "creation", "entity_type"],
        pageSize: 20,
        orderBy: "creation desc",
    });

    const documents = [...expDocs, ...companyDocs].sort((a, b) => new Date(b.creation) - new Date(a.creation));
    const documentsLoading = expDocsLoading || companyDocsLoading;

    // Local State for Edit Mode
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});
    const [renameOpen, setRenameOpen] = useState(false);
    const [newId, setNewId] = useState("");
    // Inline doc upload — issue #267: stay on the experience form instead of
    // navigating to /cheese/documents/new and back.
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploadTarget, setUploadTarget] = useState({
        entityType: "Cheese Experience",
        entityId: id,
    });
    const queryClient = useQueryClient();

    const openExperienceUpload = () => {
        setUploadTarget({ entityType: "Cheese Experience", entityId: id });
        setUploadOpen(true);
    };

    const handleDocumentUploaded = () => {
        queryClient.invalidateQueries({ queryKey: ["frappe-list", "Cheese Document"] });
    };

    const [imageUploading, setImageUploading] = useState(false);
    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setImageUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("is_private", "0");
            formData.append("doctype", "Cheese Experience");
            formData.append("docname", id);
            const res = await apiRequest("/api/method/upload_file", { method: "POST", body: formData });
            const url = res?.data?.message?.file_url || res?.data?.file_url;
            if (url) {
                handleFieldChange("image", url);
                toast.success(t("experiences.imageUploaded", "Imagen subida"));
            } else {
                toast.error(t("experiences.imageUploadError", "No se pudo subir la imagen"));
            }
        } catch (err) {
            toast.error(err?.message || t("experiences.imageUploadError", "No se pudo subir la imagen"));
        } finally {
            setImageUploading(false);
        }
    };

    // Reset local form when fetched data changes
    useEffect(() => {
        if (exp) {
            const hours = exp.event_duration ? exp.event_duration / 3600 : 0;
            setForm({
                experience_type: exp.experience_type || "ACTIVITY",
                company: exp.company || "",
                image: exp.image || "",
                google_maps_link: exp.google_maps_link || "",
                description: exp.description || "",
                // Backend stores duration in seconds; convert to hours for UI and round for readability
                event_duration: Number(hours.toFixed(2)),
                individual_price: exp.individual_price || 0,
                currency: exp.currency || "UYU",
                differentiate_by_weekday: exp.differentiate_by_weekday || 0,
                differentiate_by_age_group: exp.differentiate_by_age_group || 0,
                price_lines: (exp.price_lines || []).map(r => ({
                    day_type: r.day_type || "ALL",
                    day_range: r.day_range || "",
                    age_group: r.age_group || "",
                    price: r.price ?? "",
                    route_price: r.route_price ?? "",
                })),
                route_price: exp.route_price || 0,
                price_per_night: exp.price_per_night || 0,
                max_occupancy_per_unit: exp.max_occupancy_per_unit || 2,
                min_nights_stay: exp.min_nights_stay || 1,
                is_room: exp.is_room || 0,
                room_size: exp.room_size || 0,
                cancel_days_before: exp.cancel_days_before || 0,
                modify_days_before: exp.modify_days_before || 0,
                refund_policy: exp.refund_policy || "FULL",
                deposit_ttl_days: exp.deposit_ttl_days || 2,
                package_mode: exp.package_mode || "Both",
                deposit_required: exp.deposit_required || 0,
                deposit_type: exp.deposit_type || "Amount",
                deposit_value: exp.deposit_value || 0,
                deposit_ttl_hours: exp.deposit_ttl_hours || 48,
                manual_confirmation: exp.manual_confirmation || 0,
                status: exp.status || "ONLINE",
            });
        }
    }, [exp]);

    const acceptedCurrencies = useAcceptedCurrencies(form.company);
    const { data: companyAgeGroups = [] } = useFrappeList("Cheese Age Group", {
        enabled: !!form.company,
        filters: { company: form.company },
        fields: ["name", "group_name", "min_age", "max_age"],
        pageSize: 100,
    });

    // Custom weekday ranges of the company (nomenclator) for the price matrix.
    const { data: companyDayRanges = [] } = useFrappeList("Cheese Day Range", {
        enabled: !!form.company,
        filters: { company: form.company },
        fields: ["name", "range_name", "day_from", "day_to"],
        pageSize: 100,
    });
    const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const dayRangeMap = useMemo(() => {
        const m = {};
        (Array.isArray(companyDayRanges) ? companyDayRanges : []).forEach((r) => { m[r.name] = r; });
        return m;
    }, [companyDayRanges]);

    // Days covered by a price line (null = ALL, exempt from the overlap rule).
    const lineDaySet = (line) => {
        if (line.day_range) {
            const r = dayRangeMap[line.day_range];
            if (!r) return null;
            const f = Number(r.day_from), t = Number(r.day_to);
            const days = new Set();
            if (f <= t) { for (let d = f; d <= t; d++) days.add(d); }
            else { for (let d = f; d <= 6; d++) days.add(d); for (let d = 0; d <= t; d++) days.add(d); }
            return days;
        }
        if (line.day_type === "WEEKDAY") return new Set([0, 1, 2, 3, 4]);
        if (line.day_type === "WEEKEND") return new Set([5, 6]);
        return null;
    };
    const lineDayLabel = (line) => {
        if (line.day_range) return dayRangeMap[line.day_range]?.range_name || line.day_range;
        return line.day_type === "WEEKDAY" ? t("experiences.weekday", "Lunes a viernes")
            : line.day_type === "WEEKEND" ? t("experiences.weekend", "Fin de semana")
                : t("experiences.anyDay", "Cualquier día");
    };
    // Mirror of the server rule: day scopes of two lines with the same age
    // group must not overlap.
    const findDayOverlap = (lines) => {
        const byAge = {};
        for (let i = 0; i < lines.length; i++) {
            const days = lineDaySet(lines[i]);
            if (!days) continue;
            const key = lines[i].age_group || "";
            for (const prev of byAge[key] || []) {
                if ([...days].some((d) => prev.days.has(d))) return [prev.line, lines[i]];
            }
            (byAge[key] = byAge[key] || []).push({ line: lines[i], days });
        }
        return null;
    };

    const handleFieldChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    // Al desmarcar una pleca, las líneas existentes pierden esa dimensión: sin
    // diferenciación por día valen para todos los días, sin diferenciación por
    // grupo etario valen para todas las edades.
    const handlePriceModeToggle = (field, enabled) => {
        setForm(prev => ({
            ...prev,
            [field]: enabled ? 1 : 0,
            price_lines: (prev.price_lines || []).map(line => ({
                ...line,
                day_type: !enabled && field === "differentiate_by_weekday" ? "ALL" : line.day_type,
                day_range: !enabled && field === "differentiate_by_weekday" ? "" : line.day_range,
                age_group: !enabled && field === "differentiate_by_age_group" ? "" : line.age_group,
            })),
        }));
    };

    // Clases literales (Tailwind no genera valores arbitrarios interpolados).
    const priceGridClass = form.differentiate_by_weekday && form.differentiate_by_age_group
        ? "grid grid-cols-[1fr_1fr_100px_100px_32px] gap-2"
        : "grid grid-cols-[1fr_100px_100px_32px] gap-2";

    // Temporada activa hoy: los precios efectivos incluyen su % de ajuste.
    const { data: seasonPayload } = useQuery({
        queryKey: ["experience-active-season", id],
        enabled: !!id,
        queryFn: async () => {
            const res = await apiRequest(
                `/api/method/cheese.api.v1.pricing_controller.get_active_season_for_experience?experience_id=${encodeURIComponent(id)}`
            );
            return res?.data?.message || res?.data || {};
        },
    });
    const activeSeason = seasonPayload?.data?.season || null;
    const seasonPercent = Number(activeSeason?.percent) || 0;
    const seasonFactor = 1 + seasonPercent / 100;
    const seasonPrice = (v) => {
        const n = parseFloat(v);
        if (!activeSeason || !seasonPercent || isNaN(n) || !n) return null;
        return (n * seasonFactor).toLocaleString(undefined, { maximumFractionDigits: 2 });
    };
    const seasonHint = (v) => {
        const adjusted = seasonPrice(v);
        if (!adjusted || editMode) return null;
        return (
            <p className={`text-xs font-medium ${seasonPercent > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {t("experiences.seasonEffective", "En temporada: {{price}} ({{sign}}{{percent}}%)", {
                    price: adjusted,
                    sign: seasonPercent > 0 ? "+" : "",
                    percent: seasonPercent,
                })}
            </p>
        );
    };

    const handleSave = () => {
        if (!form.company) {
            toast.error(t("experiences.companyRequired", "Company is required."));
            return;
        }

        // Day scopes of two lines with the same age group must not overlap
        // (same rule the server enforces).
        const activeLines = (form.price_lines || [])
            .filter(r => parseFloat(r.price) > 0 || parseFloat(r.route_price) > 0);
        const overlap = findDayOverlap(activeLines);
        if (overlap) {
            toast.error(t("experiences.dayOverlap", "Los rangos de días \"{{a}}\" y \"{{b}}\" se solapan para el mismo grupo etario. Elige rangos que no se solapen.", {
                a: lineDayLabel(overlap[0]), b: lineDayLabel(overlap[1]),
            }));
            return;
        }

        const changes = {};
        Object.keys(form).forEach(key => {
            let newValue = form[key];

            if (key === "price_lines") {
                changes.price_lines = (form.price_lines || [])
                    .filter(r => parseFloat(r.price) > 0 || parseFloat(r.route_price) > 0)
                    .map(r => ({
                        day_type: r.day_type || "ALL",
                        day_range: r.day_range || null,
                        age_group: r.age_group || null,
                        price: parseFloat(r.price) || 0,
                        route_price: parseFloat(r.route_price) || 0,
                    }));
                return;
            }

            // Convert event_duration from hours back to seconds before sending
            if (key === "event_duration") {
                const hours = parseFloat(form.event_duration) || 0;
                newValue = Math.round(hours * 3600);
            }

            if (newValue !== (exp[key] || "") && !(newValue === 0 && !exp[key])) {
                changes[key] = newValue;
            }
        });

        if (Object.keys(changes).length === 0) {
            setEditMode(false);
            return;
        }

        updateMutation.mutate({ name: id, data: changes }, {
            onSuccess: () => {
                toast.success(t("experiences.updateSuccess", "Experience updated successfully."));
                setEditMode(false);
            },
            onError: (err) => toast.error(err?.message || t("experiences.updateError", "Failed to update experience"))
        });
    };

    const handleRename = async () => {
        const targetId = (newId || "").trim();
        if (!targetId) {
            toast.error(t("experiences.newIdRequired", "New ID is required"));
            return;
        }
        try {
            const res = await apiRequest("/api/method/cheese.api.v1.experience_controller.rename_experience", {
                method: "POST",
                body: JSON.stringify({
                    old_name: id,
                    new_name: targetId,
                }),
            });
            const payload = res?.data?.message || res?.data || res;
            if (payload?.success === false) {
                throw new Error(payload?.error?.message || payload?.message || t("experiences.renameError", "Failed to rename experience"));
            }
            toast.success(t("experiences.renameSuccess", "Experience ID renamed"));
            setRenameOpen(false);
            navigate(`/cheese/experiences/${encodeURIComponent(targetId)}`);
        } catch (e) {
            toast.error(e?.message || t("experiences.renameError", "Failed to rename experience"));
        }
    };

    const handleSetStatus = (nextStatus) => {
        updateMutation.mutate(
            { name: id, data: { status: nextStatus } },
            {
                onSuccess: () => {
                    setForm((prev) => ({ ...prev, status: nextStatus }));
                    toast.success(t("experiences.statusUpdateSuccess", "Experience is now {{status}}", { status: nextStatus }));
                },
                onError: (err) => toast.error(err?.message || t("experiences.statusUpdateError", "Failed to update status")),
            }
        );
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case "ONLINE": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{t("status.ONLINE", "Online")}</Badge>;
            case "OFFLINE": return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">{t("status.OFFLINE", "Offline")}</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const hasScopedAccess = React.useMemo(() => {
        if (isAdmin) return true;
        if (!exp?.company) return false;
        return (Array.isArray(userCompanies) ? userCompanies : []).includes(exp.company);
    }, [isAdmin, userCompanies, exp?.company]);

    if (!isLoading && exp && !hasScopedAccess) {
        return (
            <DetailPageLayout
                title={t("common.accessDenied", "Access denied")}
                subtitle={t("common.noPermission", "You don't have permission to view this experience.")}
                backPath="/cheese/experiences"
                isLoading={false}
            >
                <div className="p-6 text-sm text-muted-foreground">
                    {t("common.noPermission", "You don't have permission to view this experience.")}
                </div>
            </DetailPageLayout>
        );
    }

    return (
        <DetailPageLayout
            title={id}
            subtitle={
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className={exp?.experience_type === "HOTEL" ? "bg-primary/10 text-primary border-primary/20" : "bg-purple-50 text-purple-700 border-purple-200"}>
                        {exp?.experience_type || "ACTIVITY"}
                    </Badge>
                    <span>{t("experiences.provider", "Provider")}: {exp?.company || t("common.loading", "Loading...")}</span>
                </div>
            }
            backPath="/cheese/experiences"
            isLoading={isLoading}
            statusBadge={getStatusBadge(exp?.status)}
            onEditToggle={() => setEditMode(!editMode)}
            editMode={editMode}
            onSave={handleSave}
            isSaving={updateMutation.isPending}
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left/Main Column - Forms */}
                <div className="lg:col-span-2 space-y-6">
                    <Tabs defaultValue="details" className="w-full">
                        <TabsList className="w-full justify-start h-12 bg-muted/50 p-1">
                            <TabsTrigger value="details" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><Building2 className="w-4 h-4 mr-2" /> {t("common.details", "Details")}</TabsTrigger>
                            <TabsTrigger value="pricing" className="flex-1 max-w-[200px] h-full data-[state=active]:bg-background data-[state=active]:shadow-sm"><DollarSign className="w-4 h-4 mr-2" /> {t("experiences.pricingDeposits", "Pricing & Deposits")}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="pt-4 space-y-6">
                            {/* Core Definition */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <Info className="w-4 h-4 mr-2" /> {t("experiences.baseConfig", "Base Configuration")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="mb-6 flex items-start gap-4">
                                        <div className="w-32 h-24 rounded-lg border border-border bg-muted/30 overflow-hidden flex items-center justify-center shrink-0">
                                            {form.image ? (
                                                <img src={form.image} alt={id} className="w-full h-full object-cover" />
                                            ) : (
                                                <ImagePlus className="w-7 h-7 text-muted-foreground/40" />
                                            )}
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-muted-foreground">{t("experiences.image", "Imagen")}</label>
                                            {editMode ? (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <label className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm cursor-pointer hover:bg-muted">
                                                        {imageUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                                                        {form.image ? t("experiences.changeImage", "Cambiar imagen") : t("experiences.uploadImage", "Subir imagen")}
                                                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={imageUploading} />
                                                    </label>
                                                    {form.image && (
                                                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleFieldChange("image", "")}>
                                                            {t("common.remove", "Quitar")}
                                                        </Button>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">{form.image ? t("experiences.imageSet", "Imagen cargada") : t("experiences.noImage", "Sin imagen")}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <EditableField label={t("experiences.providerCompany", "Provider Company")} value={form.company} onChange={(v) => handleFieldChange("company", v)} editMode={editMode} doctype="Company" searchLabel="name" />

                                        <div className="space-y-1">
                                            {editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">{t("common.status", "Status")}</label>
                                                    <select
                                                        value={form.status}
                                                        onChange={(e) => handleFieldChange("status", e.target.value)}
                                                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="ONLINE">{t("status.ONLINE", "ONLINE")}</option>
                                                        <option value="OFFLINE">{t("status.OFFLINE", "OFFLINE")}</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <EditableField label={t("common.status", "Status")} value={t(`status.${form.status}`, form.status)} editMode={false} />
                                            )}
                                        </div>

                                        <div className="space-y-1 col-span-1 sm:col-span-2 border-t border-border/50 pt-4 mt-2">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <label className="text-xs font-medium text-muted-foreground">{t("experiences.experienceNameId", "Experience Name / ID")}</label>
                                                    <p className="font-semibold text-sm">{id}</p>
                                                </div>
                                                <Button type="button" variant="outline" size="sm" onClick={() => { setNewId(id); setRenameOpen(true); }}>
                                                    {t("experiences.renameExperience", "Rename Experience Name")}
                                                </Button>
                                            </div>
                                        </div>

                                        {form.experience_type === "ACTIVITY" && (
                                            <EditableField
                                                label={t("experiences.eventDuration", "Event Duration (Hours)")}
                                                type="number"
                                                value={form.event_duration}
                                                onChange={(v) => handleFieldChange("event_duration", v)}
                                                editMode={editMode}
                                            />
                                        )}

                                        <div className="space-y-1">
                                            {editMode ? (
                                                <EditableField label={t("experiences.googleMapsLink", "Google Maps Link")} value={form.google_maps_link} onChange={(v) => handleFieldChange("google_maps_link", v)} editMode={editMode} />
                                            ) : (
                                                <div className="space-y-1">
                                                    <label className="text-xs text-muted-foreground">{t("experiences.googleMapsLink", "Google Maps Link")}</label>
                                                    <div className="font-medium text-sm border-b border-transparent py-2">
                                                        {form.google_maps_link ? <a href={form.google_maps_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center"><MapPin className="w-3 h-3 mr-1" /> {t("experiences.viewOnMap", "View on Map")}</a> : <span className="text-muted-foreground italic">{t("common.none", "None")}</span>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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
                                            value={form.description?.replace(/<[^>]*>?/gm, '')} // Strip basic HTML for pure text editing
                                            onChange={(e) => handleFieldChange("description", e.target.value)}
                                            placeholder={t("experiences.descPlaceholder", "Detailed experience outline...")}
                                            className="w-full min-h-[160px] p-3 text-sm border rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                        />
                                    ) : (
                                        <div
                                            className="text-sm prose prose-sm max-w-none text-muted-foreground"
                                            dangerouslySetInnerHTML={{ __html: exp?.description || `<span class="italic font-normal">${t("common.noDescription", "No description")}</span>` }}
                                        />
                                    )}
                                </CardContent>
                            </Card>

                            {/* Experience Documents */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <FileText className="w-4 h-4 mr-2" /> {t("common.attachedDocuments", "Attached Documents")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <DocumentGallery
                                        documents={documents}
                                        isLoading={documentsLoading}
                                        onAddClick={openExperienceUpload}
                                    />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="pricing" className="pt-4 space-y-6">
                            {activeSeason && seasonPercent !== 0 && (
                                <div className={`rounded-lg border px-4 py-3 text-sm ${seasonPercent > 0
                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
                                    <p className="font-semibold">
                                        {t("experiences.seasonBanner", "Temporada \"{{name}}\" activa: {{sign}}{{percent}}% ({{from}} → {{to}})", {
                                            name: activeSeason.season_name || activeSeason.name,
                                            sign: seasonPercent > 0 ? "+" : "",
                                            percent: seasonPercent,
                                            from: activeSeason.date_from,
                                            to: activeSeason.date_to,
                                        })}
                                    </p>
                                    <p className="text-xs opacity-80 mt-0.5">
                                        {t("experiences.seasonBannerHint", "Los precios base se muestran junto a su valor efectivo en temporada. Las reservas de estas fechas usan el precio ajustado.")}
                                    </p>
                                </div>
                            )}
                            {/* Pricing Strategy Card */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <DollarSign className="w-4 h-4 mr-2" /> {t("experiences.dynamicPricing", "Dynamic Pricing")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                                        <div className="space-y-1">
                                            {editMode ? (
                                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                    <label className="text-xs text-muted-foreground">{t("experiences.packageMode", "Package Mode")}</label>
                                                    <select
                                                        value={form.package_mode}
                                                        onChange={(e) => handleFieldChange("package_mode", e.target.value)}
                                                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <option value="Establishment">{t("experiences.pkgEstablishment", "A La Carte (Company)")}</option>
                                                        <option value="Route">{t("experiences.pkgRoute", "Packaged (Route)")}</option>
                                                        <option value="Both">{t("experiences.pkgBoth", "Available in Both")}</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <EditableField label={t("experiences.packageAvailability", "Package Availability")} value={form.package_mode} editMode={false} />
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-muted-foreground">{t("experiences.currency", "Moneda de los precios")}</p>
                                            {editMode ? (
                                                <select
                                                    value={form.currency}
                                                    onChange={(e) => handleFieldChange("currency", e.target.value)}
                                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                                >
                                                    {acceptedCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            ) : (
                                                <p className="text-sm font-medium">{form.currency || "UYU"}</p>
                                            )}
                                        </div>
                                        <div className="space-y-3 sm:col-span-2 lg:col-span-3 border border-border rounded-lg p-4">
                                            <p className="text-sm font-semibold">{t("experiences.priceMatrix", "Precios por día y grupo etario")}</p>
                                            <div className="flex gap-6 flex-wrap">
                                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                    <input type="checkbox" disabled={!editMode}
                                                        checked={!!form.differentiate_by_weekday}
                                                        onChange={(e) => handlePriceModeToggle("differentiate_by_weekday", e.target.checked)} />
                                                    {t("experiences.diffWeekday", "Diferenciar por día (lun-vie / fin de semana)")}
                                                </label>
                                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                    <input type="checkbox" disabled={!editMode}
                                                        checked={!!form.differentiate_by_age_group}
                                                        onChange={(e) => handlePriceModeToggle("differentiate_by_age_group", e.target.checked)} />
                                                    {t("experiences.diffAge", "Diferenciar por grupo etario")}
                                                </label>
                                            </div>
                                            {(form.differentiate_by_weekday || form.differentiate_by_age_group) ? (
                                                <div className="space-y-2">
                                                    <div className={`${priceGridClass} text-[11px] text-muted-foreground font-semibold uppercase`}>
                                                        {!!form.differentiate_by_weekday && <span>{t("experiences.dayType", "Día")}</span>}
                                                        {!!form.differentiate_by_age_group && <span>{t("experiences.ageGroup", "Grupo etario")}</span>}
                                                        <span>{t("experiences.priceInd", "Precio")}</span>
                                                        <span>{t("experiences.priceRoute", "Precio en paquete")}</span>
                                                        <span />
                                                    </div>
                                                    {(form.price_lines || []).map((line, i) => (
                                                        <div key={i} className={`${priceGridClass} items-center`}>
                                                            {!!form.differentiate_by_weekday && (
                                                                <select value={line.day_range ? `dr:${line.day_range}` : line.day_type} disabled={!editMode}
                                                                    onChange={(e) => {
                                                                        const v = e.target.value;
                                                                        const patch = v.startsWith("dr:")
                                                                            ? { day_range: v.slice(3), day_type: "ALL" }
                                                                            : { day_range: "", day_type: v };
                                                                        handleFieldChange("price_lines", form.price_lines.map((r, idx) => idx === i ? { ...r, ...patch } : r));
                                                                    }}
                                                                    className="flex h-8 rounded-md border border-input bg-background px-2 text-sm">
                                                                    <option value="ALL">{t("experiences.anyDay", "Cualquier día")}</option>
                                                                    <option value="WEEKDAY">{t("experiences.weekday", "Lunes a viernes")}</option>
                                                                    <option value="WEEKEND">{t("experiences.weekend", "Fin de semana")}</option>
                                                                    {(Array.isArray(companyDayRanges) ? companyDayRanges : []).map((r) => (
                                                                        <option key={r.name} value={`dr:${r.name}`}>
                                                                            {r.range_name} ({DAY_LABELS[r.day_from]}–{DAY_LABELS[r.day_to]})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                            {!!form.differentiate_by_age_group && (
                                                                <select value={line.age_group} disabled={!editMode}
                                                                    onChange={(e) => handleFieldChange("price_lines", form.price_lines.map((r, idx) => idx === i ? { ...r, age_group: e.target.value } : r))}
                                                                    className="flex h-8 rounded-md border border-input bg-background px-2 text-sm">
                                                                    <option value="">{t("experiences.allAges", "Todas las edades")}</option>
                                                                    {companyAgeGroups.map(g => (
                                                                        <option key={g.name} value={g.name}>{g.group_name} ({g.min_age}-{g.max_age})</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                            <div className="space-y-0.5">
                                                                <input type="number" min="0" step="0.01" value={line.price} disabled={!editMode}
                                                                    onChange={(e) => handleFieldChange("price_lines", form.price_lines.map((r, idx) => idx === i ? { ...r, price: e.target.value } : r))}
                                                                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
                                                                {!editMode && seasonPrice(line.price) && (
                                                                    <p className={`text-[11px] font-medium ${seasonPercent > 0 ? "text-amber-600" : "text-emerald-600"}`}>→ {seasonPrice(line.price)}</p>
                                                                )}
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <input type="number" min="0" step="0.01" value={line.route_price} disabled={!editMode}
                                                                    onChange={(e) => handleFieldChange("price_lines", form.price_lines.map((r, idx) => idx === i ? { ...r, route_price: e.target.value } : r))}
                                                                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
                                                                {!editMode && seasonPrice(line.route_price) && (
                                                                    <p className={`text-[11px] font-medium ${seasonPercent > 0 ? "text-amber-600" : "text-emerald-600"}`}>→ {seasonPrice(line.route_price)}</p>
                                                                )}
                                                            </div>
                                                            {editMode ? (
                                                                <button type="button" className="text-red-500 text-sm"
                                                                    onClick={() => handleFieldChange("price_lines", form.price_lines.filter((_, idx) => idx !== i))}>✕</button>
                                                            ) : <span />}
                                                        </div>
                                                    ))}
                                                    {editMode && (
                                                        <button type="button"
                                                            className="text-sm text-cheese-700 font-medium"
                                                            onClick={() => handleFieldChange("price_lines", [...(form.price_lines || []), { day_type: "ALL", day_range: "", age_group: "", price: "", route_price: "" }])}>
                                                            + {t("experiences.addPriceLine", "Agregar línea de precio")}
                                                        </button>
                                                    )}
                                                    {!form.differentiate_by_weekday && (
                                                        <p className="text-xs text-muted-foreground">{t("experiences.matrixAllDays", "Sin diferenciación por día: estos precios se aplican todos los días de la semana.")}</p>
                                                    )}
                                                    {!form.differentiate_by_age_group && (
                                                        <p className="text-xs text-muted-foreground">{t("experiences.matrixAllAges", "Sin diferenciación por grupo etario: estos precios se aplican a todas las edades.")}</p>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">{t("experiences.matrixHint", "Las combinaciones no definidas usan los precios base. La temporada activa ajusta estos precios con su %.")}</p>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">{t("experiences.matrixOff", "Sin diferenciación: se usan los precios base para todos los días y edades.")}</p>
                                            )}
                                        </div>
                                        {form.experience_type === "HOTEL" ? (
                                            <>
                                                <EditableField label={t("experiences.pricePerNight", "Individual Price / Night ($)")} type="number" value={form.price_per_night} onChange={(v) => handleFieldChange("price_per_night", v)} editMode={editMode} hint={seasonHint(form.price_per_night)} />
                                                <EditableField label={t("experiences.routePrice", "Route Price ($)")} type="number" value={form.route_price} onChange={(v) => handleFieldChange("route_price", v)} editMode={editMode} hint={seasonHint(form.route_price)} />
                                                <EditableField label={t("experiences.maxOccupancy", "Max Occupancy / Room")} type="number" value={form.max_occupancy_per_unit} onChange={(v) => handleFieldChange("max_occupancy_per_unit", v)} editMode={editMode} />
                                                <EditableField label={t("experiences.minNightsStay", "Min Nights Stay")} type="number" value={form.min_nights_stay} onChange={(v) => handleFieldChange("min_nights_stay", v)} editMode={editMode} />
                                                <div className="space-y-1">
                                                    {editMode ? (
                                                        <div className="space-y-1.5">
                                                            <label className="text-xs text-muted-foreground">{t("experiences.isRoom", "Is Room")}</label>
                                                            <select
                                                                value={Number(form.is_room) === 1 ? "1" : "0"}
                                                                onChange={(e) => handleFieldChange("is_room", Number(e.target.value))}
                                                                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                <option value="0">{t("common.no", "No")}</option>
                                                                <option value="1">{t("common.yes", "Yes")}</option>
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <EditableField label={t("experiences.isRoom", "Is Room")} value={Number(form.is_room) === 1 ? t("common.yes", "Yes") : t("common.no", "No")} editMode={false} />
                                                    )}
                                                </div>
                                                {Number(form.is_room) === 1 && (
                                                    <EditableField
                                                        label={t("experiences.roomSize", "Room Size (Max Guests)")}
                                                        type="number"
                                                        value={form.room_size}
                                                        onChange={(v) => handleFieldChange("room_size", v)}
                                                        editMode={editMode}
                                                    />
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <EditableField label={t("experiences.individualPrice", "Individual Price ($)")} type="number" value={form.individual_price} onChange={(v) => handleFieldChange("individual_price", v)} editMode={editMode} hint={seasonHint(form.individual_price)} />
                                                <EditableField label={t("experiences.routePrice", "Route Price ($)")} type="number" value={form.route_price} onChange={(v) => handleFieldChange("route_price", v)} editMode={editMode} hint={seasonHint(form.route_price)} />
                                            </>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Per-day price calendar (issue: precios por día) */}
                            <ExperiencePriceCalendar experienceId={id} />

                            {/* Policies & Deposits */}
                            {form.experience_type === "HOTEL" && (
                                <Card className="border-border/60 shadow-sm mt-6">
                                    <CardHeader className="border-b bg-muted/20 pb-4">
                                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                            <Building2 className="w-4 h-4 mr-2" /> {t("experiences.hotelPolicies", "Hotel Policies")}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-8">
                                            <EditableField label={t("experiences.cancelDeadline", "Cancel Deadline (Days)")} type="number" value={form.cancel_days_before} onChange={(v) => handleFieldChange("cancel_days_before", v)} editMode={editMode} />
                                            <EditableField label={t("experiences.modifyDeadline", "Modify Deadline (Days)")} type="number" value={form.modify_days_before} onChange={(v) => handleFieldChange("modify_days_before", v)} editMode={editMode} />
                                            <div className="space-y-1">
                                                {editMode ? (
                                                    <div className="space-y-1.5">
                                                        <label className="text-xs text-muted-foreground">{t("experiences.refundPolicy", "Refund Policy")}</label>
                                                        <select
                                                            value={form.refund_policy}
                                                            onChange={(e) => handleFieldChange("refund_policy", e.target.value)}
                                                            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            <option value="FULL">{t("experiences.refundFull", "FULL")}</option>
                                                            <option value="PARTIAL">{t("experiences.refundPartial", "PARTIAL")}</option>
                                                            <option value="NONE">{t("experiences.refundNone", "NONE")}</option>
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <EditableField label={t("experiences.refundPolicy", "Refund Policy")} value={form.refund_policy} editMode={false} />
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Experience Deposit Rules */}
                            <Card className="border-border/60 shadow-sm">
                                <CardHeader className="border-b bg-muted/20 pb-4">
                                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                        <DollarSign className="w-4 h-4 mr-2" /> {t("experiences.standaloneDepositRules", "Standalone Deposit Rules")}
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
                                                    {t("experiences.depositRequiredCb", "Deposit Required on Independent Bookings")}
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
                                                {form.experience_type === "HOTEL" ? (
                                                    <EditableField label={t("experiences.ttlDays", "TTL (Days)")} type="number" value={form.deposit_ttl_days} onChange={(v) => handleFieldChange("deposit_ttl_days", v)} editMode={editMode} />
                                                ) : (
                                                    <EditableField label={t("experiences.ttlHours", "TTL (Hours)")} type="number" value={form.deposit_ttl_hours} onChange={(v) => handleFieldChange("deposit_ttl_hours", v)} editMode={editMode} />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right Column - Metadata */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">{t("experiences.systemInfo", "System Information")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("experiences.createdOn", "Created On")}</Label>
                                <p className="text-sm font-medium">{exp?.creation ? new Date(exp.creation).toLocaleString() : "—"}</p>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{t("experiences.lastModified", "Last Modified")}</Label>
                                <p className="text-sm font-medium">{exp?.modified ? new Date(exp.modified).toLocaleString() : "—"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center"><Settings className="w-4 h-4 mr-2" /> {t("experiences.bookingRules", "Booking Rules")}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            {editMode ? (
                                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={!!form.manual_confirmation}
                                            onChange={(e) => handleFieldChange("manual_confirmation", e.target.checked ? 1 : 0)}
                                            className="rounded border-gray-300 text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                        />
                                        {t("experiences.requiresManualConfirmation", "Requires Manual Confirmation")}
                                    </label>
                                    <p className="text-xs text-muted-foreground ml-6">{t("experiences.manualConfDesc", "If enabled, bookings cannot be auto-confirmed without human agent approval.")}</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <div className="font-medium text-sm py-2 px-0 flex items-center gap-2">
                                        <span className={`w-3 h-3 rounded-full ${form.manual_confirmation ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                        {form.manual_confirmation ? t("experiences.manualConfReq", "Manual Confirmation Required") : t("experiences.instantAutoBooking", "Instant Auto-Booking Enabled")}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-primary">{t("experiences.actions", "Experience Actions")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                            <div className="flex flex-col gap-2">
                                {exp?.status === "ONLINE" ? (
                                    <button onClick={() => handleSetStatus("OFFLINE")} disabled={updateMutation.isPending} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                        <span>{t("experiences.takeOffline", "Take Experience Offline")}</span>
                                    </button>
                                ) : (
                                    <button onClick={() => handleSetStatus("ONLINE")} disabled={updateMutation.isPending} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                        <span>{t("experiences.publishOnline", "Publish Experience Online")}</span>
                                    </button>
                                )}
                                <button onClick={() => navigate(`/cheese/routes?add_experience=${encodeURIComponent(id)}`)} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium flex items-center justify-between">
                                    <span className="flex items-center"><LinkIcon className="w-4 h-4 mr-2" /> {t("experiences.addToRoute", "Add to Route Template")}</span>
                                </button>
                                <button type="button" onClick={() => { setNewId(id); setRenameOpen(true); }} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium">
                                    {t("experiences.renameExperience", "Rename Experience Name")}
                                </button>
                                <button onClick={() => navigate(`/cheese/tickets?experience=${encodeURIComponent(id)}`)} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium">
                                    {t("experiences.viewTickets", "View Tickets")}
                                </button>
                                <button onClick={() => navigate(`/cheese/booking-policy?experience=${encodeURIComponent(id)}`)} className="text-sm text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-primary font-medium">
                                    {t("experiences.bookingPolicy", "Booking Policy")}
                                </button>
                                <button
                                    onClick={() => {
                                        if (window.confirm(t("experiences.deleteConfirm", "Delete this experience? This will also delete its slots. This cannot be undone."))) {
                                            experienceService.deleteExperience(id)
                                                .then(() => { toast.success(t("experiences.deleteSuccess", "Experience deleted")); navigate("/cheese/experiences"); })
                                                .catch((err) => toast.error(err?.message || t("experiences.deleteError", "Failed to delete experience")));
                                        }
                                    }}
                                    className="text-sm text-left px-3 py-2 rounded-md hover:bg-red-500/10 transition-colors text-red-600 dark:text-red-400 font-medium flex items-center"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" /> {t("experiences.deleteExperience", "Delete Experience")}
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            <InlineDocumentUploadDialog
                open={uploadOpen}
                onClose={() => setUploadOpen(false)}
                entityType={uploadTarget.entityType}
                entityId={uploadTarget.entityId}
                onUploaded={handleDocumentUploaded}
            />
            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t("experiences.renameExperienceId", "Rename Experience ID")}</DialogTitle>
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
