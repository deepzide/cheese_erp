import React, { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarRange, Plus, Trash2, RefreshCw, Pencil, TrendingUp, TrendingDown } from "lucide-react";
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

const EMPTY = { season_name: "", percent: "", date_from: "", date_to: "", is_active: true, experiences: [] };

export default function Seasons() {
    const { t } = useTranslation();
    const { isAdmin, userCompanies } = useHotelAccess();
    const ownCompany = (Array.isArray(userCompanies) && userCompanies[0]) || "";
    const [company, setCompany] = useState("");
    const { activeEstablishment } = useActiveEstablishment();
    React.useEffect(() => { setCompany(activeEstablishment); }, [activeEstablishment]);

    const effectiveCompany = isAdmin ? company : ownCompany;

    const { data: seasons = [], isLoading, refetch } = useFrappeList("Cheese Season", {
        filters: effectiveCompany ? { company: effectiveCompany } : {},
        fields: ["name", "company", "season_name", "percent", "is_active", "date_from", "date_to"],
        pageSize: 200,
    });
    const { data: experiences = [] } = useFrappeList("Cheese Experience", {
        enabled: !!effectiveCompany,
        filters: { company: effectiveCompany },
        fields: ["name"],
        pageSize: 500,
    });

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const createMutation = useFrappeCreate("Cheese Season");
    const updateMutation = useFrappeUpdate("Cheese Season");

    const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
    const openEdit = async (s) => {
        try {
            const res = await apiRequest(`/api/resource/${encodeURIComponent("Cheese Season")}/${encodeURIComponent(s.name)}`);
            const doc = res?.data?.data || {};
            setEditing(s);
            setForm({
                season_name: doc.season_name || "",
                percent: String(doc.percent ?? ""),
                date_from: doc.date_from || "",
                date_to: doc.date_to || "",
                is_active: Boolean(doc.is_active),
                experiences: (doc.experiences || []).map(r => r.experience),
            });
            setDialogOpen(true);
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    const toggleExperience = (name) => setForm(f => ({
        ...f,
        experiences: f.experiences.includes(name)
            ? f.experiences.filter(x => x !== name)
            : [...f.experiences, name],
    }));

    const handleSave = () => {
        const percent = parseFloat(form.percent);
        if (!form.season_name.trim() || isNaN(percent) || !form.date_from || !form.date_to) {
            toast.error(t("seasons.required", "Nombre, porcentaje y rango de fechas son requeridos"));
            return;
        }
        const payload = {
            season_name: form.season_name.trim(),
            percent,
            date_from: form.date_from,
            date_to: form.date_to,
            is_active: form.is_active ? 1 : 0,
            experiences: form.experiences.map(e => ({ experience: e })),
        };
        const done = () => { toast.success(t("common.saved", "Guardado")); setDialogOpen(false); refetch(); };
        const fail = (err) => toast.error(err?.message || t("common.failed", "Error"));
        if (editing) {
            updateMutation.mutate({ name: editing.name, data: payload }, { onSuccess: done, onError: fail });
        } else {
            if (!effectiveCompany) { toast.error(t("seasons.companyRequired", "Selecciona una empresa")); return; }
            createMutation.mutate({ ...payload, company: effectiveCompany }, { onSuccess: done, onError: fail });
        }
    };

    const handleDelete = async (s) => {
        if (!window.confirm(t("seasons.deleteConfirm", "¿Eliminar esta temporada?"))) return;
        try {
            await apiRequest(`/api/resource/${encodeURIComponent("Cheese Season")}/${encodeURIComponent(s.name)}`, { method: "DELETE" });
            toast.success(t("common.deleted", "Eliminado"));
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-4xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <CalendarRange className="w-6 h-6 text-cheese-600" />
                        {t("seasons.title", "Temporadas")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("seasons.description", "Ajuste de 2do nivel: el % se aplica sobre todos los precios definidos en las experiencias (lunes-viernes, fin de semana, grupos etarios y precios en ruta) durante el rango de fechas.")}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
                    <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-1" /> {t("seasons.new", "Nueva temporada")}
                    </Button>
                </div>
            </div>

            <div className="space-y-2">
                {isLoading ? (
                    [1, 2].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)
                ) : seasons.length === 0 ? (
                    <Card><CardContent className="py-12 text-center text-muted-foreground">
                        {t("seasons.empty", "Sin temporadas. Ej: Temporada alta enero-febrero +25%.")}
                    </CardContent></Card>
                ) : (
                    seasons.map((s) => (
                        <Card key={s.name} className="glass-surface">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm">{s.season_name}</p>
                                    <p className="text-xs text-muted-foreground">{s.date_from} → {s.date_to}{isAdmin ? ` • ${s.company}` : ""}</p>
                                </div>
                                <Badge className={s.percent >= 0 ? "bg-red-500/15 text-red-700" : "bg-emerald-500/15 text-emerald-700"}>
                                    {s.percent >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                    {s.percent > 0 ? "+" : ""}{s.percent}%
                                </Badge>
                                <Badge variant="outline" className={s.is_active ? "border-emerald-500/50 text-emerald-600" : "text-muted-foreground"}>
                                    {s.is_active ? t("common.active", "Activa") : t("common.inactive", "Inactiva")}
                                </Badge>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(s)}><Trash2 className="w-4 h-4" /></Button>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? t("seasons.edit", "Editar temporada") : t("seasons.new", "Nueva temporada")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {isAdmin && !editing && (
                            <div className="space-y-1">
                                <Label>{t("common.company", "Empresa")} <span className="text-red-500">*</span></Label>
                                <CompanySelect value={company} onChange={setCompany} />
                                <p className="text-xs text-muted-foreground">{t("seasons.companyPickHint", "Elige la empresa para poder seleccionar sus experiencias.")}</p>
                            </div>
                        )}
                        {isAdmin && editing && (
                            <div className="space-y-1">
                                <Label>{t("common.company", "Empresa")}</Label>
                                <p className="text-sm font-medium">{editing.company}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>{t("seasons.name", "Nombre")}</Label>
                                <Input placeholder="Temporada alta" value={form.season_name} onChange={(e) => setForm(f => ({ ...f, season_name: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("seasons.percent", "% aumento (+) / descuento (−)")}</Label>
                                <Input type="number" step="0.5" placeholder="25 o -15" value={form.percent} onChange={(e) => setForm(f => ({ ...f, percent: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("seasons.from", "Desde")}</Label>
                                <Input type="date" value={form.date_from} onChange={(e) => setForm(f => ({ ...f, date_from: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("seasons.to", "Hasta")}</Label>
                                <Input type="date" value={form.date_to} onChange={(e) => setForm(f => ({ ...f, date_to: e.target.value }))} />
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                            {t("seasons.active", "Temporada activa")}
                        </label>
                        <div className="space-y-2">
                            <Label>{t("seasons.experiences", "Experiencias a las que aplica")}</Label>
                            <p className="text-xs text-muted-foreground">{t("seasons.experiencesHint", "Sin selección = aplica a todas las experiencias de la empresa.")}</p>
                            <div className="max-h-40 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
                                {experiences.map((exp) => (
                                    <label key={exp.name} className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={form.experiences.includes(exp.name)} onChange={() => toggleExperience(exp.name)} />
                                        {exp.name}
                                    </label>
                                ))}
                                {experiences.length === 0 && <p className="text-xs text-muted-foreground p-2">{t("seasons.noExperiences", "Selecciona una empresa para listar sus experiencias")}</p>}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)}>{t("common.cancel", "Cancelar")}</Button>
                        <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={handleSave}>{t("common.save", "Guardar")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
