import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    History, Search, RefreshCw, ChevronDown, ChevronRight, ExternalLink,
    FileText, Image as ImageIcon, Link2, Bot, FlaskConical
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { documentSearchService } from "@/api/documentSearchService";
import { documentLink, SimilarityBadge } from "./SemanticSearchTest";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";

const TYPE_ICONS = { PDF: FileText, Image: ImageIcon, Link: Link2 };
const PAGE_SIZE = 20;

export default function SemanticSearchLogs() {
    const { t } = useTranslation();
    const { activeEstablishment } = useActiveEstablishment();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState("");
    const [source, setSource] = useState("all");
    const [expanded, setExpanded] = useState({});

    const fetchLogs = async (targetPage = page) => {
        setLoading(true);
        try {
            const res = await documentSearchService.listSearchLogs({
                page: targetPage,
                page_size: PAGE_SIZE,
                search: search.trim() || undefined,
                source: source === "all" ? undefined : source,
                company: activeEstablishment || undefined,
            });
            const payload = res?.data?.message || res?.data || {};
            setLogs(Array.isArray(payload?.data) ? payload.data : []);
            setTotalPages(payload?.meta?.total_pages || 1);
            setPage(targetPage);
        } catch (err) {
            toast.error(err?.message || t("searchHistory.loadError", "Error al cargar el historial"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source, activeEstablishment]);

    const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <History className="w-6 h-6 text-cheese-600" />
                        {t("searchHistory.title", "Historial de Búsquedas Semánticas")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t("searchHistory.description", "Auditoría de las búsquedas realizadas por el bot y desde la página de pruebas, con los documentos que devolvió cada una.")}
                    </p>
                </div>
                <Button variant="outline" size="icon" onClick={() => fetchLogs(page)} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder={t("searchHistory.searchPlaceholder", "Filtrar por texto de la consulta...")}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") fetchLogs(1); }}
                        className="pl-9"
                    />
                </div>
                <Select value={source} onValueChange={setSource}>
                    <SelectTrigger className="w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("searchHistory.allSources", "Todos los orígenes")}</SelectItem>
                        <SelectItem value="API">{t("searchHistory.sourceApi", "Bot / API")}</SelectItem>
                        <SelectItem value="TEST">{t("searchHistory.sourceTest", "Prueba manual")}</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => fetchLogs(1)} disabled={loading}>
                    {t("common.search", "Buscar")}
                </Button>
            </div>

            <div className="space-y-2">
                {loading && logs.length === 0 ? (
                    [1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)
                ) : logs.length === 0 ? (
                    <Card className="glass-surface">
                        <CardContent className="py-16 text-center">
                            <History className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                            <p className="text-muted-foreground">{t("searchHistory.empty", "Aún no hay búsquedas registradas.")}</p>
                        </CardContent>
                    </Card>
                ) : (
                    logs.map((log) => {
                        const isOpen = !!expanded[log.log_id];
                        return (
                            <Card key={log.log_id} className="glass-surface overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(log.log_id)}
                                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors"
                                >
                                    {isOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate">"{log.query}"</p>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(log.searched_at).toLocaleString()} • {log.searched_by}
                                            {log.entity_id ? ` • ${log.entity_id}` : ""}
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="shrink-0 gap-1">
                                        {log.source === "TEST" ? <FlaskConical className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                                        {log.source === "TEST"
                                            ? t("searchHistory.sourceTest", "Prueba manual")
                                            : t("searchHistory.sourceApi", "Bot / API")}
                                    </Badge>
                                    <Badge className={`shrink-0 ${log.results_count > 0
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                        : "bg-gray-500/15 text-gray-600 dark:text-gray-400"}`}>
                                        {t("searchHistory.resultCount", "{{count}} resultado(s)", { count: log.results_count })}
                                    </Badge>
                                </button>

                                {isOpen && (
                                    <div className="border-t border-border px-4 py-3 space-y-2 bg-muted/10">
                                        {(log.results || []).length === 0 ? (
                                            <p className="text-xs text-muted-foreground">
                                                {t("searchHistory.noDocuments", "Ningún documento superó el umbral de similitud.")}
                                            </p>
                                        ) : (
                                            log.results.map((doc) => {
                                                const Icon = TYPE_ICONS[doc.document_type] || FileText;
                                                const link = documentLink(doc.file_url);
                                                return (
                                                    <div key={doc.document_id} className="flex items-center justify-between gap-3 text-sm">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <Icon className="w-3.5 h-3.5 text-cheese-600 shrink-0" />
                                                            <span className="truncate">{doc.title}</span>
                                                            <SimilarityBadge value={doc.similarity} />
                                                            {doc.document_type && (
                                                                <Badge variant="outline" className="text-[10px]">{doc.document_type}</Badge>
                                                            )}
                                                        </div>
                                                        {link && (
                                                            <a
                                                                href={link}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-primary flex items-center gap-1 shrink-0 hover:underline"
                                                            >
                                                                <ExternalLink className="w-3 h-3" />
                                                                {t("semanticSearch.open", "Abrir")}
                                                            </a>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </Card>
                        );
                    })
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                    <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => fetchLogs(page - 1)}>
                        {t("common.previous", "Anterior")}
                    </Button>
                    <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => fetchLogs(page + 1)}>
                        {t("common.next", "Siguiente")}
                    </Button>
                </div>
            )}
        </motion.div>
    );
}
