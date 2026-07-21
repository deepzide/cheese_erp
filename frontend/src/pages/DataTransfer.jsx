import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, Download, Upload, AlertTriangle, RefreshCw, Loader2, FileJson } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, unwrapFrappeMethodData } from "@/api/client";
import { useHotelAccess } from "@/lib/useHotelAccess";

const BASE = "/api/method/cheese.api.v1.data_transfer_controller";
const today = () => new Date().toISOString().slice(0, 10);

const downloadJson = (obj, filename) => {
    const blob = new Blob([JSON.stringify(obj, null, 0)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export default function DataTransfer() {
    const { t } = useTranslation();
    const { isAdmin, isLoading: accessLoading } = useHotelAccess();
    const [conflict, setConflict] = useState("update");
    const [busy, setBusy] = useState(null);          // entity key or "all" being exported
    const [pending, setPending] = useState(null);    // parsed payload awaiting confirmation
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState(null);      // import result summary
    const fileRef = useRef(null);

    const { data: entities = [], isLoading, refetch } = useQuery({
        queryKey: ["data-transfer-entities"],
        enabled: isAdmin,
        queryFn: async () => {
            const res = await apiRequest(`${BASE}.list_entities`);
            return unwrapFrappeMethodData(res, {})?.entities || [];
        },
    });

    if (!accessLoading && !isAdmin) {
        return (
            <div className="p-6">
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                    {t("dataTransfer.adminOnly", "Solo un superadministrador puede transferir datos.")}
                </CardContent></Card>
            </div>
        );
    }

    const exportOne = async (e) => {
        try {
            setBusy(e.key);
            const res = await apiRequest(`${BASE}.export_entity?entity=${encodeURIComponent(e.key)}`);
            const payload = unwrapFrappeMethodData(res, {});
            downloadJson(payload, `cheese-${e.key}-${today()}.json`);
            toast.success(t("dataTransfer.exported", "Exportado: {{n}} registro(s)", { n: payload?.count ?? 0 }));
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setBusy(null);
        }
    };

    const exportAll = async () => {
        try {
            setBusy("all");
            toast.info(t("dataTransfer.exportingAll", "Exportando todo, puede tardar…"));
            const res = await apiRequest(`${BASE}.export_all`);
            const payload = unwrapFrappeMethodData(res, {});
            downloadJson(payload, `cheese-bundle-${today()}.json`);
            const total = (payload?.entities || []).reduce((s, b) => s + (b.count || 0), 0);
            toast.success(t("dataTransfer.exportedAll", "Bundle exportado: {{n}} registro(s)", { n: total }));
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setBusy(null);
        }
    };

    const onPickFile = (ev) => {
        const file = ev.target.files?.[0];
        ev.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const obj = JSON.parse(reader.result);
                if (!obj || (!obj.records && !obj.entities)) throw new Error("bad");
                setPending(obj);
            } catch {
                toast.error(t("dataTransfer.invalidFile", "Archivo inválido: debe ser un JSON exportado por esta herramienta."));
            }
        };
        reader.readAsText(file);
    };

    const pendingSummary = () => {
        if (!pending) return { label: "", count: 0 };
        if (pending.entities) {
            const count = pending.entities.reduce((s, b) => s + (b.count || 0), 0);
            return { label: t("dataTransfer.bundle", "Bundle ({{n}} entidades)", { n: pending.entities.length }), count };
        }
        return { label: pending.entity, count: pending.count ?? (pending.records || []).length };
    };

    const runImport = async () => {
        if (!pending) return;
        try {
            setImporting(true);
            const res = await apiRequest(`${BASE}.import_data`, {
                method: "POST",
                body: JSON.stringify({ payload: pending, conflict }),
            });
            const data = unwrapFrappeMethodData(res, {});
            setResult(data?.results || []);
            setPending(null);
            const failed = (data?.results || []).reduce((s, r) => s + (r.failed?.length || 0), 0);
            if (failed) toast.warning(t("dataTransfer.importedWithErrors", "Importado con {{n}} error(es)", { n: failed }));
            else toast.success(t("dataTransfer.imported", "Importación completada"));
            refetch();
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setImporting(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-4xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Database className="w-6 h-6 text-cheese-600" />
                        {t("dataTransfer.title", "Importar / Exportar datos")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("dataTransfer.description", "Exporta los datos de producción e impórtalos en otra instancia de pruebas. La importación sobrescribe registros con el mismo ID.")}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading}>
                        <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </div>

            {/* Import warning + conflict strategy + global actions */}
            <Card className="border-amber-500/40 bg-amber-500/5">
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <p>{t("dataTransfer.warning", "Importar modifica datos de esta instancia. Hazlo solo en una instancia de pruebas y con un respaldo previo. Company y Usuarios son sensibles (contabilidad, roles) y pueden requerir que sus dependencias ya existan en el destino.")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{t("dataTransfer.onConflict", "Si el ID ya existe")}:</span>
                            <select value={conflict} onChange={(e) => setConflict(e.target.value)}
                                className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                                <option value="update">{t("dataTransfer.update", "Actualizar")}</option>
                                <option value="skip">{t("dataTransfer.skip", "Omitir")}</option>
                            </select>
                        </div>
                        <div className="flex-1" />
                        <Button variant="outline" size="sm" onClick={exportAll} disabled={busy === "all"}>
                            {busy === "all" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                            {t("dataTransfer.exportAll", "Exportar todo")}
                        </Button>
                        <Button size="sm" className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={() => fileRef.current?.click()}>
                            <Upload className="w-4 h-4 mr-1" /> {t("dataTransfer.importFile", "Importar archivo")}
                        </Button>
                        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onPickFile} />
                    </div>
                </CardContent>
            </Card>

            {/* Per-entity list */}
            <div className="space-y-2">
                {isLoading ? (
                    [1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)
                ) : (
                    entities.map((e) => (
                        <Card key={e.key} className="glass-surface">
                            <CardContent className="p-3 flex items-center gap-3">
                                <FileJson className="w-4 h-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                                        {e.label}
                                        {e.core && <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">{t("dataTransfer.sensitive", "sensible")}</Badge>}
                                        {e.files && <Badge variant="outline" className="text-[10px]">{t("dataTransfer.withFiles", "incluye archivos")}</Badge>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{e.doctype} · {t("dataTransfer.records", "{{n}} registros", { n: e.count })}</p>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => exportOne(e)} disabled={busy === e.key || e.count === 0}>
                                    {busy === e.key ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                                    {t("dataTransfer.export", "Exportar")}
                                </Button>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Confirm import */}
            <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4" /> {t("dataTransfer.confirmTitle", "Confirmar importación")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 text-sm">
                        <p>{t("dataTransfer.confirmBody", "Vas a importar {{label}} con {{count}} registro(s).", pendingSummary())}</p>
                        <p className="text-muted-foreground text-xs">
                            {t("dataTransfer.confirmConflict", "Registros con ID existente: {{mode}}.", { mode: conflict === "update" ? t("dataTransfer.update", "Actualizar") : t("dataTransfer.skip", "Omitir") })}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setPending(null)}>{t("common.cancel", "Cancelar")}</Button>
                        <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={runImport} disabled={importing}>
                            {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                            {t("dataTransfer.import", "Importar")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Result summary */}
            <Dialog open={!!result} onOpenChange={(o) => { if (!o) setResult(null); }}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t("dataTransfer.resultTitle", "Resultado de la importación")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        {(result || []).map((r, i) => (
                            <div key={i} className="rounded-md border border-border p-3 text-sm">
                                <p className="font-semibold">{r.entity}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t("dataTransfer.created", "Creados")}: {r.created ?? 0} · {t("dataTransfer.updated", "Actualizados")}: {r.updated ?? 0} · {t("dataTransfer.skipped", "Omitidos")}: {r.skipped ?? 0} · {t("dataTransfer.failed", "Errores")}: {r.failed?.length ?? 0}
                                </p>
                                {r.failed?.length > 0 && (
                                    <ul className="mt-1 text-xs text-red-600 dark:text-red-400 list-disc pl-4 max-h-32 overflow-y-auto">
                                        {r.failed.slice(0, 20).map((f, fi) => <li key={fi}>{f.name}: {f.error}</li>)}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setResult(null)}>{t("common.close", "Cerrar")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
