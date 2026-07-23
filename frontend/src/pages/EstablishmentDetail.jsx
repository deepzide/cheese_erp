import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import DocumentGallery from "@/components/DocumentGallery";
import InlineDocumentUploadDialog from "@/components/InlineDocumentUploadDialog";
import { useFrappeList } from "@/lib/useApiData";
import { hotelService } from "@/api/hotelService";
import {
    Building2,
    ArrowLeft,
    RefreshCw,
    Landmark,
    Plus,
    Archive,
    ArchiveRestore,
    Trash2,
    AlertCircle,
    MapPin,
    ExternalLink,
    FileText,
    BedDouble,
    DoorOpen,
    CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { establishmentService } from "@/api/establishmentService";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const ALL_CURRENCIES = ["UYU", "USD", "EUR", "BRL", "ARS"];

export default function EstablishmentDetail() {
    const { id } = useParams();
    const companyId = id ? decodeURIComponent(id) : "";
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);

    const { data: companyDocuments = [], isLoading: companyDocumentsLoading } = useFrappeList("Cheese Document", {
        enabled: !!companyId,
        filters: {
            entity_type: "Company",
            entity_id: companyId,
        },
        fields: ["name", "title", "document_type", "file_url", "status", "language", "version", "validity_date", "creation", "entity_type"],
        pageSize: 20,
        orderBy: "creation desc",
    });

    const handleDocumentUploaded = () => {
        queryClient.invalidateQueries({ queryKey: ["frappe-list", "Cheese Document"] });
        queryClient.invalidateQueries({ queryKey: ["establishment", companyId] });
    };

    // Room types of this hotel (shown in their own card, not under Experiences)
    const { data: roomTypes = [] } = useFrappeList("Cheese Experience", {
        enabled: !!companyId,
        filters: { company: companyId, experience_type: "HOTEL" },
        fields: ["name", "status", "price_per_night", "room_size", "min_nights_stay", "currency"],
        pageSize: 100,
    });
    const roomTypeNames = new Set((roomTypes || []).map((rt) => rt.name));

    // Operational hotel stats (arrivals/departures today, rooms, occupancy)
    const { data: hotelStatsRes } = useQuery({
        queryKey: ["hotel-stats", companyId],
        enabled: !!companyId,
        queryFn: async () => {
            const res = await hotelService.getHotelStats(companyId);
            return res?.data?.message?.data || res?.data?.data || null;
        },
    });

    const { data: payload, isLoading, error, refetch } = useQuery({
        queryKey: ["establishment", companyId],
        queryFn: async () => {
            const res = await establishmentService.getEstablishmentDetails(companyId);
            const msg = res?.data?.message || {};
            if (!msg.success) {
                throw new Error(msg.error?.message || t("experiences.loadError", "Failed to load"));
            }
            return msg.data;
        },
        enabled: !!companyId,
    });

    React.useEffect(() => {
        if (payload) {
            setForm({
                company_name: payload.company_name || "",
                email: payload.email || "",
                default_currency: payload.default_currency || "UYU",
                // Empty stored value means "all accepted": reflect that by
                // pre-checking every currency so the UI matches the "Todas" label.
                accepted_currencies: (() => {
                    const parsed = String(payload.accepted_currencies || "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
                    return parsed.length ? parsed : [...ALL_CURRENCIES];
                })(),
                derive_hotel_capacity: Boolean(payload.derive_hotel_capacity),
                fx_tolerance_percent: payload.fx_tolerance_percent ?? 3,
                phone_no: payload.phone || "",
                website: payload.website || "",
                cheese_google_maps_link: payload.google_maps_link || "",
                company_description: payload.description || "",
                cheese_is_hotel: Boolean(payload.is_hotel || payload.cheese_is_hotel),
            });
        }
    }, [payload]);

    const updateMutation = useMutation({
        mutationFn: () =>
            establishmentService.updateEstablishment(companyId, {
                company_name: form.company_name,
                email: form.email,
                default_currency: form.default_currency,
                // All selected → store empty (= "all"), otherwise the explicit set.
                accepted_currencies: (form.accepted_currencies || []).length === ALL_CURRENCIES.length
                    ? ""
                    : (form.accepted_currencies || []).join(","),
                derive_hotel_capacity: form.derive_hotel_capacity ? 1 : 0,
                fx_tolerance_percent: form.fx_tolerance_percent,
                phone_no: form.phone_no,
                website: form.website,
                cheese_google_maps_link: form.cheese_google_maps_link,
                google_maps_link: form.cheese_google_maps_link,
                company_description: form.company_description,
                cheese_is_hotel: form.cheese_is_hotel ? 1 : 0,
                is_hotel: form.cheese_is_hotel ? 1 : 0,
            }),
        onSuccess: (res) => {
            const msg = res?.data?.message || {};
            if (!msg.success) {
                toast.error(msg.error?.message || t("common.failed", "Update failed"));
                return;
            }
            toast.success(t("common.saved", "Saved"));
            setEditMode(false);
            queryClient.invalidateQueries({ queryKey: ["establishment", companyId] });
            queryClient.invalidateQueries({ queryKey: ["establishments"] });
        },
        onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
    });

    const archiveMutation = useMutation({
        mutationFn: () => establishmentService.archiveEstablishment(companyId),
        onSuccess: (res) => {
            const msg = res?.data?.message || {};
            if (!msg.success) {
                toast.error(msg.error?.message || t("common.failed", "Failed"));
                return;
            }
            toast.success(t("experiences.archived", "Archived"));
            refetch();
            queryClient.invalidateQueries({ queryKey: ["establishments"] });
        },
        onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
    });

    const unarchiveMutation = useMutation({
        mutationFn: () => establishmentService.unarchiveEstablishment(companyId),
        onSuccess: (res) => {
            const msg = res?.data?.message || {};
            if (!msg.success) {
                toast.error(msg.error?.message || t("common.failed", "Failed"));
                return;
            }
            toast.success(t("experiences.unarchived", "Unarchived"));
            refetch();
            queryClient.invalidateQueries({ queryKey: ["establishments"] });
        },
        onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
    });

    const deleteMutation = useMutation({
        mutationFn: () => establishmentService.deleteEstablishment(companyId),
        onSuccess: (res) => {
            const msg = res?.data?.message || {};
            if (!msg.success) {
                toast.error(msg.error?.message || t("experiences.deleteFailedArchive", "Delete failed — archive instead if linked data exists"));
                return;
            }
            toast.success(t("common.deleted", "Deleted"));
            setDeleteOpen(false);
            queryClient.invalidateQueries({ queryKey: ["establishments"] });
            navigate("/cheese/establishments");
        },
        onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
    });

    if (!companyId) {
        return null;
    }

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <p className="text-muted-foreground mb-4">{error.message}</p>
                <Button variant="outline" onClick={() => refetch()}>
                    <RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}
                </Button>
            </div>
        );
    }

    const bankAccounts = payload?.bank_account || [];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate("/cheese/establishments")}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Building2 className="w-7 h-7 text-cheese-600" />
                            {isLoading ? <Skeleton className="h-8 w-48" /> : payload?.company_name}
                        </h1>
                        <p className="text-xs font-mono text-muted-foreground">{companyId}</p>
                    </div>
                    {!isLoading && (
                        <Badge
                            className={
                                payload?.status === "ARCHIVED"
                                    ? "bg-gray-500/15"
                                    : "bg-emerald-500/15 text-emerald-700"
                            }
                        >
                            {payload?.status || "ACTIVE"}
                        </Badge>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="w-4 h-4 mr-1" /> {t("common.refresh", "Refresh")}
                    </Button>
                    {!editMode ? (
                        <Button size="sm" onClick={() => setEditMode(true)}>
                            {t("common.edit", "Edit")}
                        </Button>
                    ) : (
                        <>
                            <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
                                {t("common.cancel", "Cancel")}
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    if (!(form.accepted_currencies || []).length) {
                                        toast.error(t("establishments.atLeastOneCurrency", "Debe aceptar al menos una moneda"));
                                        return;
                                    }
                                    updateMutation.mutate();
                                }}
                                disabled={updateMutation.isPending}
                            >
                                {t("common.save", "Save")}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {isLoading ? (
                <Skeleton className="h-40 w-full" />
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">{t("support.caseDetails", "Details")}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>{t("experiences.providerCompany", "Company name")}</Label>
                                {editMode ? (
                                    <Input
                                        value={form.company_name}
                                        onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                                    />
                                ) : (
                                    <p className="text-sm">{payload?.company_name}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>{t("common.email", "Email")}</Label>
                                {editMode ? (
                                    <Input
                                        value={form.email}
                                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                    />
                                ) : (
                                    <p className="text-sm">{payload?.email || "—"}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>{t("establishments.preferredCurrency", "Moneda preferida")}</Label>
                                {editMode ? (
                                    <select
                                        value={form.default_currency}
                                        onChange={(e) => setForm((f) => ({ ...f, default_currency: e.target.value }))}
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                                    >
                                        {["UYU","USD","EUR","BRL","ARS"].map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                ) : (
                                    <p className="text-sm">{payload?.default_currency || "UYU"}</p>
                                )}
                                <p className="text-xs text-muted-foreground">{t("establishments.preferredCurrencyHint", "Todos los montos se convierten a esta moneda.")}</p>
                            </div>
                            <div className="space-y-2">
                                <Label>{t("establishments.fxTolerance", "Tolerancia FX (%)")}</Label>
                                {editMode ? (
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={form.fx_tolerance_percent}
                                        onChange={(e) => setForm((f) => ({ ...f, fx_tolerance_percent: e.target.value }))}
                                    />
                                ) : (
                                    <p className="text-sm">{payload?.fx_tolerance_percent ?? 3}%</p>
                                )}
                                <p className="text-xs text-muted-foreground">{t("establishments.fxToleranceHint", "Margen aceptado al convertir pagos recibidos en otra moneda.")}</p>
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label>{t("establishments.acceptedCurrencies", "Monedas aceptadas")}</Label>
                                {editMode ? (
                                    <div className="flex gap-4 flex-wrap">
                                        {ALL_CURRENCIES.map((c) => (
                                            <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={(form.accepted_currencies || []).includes(c)}
                                                    onChange={(e) => setForm((f) => ({
                                                        ...f,
                                                        accepted_currencies: e.target.checked
                                                            ? [...(f.accepted_currencies || []), c]
                                                            : (f.accepted_currencies || []).filter((x) => x !== c),
                                                    }))}
                                                />
                                                {c}
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm">{String(payload?.accepted_currencies || "") || t("establishments.allCurrencies", "Todas")}</p>
                                )}
                                <p className="text-xs text-muted-foreground">{t("establishments.acceptedCurrenciesHint", "Las demás monedas se rechazan en pagos y formularios. Vacío = todas.")}</p>
                            </div>
                            {(form.cheese_is_hotel || payload?.cheese_is_hotel || payload?.is_hotel) && (
                                <div className="space-y-2 sm:col-span-2">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer font-medium">
                                        <input
                                            type="checkbox"
                                            disabled={!editMode}
                                            checked={!!form.derive_hotel_capacity}
                                            onChange={(e) => setForm((f) => ({ ...f, derive_hotel_capacity: e.target.checked }))}
                                        />
                                        {t("establishments.deriveCapacity", "Capacidad derivada de habitaciones físicas (Fase 2)")}
                                    </label>
                                    <p className="text-xs text-muted-foreground">{t("establishments.deriveCapacityHint", "La disponibilidad por noche se calcula desde las habitaciones ACTIVAS registradas menos bloqueos por mantenimiento, ignorando la capacidad manual de los slots.")}</p>
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label>{t("common.phone", "Phone")}</Label>
                                {editMode ? (
                                    <Input
                                        value={form.phone_no}
                                        onChange={(e) => setForm((f) => ({ ...f, phone_no: e.target.value }))}
                                    />
                                ) : (
                                    <p className="text-sm">{payload?.phone || "—"}</p>
                                )}
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label>{t("experiences.website", "Website")}</Label>
                                {editMode ? (
                                    <Input
                                        value={form.website}
                                        onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                                    />
                                ) : (
                                    <p className="text-sm">{payload?.website || "—"}</p>
                                )}
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label>{t("establishment.googleMapsLink", "Google Maps Link")}</Label>
                                {editMode ? (
                                    <Input
                                        type="url"
                                        value={form.cheese_google_maps_link}
                                        onChange={(e) => setForm((f) => ({ ...f, cheese_google_maps_link: e.target.value }))}
                                        placeholder={t("establishment.googleMapsPlaceholder", "https://maps.google.com/...")}
                                    />
                                ) : payload?.google_maps_link ? (
                                    <a
                                        href={payload.google_maps_link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
                                    >
                                        <MapPin className="w-4 h-4" />
                                        <span>{t("establishment.googleMaps", "Google Maps")}</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                ) : (
                                    <p className="text-sm">—</p>
                                )}
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label>{t("nav.hotels", "Hotel")}</Label>
                                {editMode ? (
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={!!form.cheese_is_hotel}
                                            onChange={(e) => setForm((f) => ({ ...f, cheese_is_hotel: e.target.checked }))}
                                            className="rounded border-input"
                                        />
                                        {t("establishment.enableHotelOptions", "Enable hotel options for this company")}
                                    </label>
                                ) : (
                                    <p className="text-sm">
                                        {payload?.is_hotel || payload?.cheese_is_hotel
                                            ? t("common.yes", "Yes")
                                            : t("common.no", "No")}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label>{t("support.description", "Description")}</Label>
                                {editMode ? (
                                    <Textarea
                                        value={form.company_description}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, company_description: e.target.value }))
                                        }
                                        className="min-h-[100px]"
                                    />
                                ) : (
                                    <p className="text-sm text-muted-foreground">{payload?.description || "—"}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="border-b bg-muted/20 pb-4">
                            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase flex items-center">
                                <FileText className="w-4 h-4 mr-2" /> {t("common.attachedDocuments", "Attached Documents")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <DocumentGallery
                                documents={companyDocuments}
                                isLoading={companyDocumentsLoading}
                                onAddClick={() => setUploadOpen(true)}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Landmark className="w-4 h-4" /> {t("experiences.bankAccounts", "Bank accounts")}
                            </CardTitle>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    navigate(`/cheese/bank-accounts/new?company=${encodeURIComponent(companyId)}`)
                                }
                            >
                                <Plus className="w-4 h-4 mr-1" /> {t("common.add", "Add")}
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {bankAccounts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t("experiences.noBankAccounts", "No active bank accounts.")}</p>
                            ) : (
                                bankAccounts.map((ba) => (
                                    <div
                                        key={ba.bank_account_id}
                                        className="flex flex-wrap justify-between gap-2 border border-border rounded-lg p-3 text-sm"
                                    >
                                        <div>
                                            <p className="font-medium">{ba.bank_name}</p>
                                            <p className="font-mono text-xs text-muted-foreground">
                                                {ba.account_number}
                                            </p>
                                        </div>
                                        <Badge variant="outline">{ba.currency}</Badge>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">{t("nav.experiences", "Experiences")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {(payload?.experiences || []).filter((ex) => !roomTypeNames.has(ex.name)).length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t("experiences.noneLinked", "None linked.")}</p>
                            ) : (
                                (payload.experiences || []).filter((ex) => !roomTypeNames.has(ex.name)).map((ex) => (
                                    <button
                                        key={ex.name}
                                        type="button"
                                        className="block w-full text-left text-sm py-2 px-3 rounded-md hover:bg-muted"
                                        onClick={() => navigate(`/cheese/experiences/${encodeURIComponent(ex.name)}`)}
                                    >
                                        {ex.experience_name || ex.name}
                                    </button>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {(payload?.is_hotel || payload?.cheese_is_hotel) && (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <DoorOpen className="w-4 h-4 text-cheese-600" />
                                    {t("roomTypes.title", "Tipos de Habitaciones")}
                                </CardTitle>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => navigate(`/cheese/hotel-availability-grid?hotel=${encodeURIComponent(companyId)}`)}
                                    >
                                        <CalendarDays className="w-4 h-4 mr-1" />
                                        {t("establishments.viewHotelAvailability", "Disponibilidad hotelera")}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => navigate(`/cheese/hotel-reservations?establishment=${encodeURIComponent(companyId)}`)}
                                    >
                                        <BedDouble className="w-4 h-4 mr-1" />
                                        {t("establishments.viewHotelReservations", "Ver reservaciones")}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {hotelStatsRes && (
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pb-3 mb-1 border-b border-border/60">
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-foreground">{hotelStatsRes.arrivals_today}</p>
                                            <p className="text-[11px] text-muted-foreground">{t("hotels.arrivalsToday", "Llegadas hoy")}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-foreground">{hotelStatsRes.departures_today}</p>
                                            <p className="text-[11px] text-muted-foreground">{t("hotels.departuresToday", "Salidas hoy")}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-foreground">{hotelStatsRes.room_types_count}</p>
                                            <p className="text-[11px] text-muted-foreground">{t("hotels.roomTypes", "Tipos de hab.")}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-foreground">{hotelStatsRes.rooms_count}</p>
                                            <p className="text-[11px] text-muted-foreground">{t("hotels.rooms", "Habitaciones")}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-cheese-700 dark:text-cheese-400">{hotelStatsRes.occupancy_7d}%</p>
                                            <p className="text-[11px] text-muted-foreground">{t("hotels.occupancy7d", "Ocupación 7 días")}</p>
                                        </div>
                                    </div>
                                )}
                                {(roomTypes || []).length === 0 ? (
                                    <p className="text-sm text-muted-foreground">{t("roomTypes.empty", "No hay tipos de habitación registrados para este alcance.")}</p>
                                ) : (
                                    roomTypes.map((rt) => (
                                        <button
                                            key={rt.name}
                                            type="button"
                                            className="w-full flex items-center justify-between text-left text-sm py-2 px-3 rounded-md hover:bg-muted"
                                            onClick={() => navigate(`/cheese/experiences/${encodeURIComponent(rt.name)}`)}
                                        >
                                            <span className="font-medium">{rt.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {rt.price_per_night ? `${rt.currency || "UYU"} ${Number(rt.price_per_night).toLocaleString("es-UY")}/noche` : ""}
                                                {rt.status ? ` · ${rt.status}` : ""}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                        {payload?.status === "ARCHIVED" ? (
                            <Button
                                variant="outline"
                                onClick={() => unarchiveMutation.mutate()}
                                disabled={unarchiveMutation.isPending}
                            >
                                <ArchiveRestore className="w-4 h-4 mr-2" /> {t("experiences.unarchive", "Unarchive")}
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                onClick={() => archiveMutation.mutate()}
                                disabled={archiveMutation.isPending}
                            >
                                <Archive className="w-4 h-4 mr-2" /> {t("experiences.archive", "Archive")}
                            </Button>
                        )}
                        <Button variant="destructive" type="button" onClick={() => setDeleteOpen(true)}>
                            <Trash2 className="w-4 h-4 mr-2" /> {t("common.delete", "Delete")}
                        </Button>
                        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>{t("experiences.deleteEstablishmentTitle", "Delete company?")}</DialogTitle>
                                    <DialogDescription>
                                        {t("experiences.deleteEstablishmentDesc", "Only allowed when there are no linked experiences, tickets, or bank accounts. Otherwise use Archive.")}
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter className="gap-2 sm:gap-0">
                                    <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                                        {t("common.cancel", "Cancel")}
                                    </Button>
                                    <Button variant="destructive" onClick={() => deleteMutation.mutate()}>
                                        {t("common.delete", "Delete")}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </>
            )}
            <InlineDocumentUploadDialog
                open={uploadOpen}
                onClose={() => setUploadOpen(false)}
                entityType="Company"
                entityId={companyId}
                onUploaded={handleDocumentUploaded}
            />
        </motion.div>
    );
}
