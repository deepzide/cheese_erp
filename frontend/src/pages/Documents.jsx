import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search, Plus, AlertCircle, RefreshCw, MoreHorizontal, ExternalLink } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFrappeList } from "@/lib/useApiData";
import { useHotelAccess } from "@/lib/useHotelAccess";
import { useTranslation } from "react-i18next";

const TYPE_BADGE = { PDF: "bg-red-500/15 text-red-700", Image: "bg-blue-500/15 text-blue-700", Link: "bg-purple-500/15 text-purple-700" };
const STATUS_BADGE = { DRAFT: "bg-yellow-500/15 text-yellow-700", PUBLISHED: "bg-emerald-500/15 text-emerald-700", ARCHIVED: "bg-gray-500/15 text-gray-600" };

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
        fields: ["name", "entity_type", "entity_id", "title", "document_type", "file_url", "status", "language", "version", "validity_date", "tags", "creation"],
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
        fields: ["name", "entity_type", "entity_id", "title", "document_type", "file_url", "status", "language", "version", "validity_date", "tags", "creation"],
        pageSize: 100,
    });

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
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
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
                                {doc.validity_date && <span className="text-[10px] text-muted-foreground hidden sm:block">{t("quotations.validUntil", "Valid")}: {doc.validity_date}</span>}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {doc.file_url && <DropdownMenuItem onClick={() => window.open(doc.file_url, '_blank')}><ExternalLink className="w-3 h-3 mr-2" /> {t("documents.openFile", "Open File")}</DropdownMenuItem>}
                                        {doc.entity_type === 'Cheese Route' && (
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/routes/${doc.entity_id}`)}>{t("bankAccounts.viewRoute", "View Route")}</DropdownMenuItem>
                                        )}
                                        {doc.entity_type === 'Cheese Experience' && (
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/experiences/${doc.entity_id}`)}>{t("documents.viewExperience", "View Experience")}</DropdownMenuItem>
                                        )}
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

        </motion.div>
    );
}
