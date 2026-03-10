import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Ticket, Search, Filter, Plus, User, Clock, MapPin,
    Users as UsersIcon, CheckCircle, XCircle, Eye, Ban, AlertTriangle,
    ChevronRight, MoreHorizontal, RefreshCw, AlertCircle, Loader2
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ticketService } from "@/api/ticketService";
import { experienceService } from "@/api/experienceService";
import { routeService } from "@/api/routeService";
import { extractData } from "@/lib/useApiData";

const STATUSES = ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED", "REJECTED"];

const STATUS_CONFIG = {
    "PENDING": { label: "Pending", color: "bg-yellow-500", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800", icon: Clock },
    "CONFIRMED": { label: "Confirmed", color: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", icon: CheckCircle },
    "CHECKED_IN": { label: "Checked-In", color: "bg-blue-500", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800", icon: Eye },
    "COMPLETED": { label: "Completed", color: "bg-purple-500", badge: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800", icon: CheckCircle },
    "CANCELLED": { label: "Cancelled", color: "bg-red-500", badge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800", icon: XCircle },
    "NO_SHOW": { label: "No-Show", color: "bg-orange-500", badge: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800", icon: Ban },
    "EXPIRED": { label: "Expired", color: "bg-gray-500", badge: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700", icon: AlertTriangle },
    "REJECTED": { label: "Rejected", color: "bg-rose-500", badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800", icon: XCircle },
};

const emptyForm = { contact_id: "", experience_id: "", slot_id: "", party_size: "1" };

export default function Tickets() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);

    // Fetch ticket board data
    const { data: boardData, isLoading, error, refetch } = useQuery({
        queryKey: ['ticket-board'],
        queryFn: async () => {
            const result = await ticketService.getTicketBoard();
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || payload;
        },
    });

    // Fetch experiences for create form
    const { data: experiencesData } = useQuery({
        queryKey: ['experiences-list'],
        queryFn: async () => {
            const result = await experienceService.listExperiences({ page_size: 100 });
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || [];
        },
    });

    // Fetch routes for display
    const { data: routesData } = useQuery({
        queryKey: ['routes-list'],
        queryFn: async () => {
            const result = await routeService.listRoutes({ page_size: 100 });
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || [];
        },
    });

    const experiences = Array.isArray(experiencesData) ? experiencesData : [];
    const routes = Array.isArray(routesData) ? routesData : [];

    // Status update mutation
    const updateStatusMutation = useMutation({
        mutationFn: ({ ticketId, newStatus, reason }) =>
            ticketService.updateTicketStatus(ticketId, newStatus, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ticket-board'] });
            setDetailOpen(false);
        },
    });

    // Create ticket mutation
    const createMutation = useMutation({
        mutationFn: (data) => ticketService.createPendingTicket(data),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['ticket-board'] });
            setForm(emptyForm);
            setCreateOpen(false);
            toast.success("Ticket created successfully");
        },
        onError: (err) => toast.error(err?.message || "Failed to create ticket"),
    });

    // Build ticket list from board data
    const allTickets = [];
    const board = boardData?.board || {};
    STATUSES.forEach(status => {
        const col = board[status];
        if (col?.tickets) {
            col.tickets.forEach(t => allTickets.push({ ...t, status }));
        }
    });

    // Filter tickets
    const filteredTickets = allTickets.filter(t => {
        if (filterStatus !== "all" && t.status !== filterStatus) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const matchName = (t.contact_name || t.contact || '').toLowerCase().includes(term);
            const matchId = (t.name || '').toLowerCase().includes(term);
            if (!matchName && !matchId) return false;
        }
        return true;
    });

    const ticketsByStatus = STATUSES.reduce((acc, status) => {
        acc[status] = filteredTickets.filter(t => t.status === status);
        return acc;
    }, {});

    const openDetail = (ticket) => { setSelectedTicket(ticket); setDetailOpen(true); };

    const handleCreate = () => {
        if (!form.contact_id || !form.experience_id) {
            toast.error("Contact and experience are required");
            return;
        }
        createMutation.mutate({
            contact_id: form.contact_id,
            experience_id: form.experience_id,
            slot_id: form.slot_id,
            party_size: parseInt(form.party_size) || 1,
        });
    };

    const updateStatus = (ticketId, newStatus) => {
        updateStatusMutation.mutate({ ticketId, newStatus });
        toast.success(`Ticket ${ticketId} → ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
    };

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold text-foreground mb-2">Failed to load tickets</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message || 'Unknown error'}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Ticket className="w-6 h-6 text-cheese-600" />
                        Ticket Board
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isLoading ? '...' : `${boardData?.total_tickets || 0} tickets`} • Drag to change status
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Search tickets..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-64 h-9" />
                    </div>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-40 h-9"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => navigate("/cheese/tickets/new")}>
                        <Plus className="w-4 h-4 mr-1" /> New Ticket
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                {STATUSES.map(status => {
                    const config = STATUS_CONFIG[status] || STATUS_CONFIG["PENDING"];
                    const StatusIcon = config.icon;
                    const columnTickets = ticketsByStatus[status] || [];

                    return (
                        <div key={status} className="flex-shrink-0 w-72">
                            <div className="flex items-center gap-2 mb-3 px-1">
                                <div className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
                                <span className="text-sm font-semibold text-foreground">{config.label}</span>
                                <Badge variant="secondary" className="ml-auto text-xs px-1.5 py-0">
                                    {isLoading ? '...' : columnTickets.length}
                                </Badge>
                            </div>

                            <ScrollArea className="kanban-column">
                                <div className="space-y-2 pr-1">
                                    {isLoading ? (
                                        Array.from({ length: 2 }).map((_, i) => (
                                            <Card key={i} className="border border-border"><CardContent className="p-3 space-y-2">
                                                <Skeleton className="h-4 w-20" /><Skeleton className="h-6 w-full" /><Skeleton className="h-3 w-32" />
                                            </CardContent></Card>
                                        ))
                                    ) : (
                                        <>
                                            {columnTickets.map((ticket) => (
                                                <motion.div key={ticket.name} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ scale: 1.02, y: -2 }} transition={{ duration: 0.2 }}>
                                                    <Card className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={(e) => {
                                                        if (!e.target.closest('[role="menuitem"]') && !e.target.closest('button')) {
                                                            navigate(`/cheese/tickets/${ticket.name}`);
                                                        }
                                                    }}>
                                                        <CardContent className="p-3">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs font-mono text-muted-foreground">{ticket.name}</span>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                                                            <MoreHorizontal className="w-3 h-3" />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem onClick={() => navigate(`/cheese/tickets/${ticket.name}`)}><Eye className="w-3 h-3 mr-2" /> View Details</DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem onClick={() => navigate(`/cheese/bookings/new?ticket=${ticket.name}`)}>Convert to Booking</DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => navigate(`/cheese/deposits/new?ticket=${ticket.name}`)}>Register Deposit</DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        {ticket.status === "PENDING" && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateStatus(ticket.name, "CONFIRMED"); }}><CheckCircle className="w-3 h-3 mr-2" /> Confirm</DropdownMenuItem>}
                                                                        {ticket.status !== "CANCELLED" && <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); updateStatus(ticket.name, "CANCELLED"); }}><XCircle className="w-3 h-3 mr-2" /> Cancel</DropdownMenuItem>}
                                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/support/new?ticket=${ticket.name}`); }}><AlertTriangle className="w-3 h-3 mr-2" /> Create Support Case</DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </div>
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="w-7 h-7 rounded-full bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center">
                                                                    <User className="w-3.5 h-3.5 text-cheese-700 dark:text-cheese-400" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-medium text-foreground truncate">{ticket.contact_name || ticket.contact || 'Unknown'}</p>
                                                                </div>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground mb-2 truncate">{ticket.experience || '—'}</p>
                                                            <div className="flex items-center justify-between text-xs">
                                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                                    <Clock className="w-3 h-3" /> {ticket.slot_time || '—'}
                                                                </span>
                                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                                    <UsersIcon className="w-3 h-3" /> {ticket.party_size || 1}
                                                                </span>
                                                            </div>
                                                            {ticket.route && (
                                                                <div className="mt-2 pt-2 border-t border-border">
                                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                        <MapPin className="w-2.5 h-2.5" /> {ticket.route}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </CardContent>
                                                    </Card>
                                                </motion.div>
                                            ))}
                                            {columnTickets.length === 0 && (
                                                <div className="p-8 text-center rounded-xl border-2 border-dashed border-border">
                                                    <StatusIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                                                    <p className="text-xs text-muted-foreground">No tickets</p>
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

            {/* Create Ticket Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> Create New Ticket</DialogTitle>
                        <DialogDescription>Create a new pending ticket for a guest</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Contact ID *</Label>
                            <Input placeholder="e.g. CT-001 or contact name" value={form.contact_id} onChange={(e) => setForm(f => ({ ...f, contact_id: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Experience *</Label>
                                <Select value={form.experience_id} onValueChange={(v) => setForm(f => ({ ...f, experience_id: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        {experiences.map(e => <SelectItem key={e.name} value={e.name}>{e.experience_info || e.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Party Size</Label>
                                <Input type="number" min="1" max="20" value={form.party_size} onChange={(e) => setForm(f => ({ ...f, party_size: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Slot ID</Label>
                            <Input placeholder="e.g. SLOT-001" value={form.slot_id} onChange={(e) => setForm(f => ({ ...f, slot_id: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                            Create Ticket
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Ticket Detail Dialog */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Ticket className="w-5 h-5 text-cheese-600" /> {selectedTicket?.name}</DialogTitle>
                        <DialogDescription>Ticket Details</DialogDescription>
                    </DialogHeader>
                    {selectedTicket && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><p className="text-xs text-muted-foreground">Contact</p><p className="font-medium text-sm">{selectedTicket.contact_name || selectedTicket.contact || '—'}</p></div>
                                <div><p className="text-xs text-muted-foreground">Status</p><Badge className={STATUS_CONFIG[selectedTicket.status]?.badge}>{STATUS_CONFIG[selectedTicket.status]?.label || selectedTicket.status}</Badge></div>
                                <div><p className="text-xs text-muted-foreground">Experience</p><p className="font-medium text-sm">{selectedTicket.experience || '—'}</p></div>
                                <div><p className="text-xs text-muted-foreground">Route</p><p className="font-medium text-sm">{selectedTicket.route || '—'}</p></div>
                                <div><p className="text-xs text-muted-foreground">Time</p><p className="font-medium text-sm">{selectedTicket.slot_time || '—'}</p></div>
                                <div><p className="text-xs text-muted-foreground">Date</p><p className="font-medium text-sm">{selectedTicket.slot_date || '—'}</p></div>
                                <div><p className="text-xs text-muted-foreground">Party Size</p><p className="font-medium text-sm">{selectedTicket.party_size || 1} people</p></div>
                                <div><p className="text-xs text-muted-foreground">Company</p><p className="font-medium text-sm">{selectedTicket.company || '—'}</p></div>
                            </div>
                            <DialogFooter className="gap-2">
                                {selectedTicket.status === "PENDING" && (
                                    <>
                                        <Button className="cheese-gradient text-black border-0" onClick={() => updateStatus(selectedTicket.name, "CONFIRMED")}><CheckCircle className="w-4 h-4 mr-1" /> Confirm</Button>
                                        <Button variant="destructive" onClick={() => updateStatus(selectedTicket.name, "REJECTED")}><XCircle className="w-4 h-4 mr-1" /> Reject</Button>
                                    </>
                                )}
                                {selectedTicket.status === "CONFIRMED" && (
                                    <Button className="bg-blue-500 text-white hover:bg-blue-600" onClick={() => updateStatus(selectedTicket.name, "CHECKED_IN")}><Eye className="w-4 h-4 mr-1" /> Check In</Button>
                                )}
                                {selectedTicket.status === "CHECKED_IN" && (
                                    <>
                                        <Button className="bg-purple-500 text-white hover:bg-purple-600" onClick={() => updateStatus(selectedTicket.name, "COMPLETED")}><CheckCircle className="w-4 h-4 mr-1" /> Complete</Button>
                                        <Button variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950" onClick={() => updateStatus(selectedTicket.name, "NO_SHOW")}><Ban className="w-4 h-4 mr-1" /> No-Show</Button>
                                    </>
                                )}
                                <Button variant="outline" onClick={() => navigate(`/cheese/support/new?ticket=${selectedTicket.name}`)}>
                                    <AlertTriangle className="w-4 h-4 mr-1" /> Support Case
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
