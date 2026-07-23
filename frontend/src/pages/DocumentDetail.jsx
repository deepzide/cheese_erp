import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    FileText, ArrowLeft, ExternalLink, Sparkles, Trash2, RefreshCw,
    Loader2, AlertTriangle, ScrollText
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { documentService } from "@/api/documentService";
import { unwrapFrappeMethodData } from "@/api/client";
import { EmbeddingBadge } from "./Documents";
import { documentLink } from "./SemanticSearchTest";

const TYPE_BADGE = { PDF: "bg-red-500/15 text-red-700", Image: "bg-blue-500/15 text-blue-700", Link: "bg-purple-500/15 text-purple-700" };
const STATUS_OPTIONS = ["DRAFT", "PUBLISHED", "ARCHIVED"];

function Field({ label, children }) {
    return (
        <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <div className="text-sm font-medium break-words">{children || "—"}</div>
        </div>
    );
}

export default function DocumentDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const goBack = () => {
        if (location.key && location.key !== "default") navigate(-1);
        else navigate("/cheese/documents");
    };
    const { t } = useTranslation();

    const [doc, setDoc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [vectorizing, setVectorizing] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const [savingDescription, setSavingDescription] = useState(false);

    const fetchDoc = async () => {
        setLoading(true);
        try {
            const res = await documentService.getDetails(id);
            const data = unwrapFrappeMethodData(res, null);
            setDoc(data);
            setDescriptionDraft(data?.description || "");
        } catch (err) {
            toast.error(err?.message || t("documents.loadFailed", "Failed to load documents"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDoc();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const handleVectorize = async () => {
        setVectorizing(true);
        try {
            await documentService.vectorize(id);
            toast.success(t("documents.vectorizeQueued", "Documento encolado para vectorización"));
            setTimeout(() => fetchDoc(), 1500);
        } catch (err) {
            if (err?.status === 503 || err?.code === "NOT_CONFIGURED") {
                toast.error(t("documents.vectorizeNotConfigured", "La vectorización no está configurada. Activa los embeddings y la OpenAI API key en Configuración del Webhook."));
            } else {
                toast.error(err?.message || t("documents.vectorizeError", "Error al encolar la vectorización"));
            }
        } finally {
            setVectorizing(false);
        }
    };

    const handleSaveDescription = async () => {
        setSavingDescription(true);
        try {
            await documentService.updateDocument(id, { description: descriptionDraft.trim() });
            toast.success(t("documents.descriptionSaved", "Descripción guardada — el documento se re-vectorizará automáticamente"));
            fetchDoc();
        } catch (err) {
            toast.error(err?.message || t("documents.descriptionSaveError", "Error al guardar la descripción"));
        } finally {
            setSavingDescription(false);
        }
    };

    const handleStatusChange = async (status) => {
        setUpdatingStatus(true);
        try {
            await documentService.updateStatus(id, status);
            toast.success(t("documents.statusUpdated", "Estado actualizado"));
            fetchDoc();
        } catch (err) {
            toast.error(err?.message || t("documents.statusUpdateError", "Error al actualizar el estado"));
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await documentService.deleteDocument(id);
            toast.success(t("documents.deleteSuccess", "Documento eliminado"));
            navigate("/cheese/documents");
        } catch (err) {
            toast.error(err?.message || t("documents.deleteError", "Error al eliminar el documento"));
            setDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="p-6 space-y-4 max-w-4xl">
                {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
            </div>
        );
    }

    if (!doc) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("documents.notFound", "Documento no encontrado")}</h2>
                <Button variant="outline" onClick={() => navigate("/cheese/documents")}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> {t("common.back", "Volver")}
                </Button>
            </div>
        );
    }

    const link = documentLink(doc.file_url);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                    <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0 mt-0.5">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2 flex-wrap">
                            <FileText className="w-6 h-6 text-cheese-600 shrink-0" />
                            <span className="break-words">{doc.title}</span>
                        </h1>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge className={TYPE_BADGE[doc.document_type] || TYPE_BADGE.PDF}>{doc.document_type}</Badge>
                            <Badge variant="outline">{doc.status}</Badge>
                            <EmbeddingBadge status={doc.embedding_status} />
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                    {link && (
                        <Button variant="outline" size="sm" asChild>
                            <a href={link} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-2" /> {t("documents.openFile", "Abrir archivo")}
                            </a>
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleVectorize} disabled={vectorizing}>
                        {vectorizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        {doc.embedding_status === "COMPLETED" ? t("documents.revectorize", "Re-vectorizar") : t("documents.vectorize", "Vectorizar")}
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDeleteOpen(true)}>
                        <Trash2 className="w-4 h-4 mr-2" /> {t("documents.delete", "Eliminar")}
                    </Button>
                </div>
            </div>

            {/* General info */}
            <Card className="glass-surface">
                <CardHeader>
                    <CardTitle className="text-base">{t("documents.generalInfo", "Información general")}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <Field label="ID">
                        <span className="font-mono text-xs">{doc.document_id}</span>
                    </Field>
                    <Field label={t("documents.entity", "Entidad")}>
                        {doc.entity_type}: {doc.entity_id}
                    </Field>
                    <Field label={t("documents.statusLabel", "Estado")}>
                        <Select value={doc.status} onValueChange={handleStatusChange} disabled={updatingStatus}>
                            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {STATUS_OPTIONS.map(s => (
                                    <SelectItem key={s} value={s}>{t(`documents.${s.toLowerCase()}`, s)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Tags">{doc.tags}</Field>
                    <Field label={t("documents.language", "Idioma")}>{doc.language}</Field>
                    <Field label={t("documents.version", "Versión")}>{doc.version}</Field>
                    <Field label={t("documents.validUntil", "Válido hasta")}>{doc.validity_date}</Field>
                    <Field label={t("documents.createdAt", "Creado")}>{doc.created_at}</Field>
                    <Field label={t("documents.fileUrl", "Archivo / URL")}>
                        <span className="font-mono text-xs break-all">{doc.file_url}</span>
                    </Field>
                    <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                        <p className="text-xs text-muted-foreground">{t("documents.description", "Descripción")}</p>
                        <Textarea
                            rows={3}
                            placeholder={t("documents.descriptionPlaceholder", "Describe el contenido del documento — recomendado para imágenes y videos: qué muestra, ofertas, precios, etc.")}
                            value={descriptionDraft}
                            onChange={(e) => setDescriptionDraft(e.target.value)}
                        />
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground">{t("documents.descriptionHint", "Se incluye en la búsqueda semántica del bot.")}</p>
                            {descriptionDraft.trim() !== (doc.description || "").trim() && (
                                <Button size="sm" onClick={handleSaveDescription} disabled={savingDescription} className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold shrink-0">
                                    {savingDescription ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                                    {t("documents.saveDescription", "Guardar descripción")}
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Semantic search / embedding */}
            <Card className="glass-surface">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-cheese-600" />
                            {t("documents.semanticSection", "Búsqueda semántica")}
                        </CardTitle>
                        <CardDescription>
                            {t("documents.semanticSectionDesc", "Estado de la vectorización y texto que el bot usa como contexto.")}
                        </CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={fetchDoc}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <Field label={t("documents.embeddingStatus", "Estado de vectorización")}>
                            <EmbeddingBadge status={doc.embedding_status} />
                        </Field>
                        <Field label={t("documents.embeddingModel", "Modelo")}>
                            {doc.embedding_model && <span className="font-mono text-xs">{doc.embedding_model}</span>}
                        </Field>
                        <Field label={t("documents.extractedLength", "Texto extraído")}>
                            {doc.extracted_text_length > 0
                                ? `${doc.extracted_text_length.toLocaleString()} ${t("documents.chars", "caracteres")}`
                                : t("documents.noExtractedText", "Sin texto extraído")}
                        </Field>
                    </div>

                    {doc.embedding_status === "FAILED" && doc.embedding_error && (
                        <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-sm text-red-600 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span className="break-words">{doc.embedding_error}</span>
                        </div>
                    )}

                    {doc.extracted_text_preview && (
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <ScrollText className="w-3.5 h-3.5" />
                                {t("documents.extractedPreview", "Vista previa del texto extraído")}
                                {doc.extracted_text_length > 3000 && ` (${t("documents.first3000", "primeros 3.000 caracteres")})`}
                            </p>
                            <pre className="p-4 bg-muted/30 border border-border rounded-lg text-xs whitespace-pre-wrap max-h-80 overflow-y-auto font-sans">
                                {doc.extracted_text_preview}
                            </pre>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete confirmation */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            {t("documents.deleteConfirmTitle", "¿Eliminar documento?")}
                        </DialogTitle>
                        <DialogDescription className="pt-2">
                            {t("documents.deleteConfirmDesc", "Se eliminará permanentemente")} <strong>"{doc.title}"</strong>. {t("documents.deleteConfirmDesc2", "El bot dejará de encontrarlo en las búsquedas semánticas. Esta acción no se puede deshacer.")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                            {t("common.cancel", "Cancelar")}
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="font-bold">
                            {deleting ? t("common.deleting", "Eliminando...") : t("documents.delete", "Eliminar")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
