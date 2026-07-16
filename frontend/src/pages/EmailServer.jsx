import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    Mail, RefreshCw, Loader2, Send, CheckCircle2, XCircle,
    Server, ShieldCheck, AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { emailService } from "@/api/emailService";
import { unwrapFrappeMethodData } from "@/api/client";
import { useHotelAccess } from "@/lib/useHotelAccess";

export default function EmailServer() {
    const { t } = useTranslation();
    const { isAdmin, isLoading: accessLoading } = useHotelAccess();

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState(null);

    const [recipient, setRecipient] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [sendResult, setSendResult] = useState(null);

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const res = await emailService.getEmailServerStatus();
            setStatus(unwrapFrappeMethodData(res, null));
        } catch (err) {
            toast.error(err?.message || t("emailServer.loadError", "Error al consultar la configuración de correo"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) fetchStatus();
    }, [isAdmin]);

    const handleSend = async () => {
        const to = recipient.trim();
        if (!to) {
            toast.error(t("emailServer.recipientRequired", "Ingresa la dirección del destinatario"));
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            toast.error(t("emailServer.recipientInvalid", "La dirección de correo no es válida"));
            return;
        }
        setSending(true);
        setSendResult(null);
        try {
            const res = await emailService.sendTestEmail({
                recipient: to,
                subject: subject.trim() || undefined,
                message: message.trim() || undefined,
            });
            const data = unwrapFrappeMethodData(res, null);
            const ok = Boolean(res?.data?.message?.success ?? res?.data?.success ?? data);
            if (ok && data) {
                setSendResult({ ok: true, detail: data });
                toast.success(t("emailServer.sent", "Correo enviado a {{to}}", { to }));
            } else {
                const errMsg = res?.data?.message?.message || res?.data?.message || t("emailServer.sendError", "No se pudo enviar el correo");
                setSendResult({ ok: false, detail: { error: errMsg } });
                toast.error(errMsg);
            }
        } catch (err) {
            const errMsg = err?.message || t("emailServer.sendError", "No se pudo enviar el correo");
            setSendResult({ ok: false, detail: { error: errMsg } });
            toast.error(errMsg);
        } finally {
            setSending(false);
        }
    };

    if (accessLoading) return null;
    if (!isAdmin) return <Navigate to="/cheese/dashboard" replace />;

    const accounts = status?.outgoing_accounts || [];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Mail className="w-6 h-6 text-cheese-600" />
                    {t("emailServer.title", "Servidor de Correo")}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {t("emailServer.description", "Verifica el servidor de correo saliente configurado en la instancia y envía un correo de prueba real.")}
                </p>
            </div>

            {/* Server status */}
            <Card className="glass-surface">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Server className="w-4 h-4 text-cheese-600" />
                            {t("emailServer.statusTitle", "Configuración detectada")}
                        </CardTitle>
                        <CardDescription>
                            {t("emailServer.statusDescription", "Cuentas de correo saliente (Email Account) y SMTP del site_config.")}
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="icon" onClick={fetchStatus} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="space-y-3 py-2">
                            {[1, 2].map(i => (
                                <div key={i} className="h-10 w-full bg-muted animate-pulse rounded-lg" />
                            ))}
                        </div>
                    ) : !status ? (
                        <p className="text-sm text-muted-foreground py-2">
                            {t("emailServer.noData", "No se pudo obtener la configuración.")}
                        </p>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                {status.configured ? (
                                    <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 bg-emerald-500/5 gap-1">
                                        <ShieldCheck className="w-3 h-3" />
                                        {t("emailServer.configured", "Servidor de correo configurado")}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="border-red-500/50 text-red-500 bg-red-500/5 gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        {t("emailServer.notConfigured", "Sin servidor de correo saliente")}
                                    </Badge>
                                )}
                                {status.configured && !status.has_default_outgoing && (
                                    <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-500/5 gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        {t("emailServer.noDefault", "Ninguna cuenta marcada como Default Outgoing")}
                                    </Badge>
                                )}
                                {status.queue_paused && (
                                    <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-500/5">
                                        {t("emailServer.queuePaused", "Cola de correos pausada (hold_queue)")}
                                    </Badge>
                                )}
                            </div>

                            {accounts.length > 0 && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                                                <th className="py-2 pr-4">{t("emailServer.colAccount", "Cuenta")}</th>
                                                <th className="py-2 pr-4">SMTP</th>
                                                <th className="py-2 pr-4">{t("emailServer.colPort", "Puerto")}</th>
                                                <th className="py-2 pr-4">TLS/SSL</th>
                                                <th className="py-2">{t("emailServer.colFlags", "Estado")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {accounts.map(acc => (
                                                <tr key={acc.name} className="border-b border-border/50 last:border-0">
                                                    <td className="py-2.5 pr-4">
                                                        <span className="font-mono text-xs">{acc.email_id || acc.name}</span>
                                                    </td>
                                                    <td className="py-2.5 pr-4 font-mono text-xs">{acc.smtp_server || (acc.service ? `(${acc.service})` : "—")}</td>
                                                    <td className="py-2.5 pr-4 font-mono text-xs">{acc.smtp_port || "—"}</td>
                                                    <td className="py-2.5 pr-4 text-xs">
                                                        {acc.use_ssl_for_outgoing ? "SSL" : acc.use_tls ? "TLS" : "—"}
                                                    </td>
                                                    <td className="py-2.5">
                                                        <div className="flex flex-wrap gap-1">
                                                            {Boolean(acc.default_outgoing) && (
                                                                <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600 bg-emerald-500/5">
                                                                    {t("emailServer.default", "Default")}
                                                                </Badge>
                                                            )}
                                                            {Boolean(acc.awaiting_password) && (
                                                                <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-500 bg-red-500/5">
                                                                    {t("emailServer.awaitingPassword", "Sin contraseña")}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {status.site_config_smtp && (
                                <p className="text-xs text-muted-foreground">
                                    {t("emailServer.siteConfig", "SMTP en site_config.json:")}{" "}
                                    <span className="font-mono">
                                        {status.site_config_smtp.mail_server}
                                        {status.site_config_smtp.mail_port ? `:${status.site_config_smtp.mail_port}` : ""}
                                        {status.site_config_smtp.mail_login ? ` (${status.site_config_smtp.mail_login})` : ""}
                                    </span>
                                </p>
                            )}

                            {!status.configured && (
                                <p className="text-xs text-muted-foreground">
                                    {t("emailServer.howToConfigure", "Configura una Email Account con \"Enable Outgoing\" + \"Default Outgoing\" en el Desk de Frappe, o SMTP en site_config.json.")}
                                </p>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Send test email */}
            <Card className="glass-surface">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Send className="w-4 h-4 text-cheese-600" />
                        {t("emailServer.sendTitle", "Enviar correo de prueba")}
                    </CardTitle>
                    <CardDescription>
                        {t("emailServer.sendDescription", "Se envía de forma síncrona a través del servidor configurado: si el SMTP falla, el error se muestra aquí.")}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email-recipient">{t("emailServer.recipient", "Destinatario")}</Label>
                        <Input
                            id="email-recipient"
                            type="email"
                            placeholder="persona@ejemplo.com"
                            value={recipient}
                            onChange={e => setRecipient(e.target.value)}
                            className="font-mono text-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email-subject">{t("emailServer.subject", "Asunto (opcional)")}</Label>
                        <Input
                            id="email-subject"
                            placeholder={t("emailServer.subjectPlaceholder", "Correo de prueba — Cheese ERP")}
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email-message">{t("emailServer.message", "Mensaje (opcional)")}</Label>
                        <textarea
                            id="email-message"
                            rows={3}
                            placeholder={t("emailServer.messagePlaceholder", "Texto del correo de prueba…")}
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>
                    <Button
                        className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold"
                        onClick={handleSend}
                        disabled={sending || loading || (status && !status.configured)}
                    >
                        {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                        {t("emailServer.send", "Enviar correo")}
                    </Button>
                </CardContent>
            </Card>

            {/* Send result */}
            <AnimatePresence>
                {sendResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                    >
                        <Card className={sendResult.ok
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-red-500/30 bg-red-500/5"}>
                            <CardHeader>
                                <CardTitle className={`flex items-center gap-2 text-base ${sendResult.ok ? "text-emerald-600" : "text-red-500"}`}>
                                    {sendResult.ok
                                        ? <CheckCircle2 className="w-5 h-5" />
                                        : <XCircle className="w-5 h-5" />}
                                    {sendResult.ok
                                        ? t("emailServer.resultOk", "Correo enviado")
                                        : t("emailServer.resultFail", "El envío falló")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-1 text-sm">
                                {sendResult.ok ? (
                                    <>
                                        <p className="text-muted-foreground">
                                            {t("emailServer.resultTo", "Destinatario:")}{" "}
                                            <span className="font-mono">{sendResult.detail.recipient}</span>
                                        </p>
                                        {sendResult.detail.sent_via && (
                                            <p className="text-muted-foreground">
                                                {t("emailServer.resultVia", "Enviado desde:")}{" "}
                                                <span className="font-mono">{sendResult.detail.sent_via}</span>
                                            </p>
                                        )}
                                        <p className="text-xs text-muted-foreground pt-1">
                                            {t("emailServer.resultHint", "Revisa también la carpeta de spam del destinatario.")}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-muted-foreground break-words">{sendResult.detail.error}</p>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
