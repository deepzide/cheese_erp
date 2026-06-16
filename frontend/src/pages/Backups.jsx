import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    Database, Download, Trash2, ShieldAlert, RefreshCw, Play, CheckCircle, AlertTriangle, FileText, Search, Settings, ChevronRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/api/client";

export default function Backups() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("backups");
    const [backups, setBackups] = useState([]);
    const [docTypes, setDocTypes] = useState([]);
    const [selectedDocTypes, setSelectedDocTypes] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [resolveDeps, setResolveDeps] = useState(true);
    const [loadingBackups, setLoadingBackups] = useState(false);
    const [loadingDocTypes, setLoadingDocTypes] = useState(false);
    const [backingUp, setBackingUp] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [dryRunning, setDryRunning] = useState(false);
    
    // Dry Run output state
    const [dryRunPlan, setDryRunPlan] = useState(null);
    
    // Safety Dialog states
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");

    // Common master DocTypes in Cheese ERP to pre-check for convenience
    const PRE_SELECTED_DOCTYPES = [
        "Company",
        "Cheese Experience",
        "Cheese Experience Slot",
        "Cheese Route",
        "Cheese Booking Policy",
        "Cheese Contact",
        "User",
        "Role",
        "DocType"
    ];

    const fetchBackups = async () => {
        setLoadingBackups(true);
        try {
            const res = await apiRequest("/api/method/cheese.api.v1.database_controller.get_backup_list");
            const data = res?.data?.message?.data || res?.data?.data || [];
            setBackups(data);
        } catch (err) {
            toast.error(err?.message || "Error al obtener la lista de respaldos");
        } finally {
            setLoadingBackups(false);
        }
    };

    const fetchDocTypes = async () => {
        setLoadingDocTypes(true);
        try {
            const res = await apiRequest("/api/method/cheese.api.v1.database_controller.get_preservable_doctypes");
            const list = res?.data?.message?.data?.doctypes || res?.data?.data?.doctypes || [];
            setDocTypes(list);
            
            // Pre-select master DocTypes if present in the fetched list
            const initialSelection = list
                .filter(dt => PRE_SELECTED_DOCTYPES.includes(dt.name))
                .map(dt => dt.name);
            setSelectedDocTypes(initialSelection);
        } catch (err) {
            toast.error(err?.message || "Error al obtener los DocTypes");
        } finally {
            setLoadingDocTypes(false);
        }
    };

    useEffect(() => {
        fetchBackups();
        fetchDocTypes();
    }, []);

    const handleCreateBackup = async () => {
        setBackingUp(true);
        const toastId = toast.loading("Creando copia de seguridad... Esto puede tardar unos minutos.");
        try {
            await apiRequest("/api/method/cheese.api.v1.database_controller.take_backup", { method: "POST" });
            toast.success("Copia de seguridad creada con éxito", { id: toastId });
            fetchBackups();
        } catch (err) {
            toast.error(err?.message || "Error al crear la copia de seguridad", { id: toastId });
        } finally {
            setBackingUp(false);
        }
    };

    const handleToggleDocType = (name) => {
        setSelectedDocTypes(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const handleSelectAll = () => {
        setSelectedDocTypes(docTypes.map(d => d.name));
    };

    const handleSelectNone = () => {
        setSelectedDocTypes([]);
    };

    const handleSelectRecommended = () => {
        const recommended = docTypes
            .filter(d => PRE_SELECTED_DOCTYPES.includes(d.name))
            .map(d => d.name);
        setSelectedDocTypes(recommended);
    };

    const handleDryRun = async () => {
        if (selectedDocTypes.length === 0) {
            toast.error("Por favor, selecciona al menos un DocType para la simulación.");
            return;
        }

        setDryRunning(true);
        setDryRunPlan(null);
        try {
            const res = await apiRequest("/api/method/cheese.api.v1.database_controller.reset_environment", {
                method: "POST",
                body: JSON.stringify({
                    doctypes: selectedDocTypes,
                    resolve_deps: resolveDeps,
                    dry_run: true
                })
            });
            const planData = res?.data?.message?.data?.plan || res?.data?.data?.plan || null;
            if (planData) {
                setDryRunPlan(planData);
                toast.success("Simulación completada con éxito.");
            } else {
                toast.error("No se recibieron datos de la simulación.");
            }
        } catch (err) {
            toast.error(err?.message || "Error al ejecutar la simulación.");
        } finally {
            setDryRunning(false);
        }
    };

    const handleExecuteReset = async () => {
        if (confirmText !== "RESTABLECER") {
            toast.error("Confirmación incorrecta. Escribe 'RESTABLECER'.");
            return;
        }

        setIsConfirmOpen(false);
        setResetting(true);
        const toastId = toast.loading("Restableciendo base de datos y restaurando maestros... Por favor, no cierres esta página.");
        try {
            const res = await apiRequest("/api/method/cheese.api.v1.database_controller.reset_environment", {
                method: "POST",
                body: JSON.stringify({
                    doctypes: selectedDocTypes,
                    resolve_deps: resolveDeps,
                    dry_run: false,
                    skip_backup: false
                })
            });
            
            toast.success("Entorno restablecido correctamente. Tu sesión se cerrará en breve...", { id: toastId });
            
            // Wait 3 seconds and redirect to login (since the DB reset wipes session data)
            setTimeout(() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = "/cheese/login";
            }, 3000);

        } catch (err) {
            toast.error(err?.message || "Error crítico al restablecer el entorno.", { id: toastId });
            setResetting(false);
        }
    };

    const filteredDocTypes = docTypes.filter(dt =>
        dt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dt.module || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Database className="w-6 h-6 text-cheese-600 animate-pulse" />
                        {t("database.title", "Base de Datos y Respaldos")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("database.description", "Administra las copias de seguridad de tu ERP o restablece el entorno preservando los datos maestros.")}
                    </p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                    <TabsTrigger value="backups" className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {t("database.backupsTab", "Copias de Seguridad")}
                    </TabsTrigger>
                    <TabsTrigger value="reset" className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        {t("database.resetTab", "Restablecer Entorno")}
                    </TabsTrigger>
                </TabsList>

                {/* Backups Tab */}
                <TabsContent value="backups" className="space-y-6">
                    <Card className="glass-surface">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle>{t("database.backupsList", "Historial de Salvas")}</CardTitle>
                                <CardDescription>{t("database.backupsListDesc", "Respaldos disponibles en el servidor para restauras de emergencia.")}</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="icon" onClick={fetchBackups} disabled={loadingBackups}>
                                    <RefreshCw className={`w-4 h-4 ${loadingBackups ? "animate-spin" : ""}`} />
                                </Button>
                                <Button className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={handleCreateBackup} disabled={backingUp}>
                                    <Database className="w-4 h-4 mr-2" />
                                    {t("database.createBackup", "Crear Salva")}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loadingBackups && backups.length === 0 ? (
                                <div className="space-y-2 py-4">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-lg" />
                                    ))}
                                </div>
                            ) : backups.length === 0 ? (
                                <div className="text-center py-16">
                                    <Database className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                                    <p className="text-muted-foreground">{t("database.noBackups", "No se encontraron copias de seguridad.")}</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-border">
                                    <table className="w-full text-sm text-left text-foreground">
                                        <thead className="text-xs uppercase bg-muted/50 border-b border-border">
                                            <tr>
                                                <th className="px-6 py-3 font-semibold text-muted-foreground">{t("database.file", "Archivo")}</th>
                                                <th className="px-6 py-3 font-semibold text-muted-foreground">{t("database.type", "Tipo")}</th>
                                                <th className="px-6 py-3 font-semibold text-muted-foreground">{t("database.size", "Tamaño")}</th>
                                                <th className="px-6 py-3 font-semibold text-muted-foreground">{t("database.date", "Fecha")}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {backups.map((b) => (
                                                <tr key={b.filename} className="hover:bg-muted/30 transition-colors">
                                                    <td className="px-6 py-4 font-mono text-xs max-w-xs truncate" title={b.filename}>{b.filename}</td>
                                                    <td className="px-6 py-4">
                                                        <Badge variant={
                                                            b.type === "Database" ? "default" :
                                                            b.type === "Private Files" ? "secondary" : "outline"
                                                        }>
                                                            {b.type}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-6 py-4">{b.size_readable}</td>
                                                    <td className="px-6 py-4 text-xs text-muted-foreground">{b.modified}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-amber-500/30 bg-amber-500/5">
                        <CardHeader>
                            <CardTitle className="text-amber-500 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                {t("database.restoreNoticeTitle", "Procedimiento de Restauración")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <p>
                                Por motivos de seguridad y estabilidad del servidor, la <strong>restauración completa</strong> de bases de datos debe ejecutarse directamente desde la terminal del bench o del contenedor:
                            </p>
                            <pre className="p-3 bg-muted rounded-md font-mono text-xs overflow-x-auto text-foreground border border-border">
                                {`# Entrar al contenedor y ejecutar:
bench --site frontend restore sites/frontend/private/backups/[nombre_archivo]-database.sql.gz --force`}
                            </pre>
                            <p className="text-xs">
                                ⚠️ Restaurar una base de datos sobrescribirá todas las sesiones activas, tablas y transacciones.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Reset Tab */}
                <TabsContent value="reset" className="space-y-6">
                    <Card className="glass-surface border-red-500/20">
                        <CardHeader>
                            <CardTitle className="text-red-500 flex items-center gap-2">
                                <ShieldAlert className="w-5 h-5" />
                                {t("database.resetTitle", "Restablecer Entorno (Env Reset)")}
                            </CardTitle>
                            <CardDescription>
                                Esta herramienta limpia el sistema eliminando todas las transacciones, bitácoras y datos temporales, pero mantiene intactos los DocTypes de configuración y datos maestros que selecciones.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col md:flex-row gap-6">
                                {/* Checklist configuration */}
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-sm">{t("database.selectMasterData", "Selecciona los DocTypes a preservar:")}</h3>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm" onClick={handleSelectRecommended} className="text-xs">
                                                Recomendado
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={handleSelectAll} className="text-xs">
                                                Todos
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={handleSelectNone} className="text-xs">
                                                Ninguno
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Search DocTypes */}
                                    <div className="relative">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar DocType por nombre..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            className="pl-9"
                                        />
                                    </div>

                                    {/* List container */}
                                    <div className="h-64 overflow-y-auto border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                                        {loadingDocTypes ? (
                                            <div className="space-y-2">
                                                {[1, 2, 3, 4].map(i => (
                                                    <div key={i} className="h-8 bg-muted animate-pulse rounded-md" />
                                                ))}
                                            </div>
                                        ) : filteredDocTypes.length === 0 ? (
                                            <p className="text-center text-xs text-muted-foreground py-8">No se encontraron DocTypes.</p>
                                        ) : (
                                            filteredDocTypes.map(dt => {
                                                const isChecked = selectedDocTypes.includes(dt.name);
                                                const isRecommended = PRE_SELECTED_DOCTYPES.includes(dt.name);
                                                return (
                                                    <div
                                                        key={dt.name}
                                                        onClick={() => handleToggleDocType(dt.name)}
                                                        className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors text-sm ${
                                                            isChecked ? "bg-cheese-500/10 border border-cheese-500/30" : "hover:bg-muted border border-transparent"
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                                                isChecked ? "bg-cheese-500 border-cheese-500 text-black" : "border-muted-foreground"
                                                            }`}>
                                                                {isChecked && "✓"}
                                                            </div>
                                                            <span className="font-medium">{dt.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-muted-foreground font-mono">{dt.module}</span>
                                                            {isRecommended && <Badge variant="outline" className="text-[10px] scale-90 border-cheese-500 text-cheese-600 bg-cheese-500/5">Recomendado</Badge>}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Switched options */}
                                    <div className="flex items-center justify-between p-4 bg-muted/30 border border-border rounded-lg">
                                        <div className="space-y-0.5">
                                            <label className="text-sm font-semibold">Resolver dependencias automáticamente</label>
                                            <p className="text-xs text-muted-foreground">Recomendado. Agrega tablas vinculadas necesarias para evitar errores de integridad referencial.</p>
                                        </div>
                                        <Switch checked={resolveDeps} onCheckedChange={setResolveDeps} />
                                    </div>
                                    
                                    <div className="text-xs text-red-500 font-semibold mt-2">
                                        Seleccionados: {selectedDocTypes.length} DocTypes a conservar. Las demás tablas se vaciarán.
                                    </div>
                                </div>

                                {/* Actions & Simulations */}
                                <div className="w-full md:w-80 space-y-4">
                                    <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg space-y-3">
                                        <h4 className="font-semibold text-sm text-red-500 flex items-center gap-1.5">
                                            <AlertTriangle className="w-4 h-4" />
                                            Operación Crítica
                                        </h4>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            El restablecimiento de entorno es <strong>irreversible</strong>. Se ejecutará una copia de seguridad automática antes de vaciar la base de datos por seguridad. Su sesión actual se cerrará inmediatamente al completar el proceso.
                                        </p>
                                        <div className="pt-2 space-y-2">
                                            <Button
                                                variant="outline"
                                                className="w-full text-xs"
                                                onClick={handleDryRun}
                                                disabled={dryRunning || resetting}
                                            >
                                                <Play className={`w-3.5 h-3.5 mr-1.5 ${dryRunning ? "animate-spin" : ""}`} />
                                                Simular Reseteo (Dry Run)
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                className="w-full font-bold"
                                                onClick={() => {
                                                    if (selectedDocTypes.length === 0) {
                                                        toast.error("Por favor, selecciona al menos un DocType.");
                                                        return;
                                                    }
                                                    setIsConfirmOpen(true);
                                                }}
                                                disabled={resetting}
                                            >
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                Restablecer Entorno
                                            </Button>
                                        </div>
                                    </div>
                                    
                                    {/* Dry Run Plan display */}
                                    <AnimatePresence>
                                        {dryRunPlan && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                className="p-4 bg-muted/50 border border-border rounded-lg space-y-3"
                                            >
                                                <h4 className="font-semibold text-xs text-foreground uppercase tracking-wider flex items-center justify-between">
                                                    <span>Plan de Simulación</span>
                                                    <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15">OK</Badge>
                                                </h4>
                                                <div className="text-xs text-muted-foreground space-y-1">
                                                    <p>Solicitados: <strong>{dryRunPlan.requested_doctypes?.length}</strong></p>
                                                    <p>Dependencias resueltas: <strong>{dryRunPlan.dependency_count}</strong></p>
                                                    <p>Total a preservar: <strong>{dryRunPlan.total_doctypes}</strong></p>
                                                </div>
                                                <div className="max-h-32 overflow-y-auto border border-border rounded p-2 bg-background space-y-1">
                                                    {dryRunPlan.import_order?.map((dt, idx) => {
                                                        const isRequested = dryRunPlan.requested_doctypes?.includes(dt);
                                                        return (
                                                            <div key={dt} className="text-[11px] flex items-center justify-between py-0.5 border-b border-border last:border-0">
                                                                <span className="font-mono text-muted-foreground">{idx + 1}. {dt}</span>
                                                                <Badge variant="outline" className={`scale-75 text-[9px] ${
                                                                    isRequested ? "border-cheese-500 text-cheese-600 bg-cheese-500/5" : "text-muted-foreground"
                                                                }`}>
                                                                    {isRequested ? "solicitado" : "dependencia"}
                                                                </Badge>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Confirm Dialog */}
            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5" />
                            ¿Confirmar Restablecimiento del Entorno?
                        </DialogTitle>
                        <DialogDescription className="pt-2 space-y-2">
                            <p>
                                Estás a punto de borrar <strong>todas las transacciones</strong> en tu base de datos y reinstalar el ERP.
                            </p>
                            <p>
                                Sólo se conservarán los datos de los <strong>{selectedDocTypes.length} DocTypes</strong> seleccionados. Se generará un respaldo automático antes de proceder.
                            </p>
                            <p className="font-semibold text-foreground">
                                Para confirmar esta acción destructiva, escribe <span className="text-red-500 underline">RESTABLECER</span> a continuación:
                            </p>
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        placeholder="Escribe 'RESTABLECER'"
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        className="my-3 border-red-500 focus-visible:ring-red-500"
                    />
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => { setIsConfirmOpen(false); setConfirmText(""); }}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleExecuteReset}
                            disabled={confirmText !== "RESTABLECER"}
                            className="font-bold"
                        >
                            ¡Proceder y Reiniciar ERP!
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
