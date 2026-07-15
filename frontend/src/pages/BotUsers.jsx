import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    Bot, RefreshCw, Loader2, Eye, EyeOff, Copy, KeyRound,
    ShieldCheck, ShieldAlert, AlertTriangle, UserPlus, RotateCcw
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { botUserService } from "@/api/botUserService";
import { unwrapFrappeMethodData } from "@/api/client";
import { useHotelAccess } from "@/lib/useHotelAccess";

function copyToClipboard(value, label) {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(
        () => toast.success(`${label} copiado al portapapeles`),
        () => toast.error("No se pudo copiar al portapapeles"),
    );
}

function SecretCell({ value }) {
    const [visible, setVisible] = useState(false);
    if (!value) return <span className="text-muted-foreground">—</span>;
    return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
            <span>{visible ? value : "••••••••••••"}</span>
            <button
                type="button"
                onClick={() => setVisible(!visible)}
                className="text-muted-foreground hover:text-foreground"
                tabIndex={-1}
            >
                {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
                type="button"
                onClick={() => copyToClipboard(value, "Valor")}
                className="text-muted-foreground hover:text-foreground"
                tabIndex={-1}
            >
                <Copy className="w-3.5 h-3.5" />
            </button>
        </span>
    );
}

export default function BotUsers() {
    const { t } = useTranslation();
    const { isAdmin, isLoading: accessLoading } = useHotelAccess();

    const [loading, setLoading] = useState(true);
    const [provisioning, setProvisioning] = useState(null); // null | "all" | company name
    const [rows, setRows] = useState([]);
    // Passwords are returned exactly once by the provisioning script; keep the
    // latest results visible until the page is refreshed or re-provisioned.
    const [oneTimeResults, setOneTimeResults] = useState([]);

    const fetchBotUsers = async () => {
        setLoading(true);
        try {
            const res = await botUserService.listBotUsers();
            const data = unwrapFrappeMethodData(res, {});
            setRows(Array.isArray(data?.bot_users) ? data.bot_users : []);
        } catch (err) {
            toast.error(err?.message || t("botUsers.loadError", "Error al cargar los usuarios de bot"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) fetchBotUsers();
    }, [isAdmin]);

    const handleProvision = async ({ company, resetPassword } = {}) => {
        if (resetPassword) {
            const target = company || t("botUsers.allEstablishments", "todos los establecimientos");
            const confirmed = window.confirm(
                t(
                    "botUsers.resetConfirm",
                    "Se generará una nueva contraseña para {{target}} y la actual dejará de funcionar. ¿Continuar?",
                    { target },
                ),
            );
            if (!confirmed) return;
        }
        setProvisioning(company || "all");
        try {
            const res = await botUserService.provisionBotUsers({ company, resetPassword });
            const data = unwrapFrappeMethodData(res, {});
            const results = Array.isArray(data?.results) ? data.results : [];
            const failures = Array.isArray(data?.failures) ? data.failures : [];

            const withPassword = results.filter(r => r.password);
            if (withPassword.length > 0) setOneTimeResults(withPassword);

            if (failures.length > 0) {
                failures.forEach(f => toast.error(`${f.company}: ${f.error}`));
            }
            if (results.length > 0) {
                toast.success(
                    t("botUsers.provisioned", "{{count}} usuario(s) de bot aprovisionado(s)", { count: results.length }),
                );
            }
            await fetchBotUsers();
        } catch (err) {
            toast.error(err?.message || t("botUsers.provisionError", "Error al aprovisionar los usuarios de bot"));
        } finally {
            setProvisioning(null);
        }
    };

    const pendingCount = useMemo(() => rows.filter(r => !r.provisioned).length, [rows]);

    if (accessLoading) return null;
    if (!isAdmin) return <Navigate to="/cheese/dashboard" replace />;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-5xl">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Bot className="w-6 h-6 text-cheese-600" />
                        {t("botUsers.title", "Usuarios de Bot")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("botUsers.description", "Crea un usuario dedicado por establecimiento para el uso exclusivo del bot, con acceso limitado a los datos de su propio establecimiento.")}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={fetchBotUsers} disabled={loading || !!provisioning}>
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                        className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold"
                        onClick={() => handleProvision()}
                        disabled={loading || !!provisioning}
                    >
                        {provisioning === "all"
                            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            : <UserPlus className="w-4 h-4 mr-2" />}
                        {pendingCount > 0
                            ? t("botUsers.provisionAll", "Crear usuarios faltantes ({{count}})", { count: pendingCount })
                            : t("botUsers.reprovisionAll", "Re-aprovisionar todos")}
                    </Button>
                </div>
            </div>

            {/* One-time passwords from the latest provisioning run */}
            <AnimatePresence>
                {oneTimeResults.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                    >
                        <Card className="border-amber-500/40 bg-amber-500/5">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base text-amber-600">
                                    <AlertTriangle className="w-5 h-5" />
                                    {t("botUsers.oneTimeTitle", "Contraseñas generadas — visibles solo ahora")}
                                </CardTitle>
                                <CardDescription>
                                    {t("botUsers.oneTimeHint", "Guarda estas contraseñas en el gestor de secretos del bot. No podrán recuperarse después; si se pierden, usa \"Resetear contraseña\".")}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {oneTimeResults.map(r => (
                                    <div key={r.email} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm border-b border-border/50 last:border-0 pb-2 last:pb-0">
                                        <span className="font-semibold min-w-[160px]">{r.company}</span>
                                        <span className="font-mono text-xs">{r.email}</span>
                                        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                                            <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                                            {r.password}
                                            <button
                                                type="button"
                                                onClick={() => copyToClipboard(r.password, "Password")}
                                                className="text-muted-foreground hover:text-foreground"
                                                tabIndex={-1}
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                        </span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <Card className="glass-surface">
                <CardHeader>
                    <CardTitle>{t("botUsers.tableTitle", "Credenciales por establecimiento")}</CardTitle>
                    <CardDescription>
                        {t("botUsers.tableDescription", "El bot usa ERP_USER + ERP_PASSWORD o el par api_key:api_secret en su .env. Visible únicamente para superadministradores.")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-3 py-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-10 w-full bg-muted animate-pulse rounded-lg" />
                            ))}
                        </div>
                    ) : rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">
                            {t("botUsers.empty", "No hay establecimientos registrados.")}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                                        <th className="py-2 pr-4">{t("botUsers.colEstablishment", "Establecimiento")}</th>
                                        <th className="py-2 pr-4">{t("botUsers.colStatus", "Estado")}</th>
                                        <th className="py-2 pr-4">ERP_USER</th>
                                        <th className="py-2 pr-4">api_key</th>
                                        <th className="py-2 pr-4">api_secret</th>
                                        <th className="py-2 pr-4">{t("botUsers.colLastLogin", "Último acceso")}</th>
                                        <th className="py-2">{t("botUsers.colActions", "Acciones")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(row => (
                                        <tr key={row.company} className="border-b border-border/50 last:border-0">
                                            <td className="py-2.5 pr-4 font-medium">{row.company}</td>
                                            <td className="py-2.5 pr-4">
                                                {row.provisioned ? (
                                                    row.enabled ? (
                                                        <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 bg-emerald-500/5 gap-1">
                                                            <ShieldCheck className="w-3 h-3" />
                                                            {t("botUsers.statusActive", "Activo")}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-red-500/50 text-red-500 bg-red-500/5 gap-1">
                                                            <ShieldAlert className="w-3 h-3" />
                                                            {t("botUsers.statusDisabled", "Deshabilitado")}
                                                        </Badge>
                                                    )
                                                ) : (
                                                    <Badge variant="outline" className="text-muted-foreground gap-1">
                                                        {t("botUsers.statusMissing", "Sin crear")}
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                {row.email ? (
                                                    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                                                        {row.email}
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(row.email, "ERP_USER")}
                                                            className="text-muted-foreground hover:text-foreground"
                                                            tabIndex={-1}
                                                        >
                                                            <Copy className="w-3.5 h-3.5" />
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 pr-4"><SecretCell value={row.api_key} /></td>
                                            <td className="py-2.5 pr-4"><SecretCell value={row.api_secret} /></td>
                                            <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                                                {row.last_login || t("botUsers.never", "Nunca")}
                                            </td>
                                            <td className="py-2.5">
                                                <div className="flex gap-1.5">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-xs"
                                                        onClick={() => handleProvision({ company: row.company })}
                                                        disabled={!!provisioning}
                                                    >
                                                        {provisioning === row.company
                                                            ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                            : <UserPlus className="w-3 h-3 mr-1" />}
                                                        {row.provisioned
                                                            ? t("botUsers.reprovision", "Re-aprovisionar")
                                                            : t("botUsers.provision", "Crear")}
                                                    </Button>
                                                    {row.provisioned && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs text-amber-600 hover:text-amber-500"
                                                            onClick={() => handleProvision({ company: row.company, resetPassword: true })}
                                                            disabled={!!provisioning}
                                                            title={t("botUsers.resetHint", "Genera una nueva contraseña (la actual deja de funcionar)")}
                                                        >
                                                            <RotateCcw className="w-3 h-3 mr-1" />
                                                            {t("botUsers.resetPassword", "Resetear contraseña")}
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
}
