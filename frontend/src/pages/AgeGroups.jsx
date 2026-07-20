import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Users2, Plus, Trash2, RefreshCw, Pencil, AlertTriangle } from "lucide-react";
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

const EMPTY = { group_name: "", min_age: "", max_age: "" };
const COVERAGE_MIN = 0;
const COVERAGE_MAX = 200;

/** Integer sub-ranges of [0, 200] not covered by any age group. */
function coverageGaps(groups) {
    const ranges = groups
        .map((g) => [Number(g.min_age), Number(g.max_age)])
        .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
        .sort((x, y) => x[0] - y[0]);
    const gaps = [];
    let cursor = COVERAGE_MIN;
    for (const [a, b] of ranges) {
        if (a > cursor) gaps.push([cursor, a - 1]);
        cursor = Math.max(cursor, b + 1);
        if (cursor > COVERAGE_MAX) break;
    }
    if (cursor <= COVERAGE_MAX) gaps.push([cursor, COVERAGE_MAX]);
    return gaps;
}

const fmtGap = ([a, b]) => (a === b ? `${a}` : `${a}–${b}`);

export default function AgeGroups() {
    const { t } = useTranslation();
    const { isAdmin, userCompanies } = useHotelAccess();
    const ownCompany = (Array.isArray(userCompanies) && userCompanies[0]) || "";
    const [company, setCompany] = useState("");
    const { activeEstablishment } = useActiveEstablishment();
    React.useEffect(() => { setCompany(activeEstablishment); }, [activeEstablishment]);

    const effectiveCompany = isAdmin ? company : ownCompany;

    const { data: groups = [], isLoading, refetch } = useFrappeList("Cheese Age Group", {
        filters: effectiveCompany ? { company: effectiveCompany } : {},
        fields: ["name", "company", "group_name", "min_age", "max_age"],
        pageSize: 200,
    });

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const createMutation = useFrappeCreate("Cheese Age Group");
    const updateMutation = useFrappeUpdate("Cheese Age Group");

    const sorted = useMemo(
        () => [...groups].sort((a, b) => (a.min_age ?? 0) - (b.min_age ?? 0)),
        [groups]
    );

    // Coverage of [0, 200]: warn (banner + toast on mutation) when a range is
    // left unassigned after creating, editing or deleting a group.
    const gaps = useMemo(() => coverageGaps(sorted), [sorted]);
    const mutatedRef = useRef(false);
    useEffect(() => {
        if (!mutatedRef.current || isLoading || !effectiveCompany) return;
        mutatedRef.current = false;
        if (gaps.length) {
            toast.warning(
                t("ageGroups.coverageWarning", "Quedan rangos de edad sin cubrir (0–200): {{ranges}}", {
                    ranges: gaps.map(fmtGap).join(", "),
                })
            );
        }
    }, [gaps, isLoading, effectiveCompany, t]);

    const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
    const openEdit = (g) => {
        setEditing(g);
        setForm({ group_name: g.group_name, min_age: String(g.min_age), max_age: String(g.max_age) });
        setDialogOpen(true);
    };

    const handleSave = () => {
        const payload = {
            group_name: form.group_name.trim(),
            min_age: parseInt(form.min_age),
            max_age: parseInt(form.max_age),
        };
        if (!payload.group_name || isNaN(payload.min_age) || isNaN(payload.max_age)) {
            toast.error(t("ageGroups.required", "Nombre y rango de edades son requeridos"));
            return;
        }
        const done = () => { toast.success(t("common.saved", "Guardado")); setDialogOpen(false); mutatedRef.current = true; refetch(); };
        const fail = (err) => toast.error(err?.message || t("common.failed", "Error"));
        if (editing) {
            updateMutation.mutate({ name: editing.name, data: payload }, { onSuccess: done, onError: fail });
        } else {
            const target = effectiveCompany;
            if (!target) { toast.error(t("ageGroups.companyRequired", "Selecciona una empresa")); return; }
            createMutation.mutate({ ...payload, company: target }, { onSuccess: done, onError: fail });
        }
    };

    const handleDelete = async (g) => {
        if (!window.confirm(t("ageGroups.deleteConfirm", "¿Eliminar este grupo etario?"))) return;
        try {
            await apiRequest(`/api/resource/${encodeURIComponent("Cheese Age Group")}/${encodeURIComponent(g.name)}`, { method: "DELETE" });
            toast.success(t("common.deleted", "Eliminado"));
            mutatedRef.current = true;
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-3xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Users2 className="w-6 h-6 text-cheese-600" />
                        {t("ageGroups.title", "Grupos Etarios")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("ageGroups.description", "Nomenclador de rangos de edad para precios y promociones. Dos grupos no pueden solapar sus rangos.")}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
                    <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-1" /> {t("ageGroups.new", "Nuevo grupo")}
                    </Button>
                </div>
            </div>

            {effectiveCompany && !isLoading && gaps.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-semibold">{t("ageGroups.coverageTitle", "Cobertura incompleta de edades")}</p>
                        <p className="text-xs mt-0.5">
                            {t("ageGroups.coverageBanner", "Estos rangos de 0 a 200 años no tienen grupo asignado: {{ranges}}. Las personas con esas edades usarán el precio base.", { ranges: gaps.map(fmtGap).join(", ") })}
                        </p>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {isLoading ? (
                    [1, 2, 3].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)
                ) : sorted.length === 0 ? (
                    <Card><CardContent className="py-12 text-center text-muted-foreground">
                        {t("ageGroups.empty", "Sin grupos etarios definidos. Ej: Niños 0-12, Adultos 13-64, Jubilados 65-120.")}
                    </CardContent></Card>
                ) : (
                    sorted.map((g) => (
                        <Card key={g.name} className="glass-surface">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm">{g.group_name}</p>
                                    {isAdmin && <p className="text-xs text-muted-foreground">{g.company}</p>}
                                </div>
                                <Badge variant="outline">{g.min_age} – {g.max_age} {t("ageGroups.years", "años")}</Badge>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(g)}><Pencil className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(g)}><Trash2 className="w-4 h-4" /></Button>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{editing ? t("ageGroups.edit", "Editar grupo etario") : t("ageGroups.new", "Nuevo grupo")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {isAdmin && !editing && (
                            <div className="space-y-1">
                                <Label>{t("common.company", "Empresa")} <span className="text-red-500">*</span></Label>
                                <CompanySelect value={company} onChange={setCompany} />
                                <p className="text-xs text-muted-foreground">{t("ageGroups.companyPickHint", "Elige la empresa al que pertenece este grupo etario.")}</p>
                            </div>
                        )}
                        {isAdmin && editing && (
                            <div className="space-y-1">
                                <Label>{t("common.company", "Empresa")}</Label>
                                <p className="text-sm font-medium">{editing.company}</p>
                            </div>
                        )}
                        <div className="space-y-1">
                            <Label>{t("ageGroups.name", "Nombre")}</Label>
                            <Input placeholder="Niños" value={form.group_name} onChange={(e) => setForm(f => ({ ...f, group_name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>{t("ageGroups.minAge", "Edad mínima")}</Label>
                                <Input type="number" min="0" value={form.min_age} onChange={(e) => setForm(f => ({ ...f, min_age: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("ageGroups.maxAge", "Edad máxima")}</Label>
                                <Input type="number" min="0" value={form.max_age} onChange={(e) => setForm(f => ({ ...f, max_age: e.target.value }))} />
                            </div>
                        </div>
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
