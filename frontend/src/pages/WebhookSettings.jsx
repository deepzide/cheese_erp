import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    Webhook, Save, Eye, EyeOff, PlugZap, CheckCircle2, XCircle,
    RefreshCw, KeyRound, Link2, Loader2, Sparkles, DatabaseZap
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { botSettingService } from "@/api/botSettingService";
import { unwrapFrappeMethodData } from "@/api/client";

export default function WebhookSettings() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    const [webhookUrl, setWebhookUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [enabled, setEnabled] = useState(true);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [testResult, setTestResult] = useState(null);

    const [embeddingsEnabled, setEmbeddingsEnabled] = useState(true);
    const [openaiKey, setOpenaiKey] = useState("");
    const [showOpenaiKey, setShowOpenaiKey] = useState(false);
    const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
    const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");
    const [reindexing, setReindexing] = useState(false);

    const applySettings = (data) => {
        if (!data) return;
        setWebhookUrl(data.webhook_url || "");
        setEnabled(Boolean(data.webhook_enabled));
        setHasApiKey(Boolean(data.has_api_key));
        setEmbeddingsEnabled(Boolean(data.embeddings_enabled));
        setHasOpenaiKey(Boolean(data.has_openai_api_key));
        setEmbeddingModel(data.embedding_model || "text-embedding-3-small");
    };

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await botSettingService.getWebhookSettings();
            applySettings(unwrapFrappeMethodData(res, {}));
        } catch (err) {
            toast.error(err?.message || t("webhookSettings.loadError", "Error al cargar la configuración del webhook"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSave = async () => {
        if (webhookUrl && !/^https?:\/\//i.test(webhookUrl.trim())) {
            toast.error(t("webhookSettings.invalidUrl", "La URL debe comenzar con http:// o https://"));
            return;
        }
        setSaving(true);
        try {
            const payload = {
                webhook_url: webhookUrl.trim(),
                webhook_enabled: enabled,
                embeddings_enabled: embeddingsEnabled,
                embedding_model: embeddingModel.trim() || undefined,
            };
            if (apiKey.trim()) payload.webhook_api_key = apiKey.trim();
            if (openaiKey.trim()) payload.openai_api_key = openaiKey.trim();

            const res = await botSettingService.updateWebhookSettings(payload);
            applySettings(unwrapFrappeMethodData(res, {}));
            setApiKey("");
            setOpenaiKey("");
            toast.success(t("webhookSettings.saved", "Configuración del webhook guardada correctamente"));
        } catch (err) {
            toast.error(err?.message || t("webhookSettings.saveError", "Error al guardar la configuración"));
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        if (!webhookUrl.trim()) {
            toast.error(t("webhookSettings.urlRequired", "Configura primero la URL del webhook"));
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            // Send the current form values so the test works before saving;
            // an empty key falls back to the stored one on the server.
            const res = await botSettingService.testWebhook({
                webhook_url: webhookUrl.trim(),
                webhook_api_key: apiKey.trim(),
            });
            const result = unwrapFrappeMethodData(res, null);
            if (result) {
                setTestResult(result);
                if (result.ok) {
                    toast.success(t("webhookSettings.testOk", "El webhook funciona correctamente"));
                } else {
                    toast.error(result.detail || t("webhookSettings.testFail", "La prueba del webhook falló"));
                }
            } else {
                toast.error(t("webhookSettings.testNoData", "No se recibió respuesta de la prueba"));
            }
        } catch (err) {
            toast.error(err?.message || t("webhookSettings.testError", "Error al probar el webhook"));
        } finally {
            setTesting(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Webhook className="w-6 h-6 text-cheese-600" />
                    {t("webhookSettings.title", "Configuración del Webhook")}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {t("webhookSettings.description", "Configura la URL y la API key del bot que recibe los webhooks de cambios de estado de los tickets.")}
                </p>
            </div>

            <Card className="glass-surface">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle>{t("webhookSettings.cardTitle", "Webhook de estados de tickets")}</CardTitle>
                        <CardDescription>
                            {t("webhookSettings.cardDescription", "Cada vez que un ticket cambia de estado (confirmado, cancelado, rechazado, etc.) se notifica al bot en esta URL.")}
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="icon" onClick={fetchSettings} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                    {loading ? (
                        <div className="space-y-3 py-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-10 w-full bg-muted animate-pulse rounded-lg" />
                            ))}
                        </div>
                    ) : (
                        <>
                            {/* Webhook URL */}
                            <div className="space-y-2">
                                <Label htmlFor="webhook-url" className="flex items-center gap-1.5">
                                    <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                                    {t("webhookSettings.urlLabel", "URL del webhook")}
                                </Label>
                                <Input
                                    id="webhook-url"
                                    placeholder="https://bot.ejemplo.com/erp/ticket-status"
                                    value={webhookUrl}
                                    onChange={e => setWebhookUrl(e.target.value)}
                                    className="font-mono text-sm"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {t("webhookSettings.urlHint", "Endpoint del bot que recibe las notificaciones (normalmente termina en /erp/ticket-status).")}
                                </p>
                            </div>

                            {/* API Key */}
                            <div className="space-y-2">
                                <Label htmlFor="webhook-api-key" className="flex items-center gap-1.5">
                                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                                    {t("webhookSettings.apiKeyLabel", "API Key")}
                                    {hasApiKey && (
                                        <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600 bg-emerald-500/5">
                                            {t("webhookSettings.apiKeyStored", "Guardada")}
                                        </Badge>
                                    )}
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="webhook-api-key"
                                        type={showApiKey ? "text" : "password"}
                                        placeholder={hasApiKey
                                            ? t("webhookSettings.apiKeyPlaceholderStored", "•••••••• (deja vacío para conservar la actual)")
                                            : t("webhookSettings.apiKeyPlaceholder", "Introduce la API key del bot")}
                                        value={apiKey}
                                        onChange={e => setApiKey(e.target.value)}
                                        className="font-mono text-sm pr-10"
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        tabIndex={-1}
                                    >
                                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {t("webhookSettings.apiKeyHint", "Se envía en el header X-API-Key. Por seguridad, la key guardada nunca se muestra.")}
                                </p>
                            </div>

                            {/* Enabled toggle */}
                            <div className="flex items-center justify-between p-4 bg-muted/30 border border-border rounded-lg">
                                <div className="space-y-0.5">
                                    <label className="text-sm font-semibold">
                                        {t("webhookSettings.enabledLabel", "Webhook habilitado")}
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        {t("webhookSettings.enabledHint", "Desactívalo para pausar temporalmente las notificaciones al bot sin borrar la configuración.")}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEnabled(!enabled)}
                                    className={`${enabled ? 'bg-cheese-500' : 'bg-muted'
                                        } relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
                                >
                                    <span
                                        className={`${enabled ? 'translate-x-5 bg-black' : 'translate-x-0 bg-background'
                                            } pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out`}
                                    />
                                </button>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-2 pt-2">
                                <Button
                                    className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold"
                                    onClick={handleSave}
                                    disabled={saving || testing}
                                >
                                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                    {t("webhookSettings.save", "Guardar configuración")}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={handleTest}
                                    disabled={testing || saving}
                                >
                                    {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlugZap className="w-4 h-4 mr-2" />}
                                    {t("webhookSettings.test", "Probar webhook")}
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* AI / Semantic document search */}
            <Card className="glass-surface">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-cheese-600" />
                        {t("webhookSettings.aiTitle", "IA / Búsqueda semántica de documentos")}
                    </CardTitle>
                    <CardDescription>
                        {t("webhookSettings.aiDescription", "Los documentos subidos se vectorizan con embeddings de OpenAI para que el bot pueda buscarlos por similitud semántica.")}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-muted/30 border border-border rounded-lg">
                        <div className="space-y-0.5">
                            <label className="text-sm font-semibold">
                                {t("webhookSettings.embeddingsEnabledLabel", "Vectorización habilitada")}
                            </label>
                            <p className="text-xs text-muted-foreground">
                                {t("webhookSettings.embeddingsEnabledHint", "Al subir o editar un documento se genera su embedding en segundo plano.")}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setEmbeddingsEnabled(!embeddingsEnabled)}
                            className={`${embeddingsEnabled ? 'bg-cheese-500' : 'bg-muted'
                                } relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
                        >
                            <span
                                className={`${embeddingsEnabled ? 'translate-x-5 bg-black' : 'translate-x-0 bg-background'
                                    } pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out`}
                            />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <Label htmlFor="openai-api-key" className="flex items-center gap-1.5">
                                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                                {t("webhookSettings.openaiKeyLabel", "OpenAI API Key")}
                                {hasOpenaiKey && (
                                    <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600 bg-emerald-500/5">
                                        {t("webhookSettings.apiKeyStored", "Guardada")}
                                    </Badge>
                                )}
                            </Label>
                            <div className="relative">
                                <Input
                                    id="openai-api-key"
                                    type={showOpenaiKey ? "text" : "password"}
                                    placeholder={hasOpenaiKey
                                        ? t("webhookSettings.apiKeyPlaceholderStored", "•••••••• (deja vacío para conservar la actual)")
                                        : "sk-..."}
                                    value={openaiKey}
                                    onChange={e => setOpenaiKey(e.target.value)}
                                    className="font-mono text-sm pr-10"
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    tabIndex={-1}
                                >
                                    {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="embedding-model">
                                {t("webhookSettings.embeddingModelLabel", "Modelo de embeddings")}
                            </Label>
                            <Input
                                id="embedding-model"
                                value={embeddingModel}
                                onChange={e => setEmbeddingModel(e.target.value)}
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                {t("webhookSettings.embeddingModelHint", "Si cambias el modelo, reindexa los documentos existentes.")}
                            </p>
                        </div>
                    </div>

                    <Button
                        variant="outline"
                        onClick={async () => {
                            setReindexing(true);
                            try {
                                const res = await botSettingService.reindexDocuments();
                                const data = unwrapFrappeMethodData(res, {});
                                toast.success(t("webhookSettings.reindexQueued", "Reindexación encolada: {{count}} documento(s)", { count: data?.queued ?? 0 }));
                            } catch (err) {
                                toast.error(err?.message || t("webhookSettings.reindexError", "Error al reindexar documentos"));
                            } finally {
                                setReindexing(false);
                            }
                        }}
                        disabled={reindexing || saving}
                    >
                        {reindexing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DatabaseZap className="w-4 h-4 mr-2" />}
                        {t("webhookSettings.reindex", "Reindexar documentos pendientes")}
                    </Button>
                </CardContent>
            </Card>

            {/* Test result */}
            <AnimatePresence>
                {testResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                    >
                        <Card className={testResult.ok
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-red-500/30 bg-red-500/5"}>
                            <CardHeader>
                                <CardTitle className={`flex items-center gap-2 text-base ${testResult.ok ? "text-emerald-600" : "text-red-500"}`}>
                                    {testResult.ok
                                        ? <CheckCircle2 className="w-5 h-5" />
                                        : <XCircle className="w-5 h-5" />}
                                    {testResult.ok
                                        ? t("webhookSettings.resultOk", "Conexión exitosa")
                                        : t("webhookSettings.resultFail", "La prueba falló")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <p className="text-muted-foreground">{testResult.detail}</p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {testResult.http_status != null && (
                                        <Badge variant="outline">
                                            HTTP {testResult.http_status}
                                        </Badge>
                                    )}
                                    {testResult.latency_ms != null && (
                                        <Badge variant="outline">
                                            {testResult.latency_ms} ms
                                        </Badge>
                                    )}
                                    {testResult.ping_url && (
                                        <Badge variant="outline" className="font-mono max-w-full truncate" title={testResult.ping_url}>
                                            {testResult.ping_url}
                                        </Badge>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
