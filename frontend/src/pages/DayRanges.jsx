import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarRange, Plus, Trash2, RefreshCw, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CompanySelect from "@/components/CompanySelect";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
import { useFrappeList, useFrappeCreate, useFrappeUpdate } from "@/lib/useApiData";
import { useHotelAccess } from "@/lib/useHotelAccess";
import { apiRequest } from "@/api/client";

/**
 * Nomenclator of custom weekday ranges per establishment (mirror of Age
 * Groups). 0 = Monday … 6 = Sunday; day_to < day_from wraps around the week.
 * Ranges MAY overlap here (alternative schemes can coexist); the non-overlap
 * restriction is enforced on the price lines that use them.
 */

export const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const dayRangeLabel = (from, to) =>
    from === to ? DAY_LABELS[from] : `${DAY_LABELS[from]} – ${DAY_LABELS[to]}`;

const EMPTY = { range_name: "", day_from: "0", day_to: "4" };

export default function DayRanges() {
    const { t } = useTranslation();
    const { isAdmin, userCompanies } = useHotelAccess();
    const ownCompany = (Array.isArray(userCompanies) && userCompanies[0]) || "";
    const [company, setCompany] = useState("");
    const { activeEstablishment } = useActiveEstablishment();
    React.useEffect(() => { setCompany(activeEstablishment); }, [activeEstablishment]);

    const effectiveCompany = isAdmin ? company : ownCompany;

    const { data: ranges = [], isLoading, refetch } = useFrappeList("Cheese Day Range", {
        filters: effectiveCompany ? { company: effectiveCompany } : {},
        fields: ["name", "company", "range_name", "day_from", "day_to"],
        pageSize: 200,
    });

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const createMutation = useFrappeCreate("Cheese Day Range");
    const updateMutation = useFrappeUpdate("Cheese Day Range");

    const sorted = useMemo(
        () => [...ranges].sort((a, b) => (a.day_from ?? 0) - (b.day_from ?? 0)),
        [ranges]
    );

    const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
    const openEdit = (r) => {
        setEditing(r);
        setForm({ range_name: r.range_name, day_from: String(r.day_from), day_to: String(r.day_to) });
        setDialogOpen(true);
    };

    const handleSave = () => {
        const payload = {
            range_name: form.range_name.trim(),
            day_from: parseInt(form.day_from),
            day_to: parseInt(form.day_to),
        };
        if (!payload.range_name || isNaN(payload.day_from) || isNaN(payload.day_to)) {
            toast.error(t("dayRanges.required", "Nombre y rango de días son requeridos"));
            return;
        }
        const done = () => { toast.success(t("common.saved", "Guardado")); setDialogOpen(false); refetch(); };
        const fail = (err) => toast.error(err?.message || t("common.failed", "Error"));
        if (editing) {
            updateMutation.mutate({ name: editing.name, data: payload }, { onSuccess: done, onError: fail });
        } else {
            const target = effectiveCompany;
            if (!target) { toast.error(t("dayRanges.companyRequired", "Selecciona una empresa")); return; }
            createMutation.mutate({ ...payload, company: target }, { onSuccess: done, onError: fail });
        }
    };

    const handleDelete = async (r) => {
        if (!window.confirm(t("dayRanges.deleteConfirm", "¿Eliminar este rango de días? Las líneas de precio que lo usen dejarán de aplicar."))) return;
        try {
            await apiRequest(`/api/resource/${encodeURIComponent("Cheese Day Range")}/${encodeURIComponent(r.name)}`, { method: "DELETE" });
            toast.success(t("common.deleted", "Eliminado"));
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    const daySelect = (value, onChange) => (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
            {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-3xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <CalendarRange className="w-6 h-6 text-cheese-600" />
                        {t("dayRanges.title", "Rangos de Días")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("dayRanges.description", "Nomenclador de rangos de días de la semana para las líneas de precios (ej: Lunes–Jueves, Viernes–Domingo). En una misma experiencia no se pueden usar rangos que se solapen.")}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
                    <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-1" /> {t("dayRanges.new", "Nuevo rango")}
                    </Button>
                </div>
            </div>

            <div className="space-y-2">
                {isLoading ? (
                    [1, 2, 3].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)
                ) : sorted.length === 0 ? (
                    <Card><CardContent className="py-12 text-center text-muted-foreground">
                        {t("dayRanges.empty", "Sin rangos de días definidos. Ej: Lunes–Jueves y Viernes–Domingo.")}
                    </CardContent></Card>
                ) : (
                    sorted.map((r) => (
                        <Card key={r.name} className="glass-surface">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm">{r.range_name}</p>
                                    {isAdmin && <p className="text-xs text-muted-foreground">{r.company}</p>}
                                </div>
                                <Badge variant="outline">{dayRangeLabel(r.day_from, r.day_to)}</Badge>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(r)}><Trash2 className="w-4 h-4" /></Button>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{editing ? t("dayRanges.edit", "Editar rango de días") : t("dayRanges.new", "Nuevo rango")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {isAdmin && !editing && (
                            <div className="space-y-1">
                                <Label>{t("common.company", "Empresa")} <span className="text-red-500">*</span></Label>
                                <CompanySelect value={company} onChange={setCompany} />
                            </div>
                        )}
                        {isAdmin && editing && (
                            <div className="space-y-1">
                                <Label>{t("common.company", "Empresa")}</Label>
                                <p className="text-sm font-medium">{editing.company}</p>
                            </div>
                        )}
                        <div className="space-y-1">
                            <Label>{t("dayRanges.name", "Nombre")}</Label>
                            <Input placeholder={t("dayRanges.namePh", "Lunes a Jueves")} value={form.range_name} onChange={(e) => setForm(f => ({ ...f, range_name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>{t("dayRanges.dayFrom", "Desde")}</Label>
                                {daySelect(form.day_from, (v) => setForm(f => ({ ...f, day_from: v })))}
                            </div>
                            <div className="space-y-1">
                                <Label>{t("dayRanges.dayTo", "Hasta")}</Label>
                                {daySelect(form.day_to, (v) => setForm(f => ({ ...f, day_to: v })))}
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t("dayRanges.wrapHint", "Ambos días inclusive. Si \"Hasta\" es anterior a \"Desde\", el rango cruza el fin de semana (ej: Viernes–Lunes).")}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)}>{t("common.cancel", "Cancelar")}</Button>
                        <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={handleSave}>
                            {t("common.save", "Guardar")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
