import React, { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BadgePercent, Plus, Trash2, RefreshCw, Pencil, Gift } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CompanySelect from "@/components/CompanySelect";
import { useFrappeList, useFrappeCreate, useFrappeUpdate } from "@/lib/useApiData";
import { useHotelAccess } from "@/lib/useHotelAccess";
import { apiRequest } from "@/api/client";

const EMPTY = {
    promo_name: "", discount_type: "PERCENT", percent: "", free_tickets: "",
    date_from: "", date_to: "", is_active: true, all_experiences: false,
    experiences: [], requirements: [{ age_group: "", min_people: "1" }],
};

export default function Promotions() {
    const { t } = useTranslation();
    const { isAdmin, userCompanies } = useHotelAccess();
    const ownCompany = (Array.isArray(userCompanies) && userCompanies[0]) || "";
    const [company, setCompany] = useState("");
    const effectiveCompany = isAdmin ? company : ownCompany;

    const { data: promos = [], isLoading, refetch } = useFrappeList("Cheese Promotion", {
        filters: effectiveCompany ? { company: effectiveCompany } : {},
        fields: ["name", "company", "promo_name", "discount_type", "percent", "free_tickets", "is_active", "date_from", "date_to", "all_experiences"],
        pageSize: 200,
    });
    const { data: experiences = [] } = useFrappeList("Cheese Experience", {
        enabled: !!effectiveCompany,
        filters: { company: effectiveCompany },
        fields: ["name"],
        pageSize: 500,
    });
    const { data: ageGroups = [] } = useFrappeList("Cheese Age Group", {
        enabled: !!effectiveCompany,
        filters: { company: effectiveCompany },
        fields: ["name", "group_name", "min_age", "max_age"],
        pageSize: 100,
    });

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const createMutation = useFrappeCreate("Cheese Promotion");
    const updateMutation = useFrappeUpdate("Cheese Promotion");

    const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
    const openEdit = async (p) => {
        try {
            const res = await apiRequest(`/api/resource/${encodeURIComponent("Cheese Promotion")}/${encodeURIComponent(p.name)}`);
            const doc = res?.data?.data || {};
            setEditing(p);
            setForm({
                promo_name: doc.promo_name || "",
                discount_type: doc.discount_type || "PERCENT",
                percent: String(doc.percent ?? ""),
                free_tickets: String(doc.free_tickets ?? ""),
                date_from: doc.date_from || "",
                date_to: doc.date_to || "",
                is_active: Boolean(doc.is_active),
                all_experiences: Boolean(doc.all_experiences),
                experiences: (doc.experiences || []).map(r => r.experience),
                requirements: (doc.requirements || []).map(r => ({ age_group: r.age_group || "", min_people: String(r.min_people ?? "1") })),
            });
            setDialogOpen(true);
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        }
    };

    const setReq = (i, key, value) => setForm(f => ({
        ...f,
        requirements: f.requirements.map((r, idx) => idx === i ? { ...r, [key]: value } : r),
    }));

    const handleSave = () => {
        if (!form.promo_name.trim() || !form.date_from || !form.date_to) {
            toast.error(t("promotions.required", "Nombre y rango de fechas son requeridos"));
            return;
        }
        const requirements = form.requirements
            .filter(r => parseInt(r.min_people) > 0)
            .map(r => ({ age_group: r.age_group || null, min_people: parseInt(r.min_people) }));
        if (requirements.length === 0) {
            toast.error(t("promotions.reqLineRequired", "Agrega al menos una línea de requisitos"));
            return;
        }
        if (!form.all_experiences && form.experiences.length === 0) {
            toast.error(t("promotions.expRequired", "Selecciona experiencias o marca todas"));
            return;
        }
        const payload = {
            promo_name: form.promo_name.trim(),
            discount_type: form.discount_type,
            percent: form.discount_type === "PERCENT" ? parseFloat(form.percent) || 0 : 0,
            free_tickets: form.discount_type === "FREE_TICKETS" ? parseInt(form.free_tickets) || 0 : 0,
            date_from: form.date_from,
            date_to: form.date_to,
            is_active: form.is_active ? 1 : 0,
            all_experiences: form.all_experiences ? 1 : 0,
            experiences: form.all_experiences ? [] : form.experiences.map(e => ({ experience: e })),
            requirements,
        };
        const done = () => { toast.success(t("common.saved", "Guardado")); setDialogOpen(false); refetch(); };
        const fail = (err) => toast.error(err?.message || t("common.failed", "Error"));
        if (editing) {
            updateMutation.mutate({ name: editing.name, data: payload }, { onSuccess: done, onError: fail });
        } else {
            if (!effectiveCompany) { toast.error(t("promotions.companyRequired", "Selecciona un establecimiento")); return; }
            createMutation.mutate({ ...payload, company: effectiveCompany }, { onSuccess: done, onError: fail });
        }
    };

    const handleDelete = async (p) => {
        if (!window.confirm(t("promotions.deleteConfirm", "¿Eliminar esta promoción?"))) return;
        try {
            await apiRequest(`/api/resource/${encodeURIComponent("Cheese Promotion")}/${encodeURIComponent(p.name)}`, { method: "DELETE" });
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
                        <BadgePercent className="w-6 h-6 text-cheese-600" />
                        {t("promotions.title", "Promociones")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("promotions.description", "Descuentos automáticos: cuando una reserva cumple TODAS las líneas de requisitos de una promo activa, el descuento se aplica solo y queda visible en la reserva.")}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
                    <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-1" /> {t("promotions.new", "Nueva promoción")}
                    </Button>
                </div>
            </div>

            {isAdmin && (
                <div className="max-w-xs space-y-1">
                    <Label>{t("common.company", "Establecimiento")}</Label>
                    <CompanySelect value={company} onChange={setCompany} />
                </div>
            )}

            <div className="space-y-2">
                {isLoading ? (
                    [1, 2].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)
                ) : promos.length === 0 ? (
                    <Card><CardContent className="py-12 text-center text-muted-foreground">
                        {t("promotions.empty", "Sin promociones. Ej: 2 adultos + 2 niños → 1 entrada de niño gratis.")}
                    </CardContent></Card>
                ) : (
                    promos.map((p) => (
                        <Card key={p.name} className="glass-surface">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm">{p.promo_name}</p>
                                    <p className="text-xs text-muted-foreground">{p.date_from} → {p.date_to}{isAdmin ? ` • ${p.company}` : ""}</p>
                                </div>
                                <Badge className="bg-cheese-500/15 text-cheese-700">
                                    {p.discount_type === "PERCENT"
                                        ? <>−{p.percent}%</>
                                        : <><Gift className="w-3 h-3 mr-1" /> {p.free_tickets} {t("promotions.free", "gratis")}</>}
                                </Badge>
                                {p.all_experiences ? <Badge variant="outline">{t("promotions.allExp", "Todas las experiencias")}</Badge> : null}
                                <Badge variant="outline" className={p.is_active ? "border-emerald-500/50 text-emerald-600" : "text-muted-foreground"}>
                                    {p.is_active ? t("common.active", "Activa") : t("common.inactive", "Inactiva")}
                                </Badge>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(p)}><Trash2 className="w-4 h-4" /></Button>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? t("promotions.edit", "Editar promoción") : t("promotions.new", "Nueva promoción")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1 col-span-2">
                                <Label>{t("promotions.name", "Nombre")}</Label>
                                <Input placeholder="Familias fin de semana" value={form.promo_name} onChange={(e) => setForm(f => ({ ...f, promo_name: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("promotions.type", "Tipo de descuento")}</Label>
                                <select value={form.discount_type} onChange={(e) => setForm(f => ({ ...f, discount_type: e.target.value }))}
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm">
                                    <option value="PERCENT">{t("promotions.typePercent", "% de descuento sobre el precio original")}</option>
                                    <option value="FREE_TICKETS">{t("promotions.typeFree", "X entradas gratis")}</option>
                                </select>
                            </div>
                            {form.discount_type === "PERCENT" ? (
                                <div className="space-y-1">
                                    <Label>{t("promotions.percent", "% de descuento")}</Label>
                                    <Input type="number" min="0" max="100" value={form.percent} onChange={(e) => setForm(f => ({ ...f, percent: e.target.value }))} />
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <Label>{t("promotions.freeTickets", "Entradas gratis")}</Label>
                                    <Input type="number" min="1" value={form.free_tickets} onChange={(e) => setForm(f => ({ ...f, free_tickets: e.target.value }))} />
                                </div>
                            )}
                            <div className="space-y-1">
                                <Label>{t("promotions.from", "Desde")}</Label>
                                <Input type="date" value={form.date_from} onChange={(e) => setForm(f => ({ ...f, date_from: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label>{t("promotions.to", "Hasta")}</Label>
                                <Input type="date" value={form.date_to} onChange={(e) => setForm(f => ({ ...f, date_to: e.target.value }))} />
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                            {t("promotions.active", "Promoción activa")}
                        </label>

                        <div className="space-y-2 border border-border rounded-lg p-3">
                            <Label>{t("promotions.requirements", "Requisitos de match (deben cumplirse TODAS las líneas)")}</Label>
                            {form.requirements.map((r, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <select value={r.age_group} onChange={(e) => setReq(i, "age_group", e.target.value)}
                                        className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm">
                                        <option value="">{t("promotions.allAges", "Todos (cualquier edad)")}</option>
                                        {ageGroups.map(g => (
                                            <option key={g.name} value={g.name}>{g.group_name} ({g.min_age}-{g.max_age})</option>
                                        ))}
                                    </select>
                                    <Input type="number" min="1" className="w-28" placeholder="mín." value={r.min_people}
                                        onChange={(e) => setReq(i, "min_people", e.target.value)} />
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0"
                                        disabled={form.requirements.length === 1}
                                        onClick={() => setForm(f => ({ ...f, requirements: f.requirements.filter((_, idx) => idx !== i) }))}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, requirements: [...f.requirements, { age_group: "", min_people: "1" }] }))}>
                                <Plus className="w-3.5 h-3.5 mr-1" /> {t("promotions.addLine", "Agregar línea")}
                            </Button>
                            <p className="text-xs text-muted-foreground">{t("promotions.reqHint", "Cada línea: cantidad mínima de personas de un grupo etario (o de cualquier edad).")}</p>
                        </div>

                        <div className="space-y-2 border border-border rounded-lg p-3">
                            <label className="flex items-center gap-2 text-sm cursor-pointer font-medium">
                                <input type="checkbox" checked={form.all_experiences} onChange={(e) => setForm(f => ({ ...f, all_experiences: e.target.checked }))} />
                                {t("promotions.allExpCheck", "Aplicar a todas las experiencias del establecimiento")}
                            </label>
                            {!form.all_experiences && (
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                    {experiences.map((exp) => (
                                        <label key={exp.name} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input type="checkbox" checked={form.experiences.includes(exp.name)}
                                                onChange={() => setForm(f => ({
                                                    ...f,
                                                    experiences: f.experiences.includes(exp.name)
                                                        ? f.experiences.filter(x => x !== exp.name)
                                                        : [...f.experiences, exp.name],
                                                }))} />
                                            {exp.name}
                                        </label>
                                    ))}
                                    {experiences.length === 0 && <p className="text-xs text-muted-foreground">{t("promotions.noExperiences", "Selecciona un establecimiento para listar sus experiencias")}</p>}
                                </div>
                            )}
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
