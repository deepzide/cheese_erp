import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Search, Plus, AlertCircle, RefreshCw, Landmark } from "lucide-react";
import { establishmentService } from "@/api/establishmentService";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
import { useTranslation } from "react-i18next";

export default function Establishments() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState("");
    const [includeArchived, setIncludeArchived] = useState(false);

    const { data: payload, isLoading, error, refetch } = useQuery({
        queryKey: ["establishments", includeArchived],
        queryFn: async () => {
            const res = await establishmentService.listEstablishments({
                page: 1,
                page_size: 200,
                include_archived: includeArchived ? 1 : 0,
            });
            return res?.data?.message || res?.data || {};
        },
    });

    const { activeEstablishment } = useActiveEstablishment();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const filtered = rows.filter((e) => {
        if (activeEstablishment && e.company_id !== activeEstablishment) return false;
        if (!searchTerm) return true;
        const t = searchTerm.toLowerCase();
        return (
            (e.company_name || "").toLowerCase().includes(t) ||
            (e.company_id || "").toLowerCase().includes(t)
        );
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("establishments.loadFailed", "Failed to load establishments")}</h2>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}
                </Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-cheese-600" /> {t("nav.establishments", "Companies")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isLoading ? "…" : t("establishments.count", { count: filtered.length, defaultValue: `${filtered.length} establishments` })}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t("common.search", "Search")}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 w-56 h-9"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeArchived}
                            onChange={(e) => setIncludeArchived(e.target.checked)}
                        />
                        {t("establishments.showArchived", "Show archived")}
                    </label>
                    <Button
                        className="cheese-gradient text-black font-semibold border-0 h-9"
                        onClick={() => navigate("/cheese/establishments/new")}
                    >
                        <Plus className="w-4 h-4 mr-1" /> {t("establishments.addCompany", "Add company")}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                          <Card key={i} className="border border-border">
                              <CardContent className="p-5 space-y-3">
                                  <Skeleton className="h-5 w-40" />
                                  <Skeleton className="h-4 w-full" />
                              </CardContent>
                          </Card>
                      ))
                    : (
                        <>
                            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }}>
                                <Card
                                    className="border-2 border-dashed border-cheese-500/40 bg-cheese-500/5 hover:bg-cheese-500/10 hover:border-cheese-500/60 transition-colors cursor-pointer shadow-none"
                                    onClick={() => navigate("/cheese/establishments/new")}
                                >
                                    <CardContent className="p-5 flex flex-col items-center justify-center min-h-[140px] gap-2 text-center">
                                        <div className="w-12 h-12 rounded-xl cheese-gradient flex items-center justify-center">
                                            <Plus className="w-6 h-6 text-black" />
                                        </div>
                                        <span className="font-semibold text-foreground">{t("establishments.addCompany", "Add company")}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {t("establishments.createNewHint", "Create a new company")}
                                        </span>
                                    </CardContent>
                                </Card>
                            </motion.div>
                            {filtered.map((est) => {
                                const ba = est.bank_account || [];
                                return (
                                    <motion.div key={est.company_id} whileHover={{ y: -3 }}>
                                        <Card
                                            className="border border-border shadow-sm hover:shadow-md transition-all cursor-pointer"
                                            onClick={() =>
                                                navigate(`/cheese/establishments/${encodeURIComponent(est.company_id)}`)
                                            }
                                        >
                                            <CardContent className="p-5">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center">
                                                            <Building2 className="w-5 h-5 text-cheese-700" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-semibold text-foreground">
                                                                {est.company_name || est.company_id}
                                                            </h3>
                                                            <span className="text-xs font-mono text-muted-foreground">
                                                                {est.company_id}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Badge
                                                        className={
                                                            est.status === "ARCHIVED"
                                                                ? "bg-gray-500/15 text-gray-600"
                                                                : "bg-emerald-500/15 text-emerald-700"
                                                        }
                                                    >
                                                        {est.status || "ACTIVE"}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                                                    <Landmark className="w-3.5 h-3.5" />
                                                    {t("establishments.bankAccountsCount", { count: ba.length, defaultValue: `${ba.length} bank account${ba.length !== 1 ? "s" : ""}` })}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {est.is_hotel || est.cheese_is_hotel
                                                        ? t("hotels.hotel", "Hotel")
                                                        : t("experiences.activity", "Activity")}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {t("establishments.experiencesCount", {
                                                        count: est.experiences_count ?? 0,
                                                        defaultValue: `${est.experiences_count ?? 0} experiences`,
                                                    })}
                                                </p>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                );
                            })}
                        </>
                    )}
            </div>
        </motion.div>
    );
}
