import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
    FileSearch, Search, Loader2, ExternalLink, FileText, Image as ImageIcon,
    Link2, Sparkles
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { documentSearchService } from "@/api/documentSearchService";
import { getBaseUrl, unwrapFrappeMethodData } from "@/api/client";

const TYPE_ICONS = { PDF: FileText, Image: ImageIcon, Link: Link2 };

export function documentLink(fileUrl) {
    if (!fileUrl) return null;
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    return `${getBaseUrl().replace(/\/$/, "")}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

export function SimilarityBadge({ value }) {
    const pct = Math.round((value || 0) * 100);
    const tone = pct >= 60
        ? "border-emerald-500/50 text-emerald-600 bg-emerald-500/5"
        : pct >= 45
            ? "border-cheese-500/50 text-cheese-700 bg-cheese-500/5"
            : "border-border text-muted-foreground";
    return <Badge variant="outline" className={tone}>{pct}%</Badge>;
}

export default function SemanticSearchTest() {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const [topK, setTopK] = useState("5");
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState(null);

    const handleSearch = async () => {
        if (!query.trim()) {
            toast.error(t("semanticSearch.queryRequired", "Escribe una consulta"));
            return;
        }
        setSearching(true);
        setResults(null);
        try {
            const res = await documentSearchService.searchSemantic({
                query: query.trim(),
                top_k: parseInt(topK) || 5,
            });
            const data = unwrapFrappeMethodData(res, {});
            setResults(data?.results || []);
        } catch (err) {
            if (err?.status === 503 || err?.code === "NOT_CONFIGURED") {
                toast.error(t("semanticSearch.notConfigured", "La búsqueda semántica no está configurada. Activa los embeddings y la OpenAI API key en Configuración del Webhook."));
            } else {
                toast.error(err?.message || t("semanticSearch.searchError", "Error al buscar"));
            }
        } finally {
            setSearching(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <FileSearch className="w-6 h-6 text-cheese-600" />
                    {t("semanticSearch.title", "Probar Búsqueda Semántica")}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {t("semanticSearch.description", "Escribe una consulta en lenguaje natural y obtén los documentos más relevantes por similitud semántica — la misma búsqueda que usa el bot.")}
                </p>
            </div>

            <Card className="glass-surface">
                <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                            <Sparkles className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder={t("semanticSearch.queryPlaceholder", "Ej: ofertas gastronómicas de La Cremerie")}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
                                className="pl-9"
                            />
                        </div>
                        <div className="flex gap-2 items-center">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">Top</Label>
                            <Input
                                type="number"
                                min="1"
                                max="20"
                                value={topK}
                                onChange={e => setTopK(e.target.value)}
                                className="w-20"
                            />
                            <Button
                                className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold"
                                onClick={handleSearch}
                                disabled={searching}
                            >
                                {searching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                                {t("semanticSearch.search", "Buscar")}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <AnimatePresence>
                {results !== null && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <Card className="glass-surface">
                            <CardHeader>
                                <CardTitle className="text-base">
                                    {results.length > 0
                                        ? t("semanticSearch.resultsFound", "{{count}} documento(s) relevantes", { count: results.length })
                                        : t("semanticSearch.noResults", "Sin documentos relevantes")}
                                </CardTitle>
                                {results.length === 0 && (
                                    <CardDescription>
                                        {t("semanticSearch.noResultsHint", "Ningún documento superó el umbral de similitud (35%). Es un resultado válido: el bot respondería con las herramientas de catálogo.")}
                                    </CardDescription>
                                )}
                            </CardHeader>
                            {results.length > 0 && (
                                <CardContent className="space-y-3">
                                    {results.map((doc) => {
                                        const Icon = TYPE_ICONS[doc.document_type] || FileText;
                                        const link = documentLink(doc.file_url);
                                        return (
                                            <div key={doc.document_id} className="p-4 border border-border rounded-lg flex items-start justify-between gap-4 hover:bg-muted/20 transition-colors">
                                                <div className="min-w-0 space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <Icon className="w-4 h-4 text-cheese-600 shrink-0" />
                                                        <span className="font-semibold text-sm">{doc.title}</span>
                                                        <SimilarityBadge value={doc.similarity} />
                                                        <Badge variant="outline" className="text-[10px]">{doc.document_type}</Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {doc.entity_type}: {doc.entity_id}
                                                        {doc.tags ? ` • ${doc.tags}` : ""}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground font-mono truncate">{doc.document_id}</p>
                                                </div>
                                                {link && (
                                                    <Button variant="outline" size="sm" asChild className="shrink-0">
                                                        <a href={link} target="_blank" rel="noopener noreferrer">
                                                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                                            {t("semanticSearch.open", "Abrir")}
                                                        </a>
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </CardContent>
                            )}
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
