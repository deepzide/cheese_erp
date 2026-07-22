import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCheck, Search, Filter, Clock, AlertCircle, RefreshCw, Ticket, QrCode, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/api/client";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
import { useTranslation } from "react-i18next";

const STATUS_CONFIG = {
    PRESENT: { label: "Presente", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    NO_SHOW: { label: "No-Show", badge: "bg-red-500/15 text-red-700 dark:text-red-400" },
};
const METHOD_BADGE = {
    QR: "bg-blue-500/15 text-blue-700", MANUAL: "bg-gray-500/15 text-gray-600",
};

export default function Attendance() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [routeId, setRouteId] = useState("");
    const { activeEstablishment: companyId } = useActiveEstablishment();

    const { data: records = [], isLoading, error, refetch } = useQuery({
        queryKey: ["attendance", filterStatus, routeId, companyId],
        queryFn: async () => {
            const payload = {};
            payload.page_size = 100;
            if (filterStatus !== "all") payload.status = filterStatus;
            if (routeId) payload.route_id = routeId;
            if (companyId) payload.company_id = companyId;
            const res = await apiRequest("/api/method/cheese.api.v1.attendance_controller.list_attendance", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            const message = res?.data?.message || res?.data || res;
            return message?.data || [];
        },
    });

    const filtered = (Array.isArray(records) ? records : []).filter(r => {
        if (searchTerm) return (r.ticket || r.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("attendance.loadFailed", "Failed to load attendance")}</h2>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><UserCheck className="w-6 h-6 text-cheese-600" /> {t("attendance.title", "Attendance")}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} ${t("attendance.records", "records")}`}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t("attendance.searchTicket", "Buscar ticket...")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-36 h-9"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t("attendance.all", "All")}</SelectItem>
                            <SelectItem value="PRESENT">{t("attendance.present", "Present")}</SelectItem>
                            <SelectItem value="NO_SHOW">{t("status.NO_SHOW", "No-Show")}</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="w-48">
                        <FrappeSearchSelect doctype="Cheese Route" label="name" value={routeId} onChange={setRouteId} placeholder={t("attendance.route", "Paquete...")} />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                {t("attendance.recordAttendance", "Registre asistencia escaneando QR desde los detalles de reserva, o use el registro manual en Operaciones.")}
            </p>

            <div className="space-y-3">
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-4 flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-lg" /><div className="flex-1"><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-24" /></div>
                    </CardContent></Card>
                )) : filtered.map((rec) => (
                    <motion.div key={rec.name} whileHover={{ x: 4 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center">
                                    <UserCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-sm text-foreground">{rec.name}</h3>
                                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                                        <Ticket className="w-3 h-3" /> {rec.ticket || '—'}
                                        <Clock className="w-3 h-3 ml-2" /> {rec.checked_in_at || '—'}
                                        {rec.route_id && <> • {t("routes.route", "Paquete")}: {rec.route_id}</>}
                                        {rec.company_id && <> • Est: {rec.company_id}</>}
                                    </p>
                                </div>
                                <Badge className={METHOD_BADGE[rec.method] || METHOD_BADGE.MANUAL}>{rec.method === 'QR' ? <><QrCode className="w-3 h-3 mr-1" />QR</> : rec.method || '—'}</Badge>
                                <Badge className={STATUS_CONFIG[rec.status]?.badge || STATUS_CONFIG.NO_SHOW.badge}>{STATUS_CONFIG[rec.status]?.label || rec.status}</Badge>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => navigate(`/cheese/tickets?search=${rec.ticket}`)}><Ticket className="w-3 h-3 mr-2" /> {t("support.viewTicket", "Ver Ticket")}</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => navigate(`/cheese/qr-tokens?ticket=${rec.ticket}`)}><QrCode className="w-3 h-3 mr-2" /> {t("nav.qrTokens", "QR Tokens")}</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><UserCheck className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">{t("attendance.noRecords", "No hay registros de asistencia")}</p></div>
            )}
        </motion.div>
    );
}
