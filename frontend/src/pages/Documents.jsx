import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search, Plus, AlertCircle, RefreshCw, MoreHorizontal, ExternalLink, Eye, Sparkles, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFrappeList } from "@/lib/useApiData";
import { useHotelAccess } from "@/lib/useHotelAccess";
import { useTranslation } from "react-i18next";
import { documentService } from "@/api/documentService";

const TYPE_BADGE = { PDF: "bg-red-500/15 text-red-700", Image: "bg-blue-500/15 text-blue-700", Link: "bg-purple-500/15 text-purple-700" };
const STATUS_BADGE = { DRAFT: "bg-yellow-500/15 text-yellow-700", PUBLISHED: "bg-emerald-500/15 text-emerald-700", ARCHIVED: "bg-gray-500/15 text-gray-600" };

export function EmbeddingBadge({ status }) {
    const { t } = useTranslation();
    const config = {
        COMPLETED: { label: t("documents.vectorized", "Vectorizado"), cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
        PROCESSING: { label: t("documents.vectorizing", "Vectorizando..."), cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
        PENDING: { label: t("documents.vectorizePending", "En cola"), cls: "bg-cheese-500/15 text-cheese-700" },
        FAILED: { label: t("documents.vectorizeFailed", "Error de vectorización"), cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
    }[status] || { label: t("documents.notVectorized", "Sin vectorizar"), cls: "bg-gray-500/15 text-gray-600 dark:text-gray-400" };
    return <Badge className={config.cls}>{config.label}</Badge>;
}

const DOC_FIELDS = ["name", "entity_type", "entity_id", "title", "document_type", "file_url", "status", "language", "version", "validity_date", "tags", "creation", "embedding_status"];

export default function Documents() {
    const { t } = useTranslation();
    const { isAdmin, userCompanies } = useHotelAccess();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const companyFromQuery = searchParams.get("company") || "";
    const includeCompanyDocs = searchParams.get("include_company_docs") !== "0";
    const [searchTerm, setSearchTerm] = useState("");
    const entityTypeFilter = searchParams.get("entity_type") || "";
    const entityIdFilter = searchParams.get("entity_id") || "";

    const { data: docs = [], isLoading, error, refetch } = useFrappeList("Cheese Document", {
        filters: {
            entity_type: entityTypeFilter || undefined,
            entity_id: entityIdFilter || undefined,
        },
        fields: DOC_FIELDS,
        pageSize: 100,
    });

    const shouldLoadCompanyDocs =
        includeCompanyDocs &&
        entityTypeFilter === "Cheese Experience" &&
        !!(companyFromQuery || searchParams.get("establishment_id"));
    const companyEntityId = companyFromQuery || searchParams.get("establishment_id") || "";

    const { data: companyDocs = [] } = useFrappeList("Cheese Document", {
        enabled: shouldLoadCompanyDocs,
        filters: {
            entity_type: "Company",
            entity_id: companyEntityId || undefined,
        },
        fields: DOC_FIELDS,
        pageSize: 100,
    });

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const handleVectorize = async (doc) => {
        try {
            await documentService.vectorize(doc.name);
            toast.success(t("documents.vectorizeQueued", "Documento encolado para vectorización"));
            setTimeout(() => refetch(), 1200);
        } catch (err) {
            if (err?.status === 503 || err?.code === "NOT_CONFIGURED") {
                toast.error(t("documents.vectorizeNotConfigured", "La vectorización no está configurada. Activa los embeddings y la OpenAI API key en Configuración del Webhook."));
            } else {
                toast.error(err?.message || t("documents.vectorizeError", "Error al encolar la vectorización"));
            }
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await documentService.deleteDocument(deleteTarget.name);
            toast.success(t("documents.deleteSuccess", "Documento eliminado"));
            setDeleteTarget(null);
            refetch();
        } catch (err) {
            toast.error(err?.message || t("documents.deleteError", "Error al eliminar el documento"));
        } finally {
            setDeleting(false);
        }
    };

    const mergedDocs = React.useMemo(() => {
        const seen = new Set();
        const result = [];
        [...(Array.isArray(docs) ? docs : []), ...(Array.isArray(companyDocs) ? companyDocs : [])].forEach((d) => {
            if (!d?.name || seen.has(d.name)) return;
            seen.add(d.name);
            result.push(d);
        });
        return result;
    }, [docs, companyDocs]);

    const { data: allowedExperiences = [] } = useFrappeList("Cheese Experience", {
        enabled: !isAdmin && (Array.isArray(userCompanies) ? userCompanies.length > 0 : false),
        filters: {
            company: ["in", userCompanies],
        },
        fields: ["name"],
        pageSize: 500,
    });

    const scopedDocs = React.useMemo(() => {
        if (isAdmin) return mergedDocs;
        const allowedCompanies = new Set(Array.isArray(userCompanies) ? userCompanies : []);
        const allowedExperienceIds = new Set(
            (Array.isArray(allowedExperiences) ? allowedExperiences : []).map((row) => row.name).filter(Boolean)
        );
        return mergedDocs.filter((doc) => {
            if (doc?.entity_type === "Company") return allowedCompanies.has(doc.entity_id);
            if (doc?.entity_type === "Cheese Experience") return allowedExperienceIds.has(doc.entity_id);
            // Hide other entity types for establishment users unless they are explicitly scoped.
            return false;
        });
    }, [mergedDocs, isAdmin, userCompanies, allowedExperiences]);

    const filtered = scopedDocs.filter(d => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (d.title || d.name || '').toLowerCase().includes(term) || (d.entity_id || '').toLowerCase().includes(term);
        }
        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" /><h2 className="text-lg font-semibold mb-2">{t("documents.loadFailed", "Failed to load documents")}</h2>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="w-6 h-6 text-cheese-600" /> {t("documents.title", "Documents")}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} ${t("documents.documents", "documents")}`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t("common.search", "Buscar...")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button
                        className="cheese-gradient text-black font-semibold border-0 h-9"
                        onClick={() => window.location.assign("/cheese/documents/new")}
                    >
                        <Plus className="w-4 h-4 mr-1" /> {t("documents.upload", "Upload")}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="space-y-3">
                {isLoading ? Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-4 flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-lg" /><div className="flex-1"><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-24" /></div>
                    </CardContent></Card>
                )) : filtered.map((doc) => (
                    <motion.div key={doc.name} whileHover={{ x: 4 }}>
                        <Card
                            className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer"
                            onClick={() => navigate(`/cheese/documents/${encodeURIComponent(doc.name)}`)}
                        >
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-sm text-foreground">{doc.title || doc.name}</h3>
                                    <p className="text-xs text-muted-foreground">{doc.entity_type}: {doc.entity_id || '—'} {doc.language ? `• ${doc.language === "English" ? "Ingles" : doc.language === "Spanish" ? "Espanol" : doc.language}` : ''} {doc.version ? `• v${doc.version}` : ''}</p>
                                </div>
                                <Badge className={TYPE_BADGE[doc.document_type] || TYPE_BADGE.PDF}>{doc.document_type || '—'}</Badge>
                                <Badge className={STATUS_BADGE[doc.status] || STATUS_BADGE.DRAFT}>{doc.status ? t(`documents.${String(doc.status).toLowerCase()}`, doc.status) : t("documents.draft", "Borrador")}</Badge>
                                <EmbeddingBadge status={doc.embedding_status} />
                                {doc.validity_date && <span className="text-[10px] text-muted-foreground hidden sm:block">{t("quotations.validUntil", "Valid")}: {doc.validity_date}</span>}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/documents/${encodeURIComponent(doc.name)}`); }}>
                                            <Eye className="w-3 h-3 mr-2" /> {t("documents.viewDetail", "Ver detalle")}
                                        </DropdownMenuItem>
                                        {doc.file_url && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(doc.file_url, '_blank'); }}><ExternalLink className="w-3 h-3 mr-2" /> {t("documents.openFile", "Open File")}</DropdownMenuItem>}
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleVectorize(doc); }}>
                                            <Sparkles className="w-3 h-3 mr-2" /> {doc.embedding_status === "COMPLETED" ? t("documents.revectorize", "Re-vectorizar") : t("documents.vectorize", "Vectorizar")}
                                        </DropdownMenuItem>
                                        {doc.entity_type === 'Cheese Route' && (
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/routes/${doc.entity_id}`); }}>{t("bankAccounts.viewRoute", "View Route")}</DropdownMenuItem>
                                        )}
                                        {doc.entity_type === 'Cheese Experience' && (
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/experiences/${doc.entity_id}`); }}>{t("documents.viewExperience", "View Experience")}</DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="text-red-600 focus:text-red-600"
                                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc); }}
                                        >
                                            <Trash2 className="w-3 h-3 mr-2" /> {t("documents.delete", "Eliminar")}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><FileText className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">{t("documents.noDocuments", "No documents found")}</p></div>
            )}

            {/* Delete confirmation */}
            <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            {t("documents.deleteConfirmTitle", "¿Eliminar documento?")}
                        </DialogTitle>
                        <DialogDescription className="pt-2">
                            {t("documents.deleteConfirmDesc", "Se eliminará permanentemente")} <strong>"{deleteTarget?.title || deleteTarget?.name}"</strong>. {t("documents.deleteConfirmDesc2", "El bot dejará de encontrarlo en las búsquedas semánticas. Esta acción no se puede deshacer.")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
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
