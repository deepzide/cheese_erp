import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Ticket, Search, Filter, Plus, User, Clock, MapPin,
    Users as UsersIcon, CheckCircle, XCircle, Eye, Ban, AlertTriangle,
    MoreHorizontal, RefreshCw, AlertCircle, Download, Table2, Columns3, BedDouble, Map as MapIcon
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ticketService } from "@/api/ticketService";
import { experienceService } from "@/api/experienceService";
import { useFrappeDoc } from "@/lib/useApiData";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
import NewTicketWizard from "@/components/NewTicketWizard";

const STATUSES = ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "NO_SHOW", "CANCELLED", "EXPIRED", "REJECTED"];
const TERMINAL_STATUSES = new Set(["NO_SHOW", "CANCELLED", "EXPIRED", "REJECTED"]);

const STATUS_CONFIG = {
    "PENDING": { label: "Pendiente", color: "bg-yellow-500", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800", icon: Clock },
    "CONFIRMED": { label: "Confirmado", color: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", icon: CheckCircle },
    "CHECKED_IN": { label: "Registrado", color: "bg-blue-500", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800", icon: Eye },
    "COMPLETED": { label: "Completado", color: "bg-purple-500", badge: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800", icon: CheckCircle },
    "NO_SHOW": { label: "No presentado", color: "bg-orange-500", badge: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800", icon: Ban },
    "CANCELLED": { label: "Cancelado", color: "bg-red-500", badge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800", icon: XCircle },
    "EXPIRED": { label: "Expirado", color: "bg-gray-500", badge: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700", icon: AlertTriangle },
    "REJECTED": { label: "Rechazado", color: "bg-rose-500", badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800", icon: XCircle },
};

const TYPE_META = {
    ACTIVITY: { label: "Actividad", cls: "bg-cheese-500/15 text-cheese-700", icon: Ticket },
    HOTEL: { label: "Hotel", cls: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400", icon: BedDouble },
    ROUTE: { label: "Paquete", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400", icon: MapIcon },
};

const DATE_PRESETS = [
    { key: "all", label: "📅 Cualquier fecha" },
    { key: "upcoming", label: "Próximas" },
    { key: "7", label: "Próximos 7 días" },
    { key: "30", label: "Últimos 30 días" },
    { key: "month", label: "Este mes" },
    { key: "custom", label: "Rango personalizado" },
];

const iso = (d) => d.toISOString().slice(0, 10);

function presetRange(preset) {
    const now = new Date();
    const today = iso(now);
    if (preset === "upcoming") return { from: today, to: "" };
    if (preset === "7") return { from: today, to: iso(new Date(now.getTime() + 7 * 86400000)) };
    if (preset === "30") return { from: iso(new Date(now.getTime() - 30 * 86400000)), to: today };
    if (preset === "month") {
        return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
    }
    return { from: "", to: "" };
}

function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

const EXPORT_COLUMNS = [
    ["name", "Código"], ["type_label", "Tipo"], ["contact_name", "Cliente"], ["experience", "Experiencia"],
    ["route", "Paquete"], ["company", "Empresa"], ["ticket_date", "Fecha"], ["slot_time", "Hora"],
    ["party_size", "Personas"], ["nights", "Noches"], ["status_label", "Estado"], ["total_price", "Total"],
    ["deposit_amount", "Seña"], ["currency", "Moneda"],
];

export default function Tickets() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { activeEstablishment, establishments } = useActiveEstablishment();
    const experienceUrlFilter = searchParams.get("experience") || "";
    const routeUrlFilter = searchParams.get("route") || "";
    const bookingFilter = searchParams.get("booking") || "";
    const slotFilter = searchParams.get("slot") || "";
    const contactFilter = searchParams.get("contact") || "";

    const [view, setView] = useState("table");
    const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterType, setFilterType] = useState("all");
    const [filterExperience, setFilterExperience] = useState("all");
    const [datePreset, setDatePreset] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [hideTerminal, setHideTerminal] = useState(false);
    const [wizardOpen, setWizardOpen] = useState(false);

    const currencyByCompany = useMemo(() => {
        const map = {};
        establishments.forEach((e) => { map[e.company_id] = e.currency; });
        return map;
    }, [establishments]);

    const { data: boardData, isLoading, error, refetch } = useQuery({
        queryKey: ['ticket-board'],
        queryFn: async () => {
            const result = await ticketService.getTicketBoard();
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || payload;
        },
        staleTime: 0,
        refetchOnMount: 'always',
        refetchInterval: 30000,
    });

    const { data: experiencesData } = useQuery({
        queryKey: ['experiences-list'],
        queryFn: async () => {
            const result = await experienceService.listExperiences({ page_size: 200 });
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || [];
        },
    });
    const experiences = Array.isArray(experiencesData) ? experiencesData : [];
    const expTypeMap = useMemo(() => {
        const map = {};
        experiences.forEach((e) => { map[e.name] = e.experience_type; });
        return map;
    }, [experiences]);

    const { data: bookingDoc } = useFrappeDoc("Cheese Route Booking", bookingFilter, { enabled: !!bookingFilter });
    const bookingTicketIds = new Set((bookingDoc?.tickets || []).map((row) => row?.ticket).filter(Boolean));

    const updateStatusMutation = useMutation({
        mutationFn: ({ ticketId, newStatus, reason }) => ticketService.updateTicketStatus(ticketId, newStatus, reason),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries();
            const label = STATUS_CONFIG[variables.newStatus]?.label || variables.newStatus;
            toast.success(t("tickets.statusUpdated", "Ticket {{id}} → {{status}}", { id: variables.ticketId, status: t(`status.${variables.newStatus}`, label) }));
        },
        onError: (err) => toast.error(err?.message || t("tickets.updateError", "Failed to update ticket status")),
    });
    const updateStatus = (ticketId, newStatus) => updateStatusMutation.mutate({ ticketId, newStatus });

    // Board → flat list, enriched with type and display date
    const allTickets = useMemo(() => {
        const out = [];
        const board = boardData?.board || {};
        STATUSES.forEach(status => {
            (board[status]?.tickets || []).forEach(tk => {
                const type = tk.route ? "ROUTE" : (expTypeMap[tk.experience] === "HOTEL" ? "HOTEL" : "ACTIVITY");
                out.push({
                    ...tk,
                    status,
                    ticket_type: type,
                    ticket_date: tk.check_in_date || tk.slot_date || tk.selected_date || "",
                });
            });
        });
        return out.sort((a, b) => (a.ticket_date || "9999").localeCompare(b.ticket_date || "9999"));
    }, [boardData, expTypeMap]);

    const applyDatePreset = (preset) => {
        setDatePreset(preset);
        if (preset !== "custom") {
            const { from, to } = presetRange(preset);
            setDateFrom(from);
            setDateTo(to);
        }
    };

    const filteredTickets = useMemo(() => allTickets.filter(tk => {
        if (activeEstablishment && tk.company !== activeEstablishment) return false;
        if (experienceUrlFilter && tk.experience !== experienceUrlFilter) return false;
        if (routeUrlFilter && tk.route !== routeUrlFilter) return false;
        if (bookingFilter && !bookingTicketIds.has(tk.name)) return false;
        if (slotFilter && tk.slot !== slotFilter) return false;
        if (contactFilter && tk.contact !== contactFilter && tk.contact_name !== contactFilter) return false;
        if (filterStatus !== "all" && tk.status !== filterStatus) return false;
        if (filterType !== "all" && tk.ticket_type !== filterType) return false;
        if (filterExperience !== "all" && tk.experience !== filterExperience) return false;
        if (hideTerminal && TERMINAL_STATUSES.has(tk.status)) return false;
        if (dateFrom && (!tk.ticket_date || tk.ticket_date < dateFrom)) return false;
        if (dateTo && (!tk.ticket_date || tk.ticket_date > dateTo)) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const hit = [tk.contact_name, tk.contact, tk.name, tk.experience, tk.route]
                .some((v) => (v || '').toLowerCase().includes(term));
            if (!hit) return false;
        }
        return true;
    }), [allTickets, activeEstablishment, experienceUrlFilter, routeUrlFilter, bookingFilter, bookingTicketIds, slotFilter, contactFilter, filterStatus, filterType, filterExperience, hideTerminal, dateFrom, dateTo, searchTerm]);

    const ticketsByStatus = useMemo(() => STATUSES.reduce((acc, status) => {
        acc[status] = filteredTickets.filter(tk => tk.status === status);
        return acc;
    }, {}), [filteredTickets]);

    const experienceOptions = useMemo(
        () => [...new Set(allTickets.map(tk => tk.experience).filter(Boolean))].sort(),
        [allTickets]
    );

    const exportTickets = (format) => {
        if (!filteredTickets.length) {
            toast.info(t("tickets.nothingToExport", "No hay tickets con estos filtros"));
            return;
        }
        const rows = filteredTickets.map(tk => ({
            name: tk.name,
            type_label: TYPE_META[tk.ticket_type]?.label || tk.ticket_type,
            contact_name: tk.contact_name || tk.contact || "",
            experience: tk.experience || "",
            route: tk.route || "",
            company: tk.company || "",
            ticket_date: tk.ticket_date || "",
            slot_time: tk.slot_time || "",
            party_size: tk.party_size ?? "",
            nights: tk.nights ?? "",
            status_label: STATUS_CONFIG[tk.status]?.label || tk.status,
            total_price: tk.total_price ?? "",
            deposit_amount: tk.deposit_amount ?? "",
            currency: currencyByCompany[tk.company] || "",
        }));
        const stamp = iso(new Date()).replaceAll("-", "");
        if (format === "json") {
            downloadBlob(JSON.stringify(rows, null, 2), `tickets_${stamp}.json`, "application/json");
        } else {
            const esc = (v) => {
                const s = String(v ?? "");
                return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
            };
            const header = EXPORT_COLUMNS.map(([, es]) => es).join(",");
            const lines = rows.map(r => EXPORT_COLUMNS.map(([k]) => esc(r[k])).join(","));
            downloadBlob("﻿" + [header, ...lines].join("\n"), `tickets_${stamp}.csv`, "text/csv;charset=utf-8");
        }
        toast.success(t("tickets.exported", "{{n}} tickets exportados", { n: rows.length }));
    };

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold text-foreground mb-2">{t("tickets.loadFailed", "Failed to load tickets")}</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message || t("common.unknown", "Unknown error")}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}</Button>
            </div>
        );
    }

    const money = (tk, value) => {
        if (value == null) return "—";
        const cur = currencyByCompany[tk.company];
        return `${cur ? cur + " " : "$"}${Number(value).toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
    };

    const cardMenu = (ticket) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="w-4 h-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/cheese/tickets/${ticket.name}`)}><Eye className="w-3 h-3 mr-2" /> {t("common.viewDetails", "Ver detalle")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(`/cheese/deposits/new?ticket=${ticket.name}`)}>{t("tickets.registerDeposit", "Registrar seña")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                {ticket.status === "PENDING" && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateStatus(ticket.name, "CONFIRMED"); }}><CheckCircle className="w-3 h-3 mr-2" /> {t("common.confirm", "Confirmar")}</DropdownMenuItem>}
                {ticket.status !== "CANCELLED" && <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); updateStatus(ticket.name, "CANCELLED"); }}><XCircle className="w-3 h-3 mr-2" /> {t("common.cancel", "Cancelar")}</DropdownMenuItem>}
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/support/new?ticket=${ticket.name}`); }}><AlertTriangle className="w-3 h-3 mr-2" /> {t("tickets.createSupportCase", "Caso de soporte")}</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Ticket className="w-6 h-6 text-cheese-600" />
                        {t("nav.tickets", "Tickets")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isLoading ? '...' : `${filteredTickets.length} ${t("tickets.items", "tickets")}`}
                    </p>
                    {(experienceUrlFilter || routeUrlFilter || bookingFilter || slotFilter) && (
                        <p className="text-xs text-muted-foreground mt-1">
                            {t("common.filteredBy", "Filtrado por ")} {
                                slotFilter
                                    ? `${t("tickets.slot", "Horario:")} ${slotFilter}`
                                    : bookingFilter
                                        ? `${t("tickets.reservation", "Reserva:")} ${bookingFilter}`
                                        : (experienceUrlFilter ? `${t("tickets.experience", "Experiencia:")} ${experienceUrlFilter}` : `${t("tickets.route", "Paquete:")} ${routeUrlFilter}`)
                            }
                        </p>
                    )}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    <div className="flex rounded-lg border border-input overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setView("table")}
                            className={`flex items-center gap-1.5 px-3 h-9 text-sm font-medium ${view === "table" ? "bg-cheese-500 text-black" : "bg-background text-muted-foreground hover:text-foreground"}`}
                        >
                            <Table2 className="w-4 h-4" /> {t("tickets.tableView", "Tabla")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setView("kanban")}
                            className={`flex items-center gap-1.5 px-3 h-9 text-sm font-medium ${view === "kanban" ? "bg-cheese-500 text-black" : "bg-background text-muted-foreground hover:text-foreground"}`}
                        >
                            <Columns3 className="w-4 h-4" /> {t("tickets.kanbanView", "Kanban")}
                        </button>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-9"><Download className="w-4 h-4 mr-1" /> {t("tickets.export", "Exportar")}</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => exportTickets("csv")}>CSV</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportTickets("json")}>JSON</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => setWizardOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> {t("tickets.newTicket", "Nuevo Ticket")}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap gap-2 items-center">
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder={t("tickets.searchPlaceholder", "Buscar código, cliente, experiencia…")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-60 h-9" />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-44 h-9"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("common.allStatus", "Todos los estados")}</SelectItem>
                        {STATUSES.map(s => <SelectItem key={s} value={s}>{t(`status.${s}`, STATUS_CONFIG[s]?.label || s)}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("tickets.allTypes", "Todos los tipos")}</SelectItem>
                        <SelectItem value="ACTIVITY">{TYPE_META.ACTIVITY.label}</SelectItem>
                        <SelectItem value="HOTEL">{TYPE_META.HOTEL.label}</SelectItem>
                        <SelectItem value="ROUTE">{TYPE_META.ROUTE.label}</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={filterExperience} onValueChange={setFilterExperience}>
                    <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("tickets.allExperiences", "Todas las experiencias")}</SelectItem>
                        {experienceOptions.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={datePreset} onValueChange={applyDatePreset}>
                    <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {DATE_PRESETS.map(p => <SelectItem key={p.key} value={p.key}>{t(`tickets.datePreset.${p.key}`, p.label)}</SelectItem>)}
                    </SelectContent>
                </Select>
                {datePreset === "custom" && (
                    <>
                        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-9" />
                        <span className="text-muted-foreground text-sm">→</span>
                        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-9" />
                    </>
                )}
                <button
                    type="button"
                    onClick={() => setHideTerminal(v => !v)}
                    className={`h-9 px-3 rounded-full border text-xs font-medium transition-colors ${hideTerminal
                        ? "bg-cheese-500/15 border-cheese-500/50 text-cheese-700"
                        : "bg-background border-input text-muted-foreground hover:text-foreground"}`}
                >
                    {t("tickets.hideTerminal", "Ocultar canceladas/expiradas")}
                </button>
            </div>

            {/* Content */}
            {view === "table" ? (
                <Card className="glass-surface">
                    <CardContent className="p-0">
                        {isLoading ? (
                            <div className="p-6 space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                        ) : filteredTickets.length === 0 ? (
                            <div className="py-16 text-center">
                                <Ticket className="w-14 h-14 text-muted-foreground/20 mx-auto mb-3" />
                                <p className="text-muted-foreground text-sm mb-3">{t("tickets.emptyFiltered", "Sin tickets con estos filtros. Probá quitar filtros o cambiar el rango de fechas.")}</p>
                                <Button size="sm" className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold" onClick={() => setWizardOpen(true)}>
                                    <Plus className="w-4 h-4 mr-1" /> {t("tickets.newTicket", "Nuevo Ticket")}
                                </Button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                                            <th className="px-4 py-3">{t("tickets.colCode", "Código / Tipo")}</th>
                                            <th className="px-4 py-3">{t("tickets.colClient", "Cliente")}</th>
                                            <th className="px-4 py-3">{t("tickets.colExperience", "Experiencia")}</th>
                                            <th className="px-4 py-3">{t("tickets.colDate", "Fecha")}</th>
                                            <th className="px-4 py-3">{t("tickets.colDetail", "Detalle")}</th>
                                            <th className="px-4 py-3">{t("common.status", "Estado")}</th>
                                            <th className="px-4 py-3 text-right">{t("tickets.colTotal", "Total")}</th>
                                            <th className="px-2 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTickets.map(tk => {
                                            const ty = TYPE_META[tk.ticket_type];
                                            const st = STATUS_CONFIG[tk.status];
                                            const detail = tk.ticket_type === "HOTEL"
                                                ? `${tk.nights || 1} noche${(tk.nights || 1) !== 1 ? "s" : ""}${tk.rooms_requested ? ` · ${tk.rooms_requested} hab.` : ""}`
                                                : `${tk.party_size || 1} pax`;
                                            return (
                                                <tr
                                                    key={tk.name}
                                                    className="border-b border-border/50 hover:bg-accent/40 cursor-pointer"
                                                    onClick={() => navigate(`/cheese/tickets/${tk.name}`)}
                                                >
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs block">{tk.name}</span>
                                                        <Badge className={`${ty.cls} mt-1 text-[10px]`}>{t(`tickets.type.${tk.ticket_type}`, ty.label)}</Badge>
                                                    </td>
                                                    <td className="px-4 py-3 font-medium">{tk.contact_name || tk.contact || "—"}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="block truncate max-w-[220px]" title={tk.experience || tk.route}>{tk.experience || tk.route || "—"}</span>
                                                        {!activeEstablishment && <span className="text-xs text-muted-foreground">{tk.company}</span>}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">{tk.ticket_date || "—"}{tk.slot_time && tk.ticket_type !== "HOTEL" ? ` ${tk.slot_time.slice(0, 5)}` : ""}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{detail}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <span className={`w-2 h-2 rounded-full ${st.color}`} />
                                                            {t(`status.${tk.status}`, st.label)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono">{money(tk, tk.total_price)}</td>
                                                    <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>{cardMenu(tk)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                    {STATUSES.filter(s => !(hideTerminal && TERMINAL_STATUSES.has(s))).map(status => {
                        const config = STATUS_CONFIG[status] || STATUS_CONFIG["PENDING"];
                        const StatusIcon = config.icon;
                        const columnTickets = ticketsByStatus[status] || [];

                        return (
                            <div key={status} className="flex-shrink-0 w-72 min-w-0">
                                <div className="flex items-center gap-2 mb-3 px-1">
                                    <div className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
                                    <span className="text-sm font-semibold text-foreground">{t(`status.${status}`, config.label)}</span>
                                    <Badge variant="secondary" className="ml-auto text-xs px-1.5 py-0">
                                        {isLoading ? '...' : columnTickets.length}
                                    </Badge>
                                </div>

                                <ScrollArea className="kanban-column [&>[data-radix-scroll-area-viewport]>div]:!min-w-0 [&>[data-radix-scroll-area-viewport]>div]:!block">
                                    <div className="space-y-2 pr-1 w-full max-w-full min-w-0">
                                        {isLoading ? (
                                            Array.from({ length: 2 }).map((_, i) => (
                                                <Card key={i} className="border border-border"><CardContent className="p-3 space-y-2">
                                                    <Skeleton className="h-4 w-20" /><Skeleton className="h-6 w-full" /><Skeleton className="h-3 w-32" />
                                                </CardContent></Card>
                                            ))
                                        ) : (
                                            <>
                                                {columnTickets.map((ticket) => {
                                                    const ty = TYPE_META[ticket.ticket_type];
                                                    return (
                                                        <motion.div key={ticket.name} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ scale: 1.02, y: -2 }} transition={{ duration: 0.2 }} className="w-full max-w-full min-w-0">
                                                            <Card className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer w-full max-w-full overflow-hidden" onClick={(e) => {
                                                                if (!e.target.closest('[role="menuitem"]') && !e.target.closest('button')) {
                                                                    navigate(`/cheese/tickets/${ticket.name}`);
                                                                }
                                                            }}>
                                                                <CardContent className="p-3 pr-9 relative overflow-hidden min-w-0">
                                                                    <div className="absolute top-2 right-1.5 z-10">{cardMenu(ticket)}</div>
                                                                    <div className="mb-1.5 min-w-0 flex items-center gap-2">
                                                                        <span className="text-xs font-mono text-muted-foreground truncate">{ticket.name}</span>
                                                                        <Badge className={`${ty.cls} text-[9px] px-1.5 shrink-0`}>{t(`tickets.type.${ticket.ticket_type}`, ty.label)}</Badge>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 mb-1.5 min-w-0">
                                                                        <div className="w-7 h-7 shrink-0 rounded-full bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center">
                                                                            <User className="w-3.5 h-3.5 text-cheese-700 dark:text-cheese-400" />
                                                                        </div>
                                                                        <div className="min-w-0 flex-1 overflow-hidden">
                                                                            <p className="text-sm font-medium text-foreground truncate">{ticket.contact_name || ticket.contact || t("common.unknown", "Unknown")}</p>
                                                                        </div>
                                                                    </div>
                                                                    <p className="text-[10px] leading-snug text-muted-foreground mb-2 line-clamp-2 break-words" title={ticket.experience || undefined}>
                                                                        {ticket.experience || ticket.route || '—'}
                                                                    </p>
                                                                    <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                                                                        <span className="flex items-center gap-1 text-muted-foreground min-w-0 truncate">
                                                                            <Clock className="w-3 h-3 shrink-0" />
                                                                            <span className="truncate">{ticket.ticket_date || '—'}{ticket.slot_time && ticket.ticket_type !== "HOTEL" ? ` · ${ticket.slot_time.slice(0, 5)}` : ''}</span>
                                                                        </span>
                                                                        <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                                                                            <UsersIcon className="w-3 h-3" /> {ticket.party_size || 1}
                                                                        </span>
                                                                    </div>
                                                                    {ticket.route && (
                                                                        <div className="mt-2 pt-2 border-t border-border min-w-0">
                                                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 min-w-0">
                                                                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                                                                <span className="truncate" title={ticket.route}>{ticket.route}</span>
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </CardContent>
                                                            </Card>
                                                        </motion.div>
                                                    );
                                                })}
                                                {columnTickets.length === 0 && (
                                                    <div className="p-8 text-center rounded-xl border-2 border-dashed border-border">
                                                        <StatusIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                                                        <p className="text-xs text-muted-foreground">{t("tickets.noTickets", "Sin tickets")}</p>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        );
                    })}
                </div>
            )}

            <NewTicketWizard open={wizardOpen} onOpenChange={setWizardOpen} />
        </motion.div>
    );
}
