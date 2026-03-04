import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Ticket, Search, Filter, Plus, User, Clock, MapPin,
    Users as UsersIcon, CheckCircle, XCircle, Eye, Ban, AlertTriangle,
    ChevronRight, MoreHorizontal
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const STATUSES = ["Pending", "Confirmed", "Checked-In", "Completed", "Cancelled", "No-Show"];

const STATUS_CONFIG = {
    "Pending": { color: "bg-yellow-500", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800", icon: Clock },
    "Confirmed": { color: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", icon: CheckCircle },
    "Checked-In": { color: "bg-blue-500", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800", icon: Eye },
    "Completed": { color: "bg-purple-500", badge: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800", icon: CheckCircle },
    "Cancelled": { color: "bg-red-500", badge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800", icon: XCircle },
    "No-Show": { color: "bg-orange-500", badge: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800", icon: Ban },
};

const EXPERIENCES = ["Wine Tasting Tour", "Cheese Factory Visit", "Gourmet Lunch", "Artisan Workshop", "Sunset Walk", "VIP Cave Tour"];
const ROUTES = ["Golden Route", "Classic Tour", "Premium Experience", "Family Fun"];

const generateMockTickets = () => {
    const names = ["Alice Johnson", "Bob Smith", "Carlos Rivera", "Diana Lee", "Evgeny Petrov", "Fatima Al-Rashid", "George Chen", "Hannah Kim", "Ivan Smirnov", "Julia Costa", "Karl Muller", "Leila Mahmoud"];
    const tickets = [];
    let id = 1;
    STATUSES.forEach(status => {
        const count = status === "Pending" ? 4 : status === "Confirmed" ? 6 : status === "Checked-In" ? 3 : status === "Completed" ? 5 : status === "Cancelled" ? 2 : 1;
        for (let i = 0; i < count; i++) {
            tickets.push({
                id: `TK-${String(id++).padStart(4, '0')}`,
                contact: names[Math.floor(Math.random() * names.length)],
                experience: EXPERIENCES[Math.floor(Math.random() * EXPERIENCES.length)],
                route: ROUTES[Math.floor(Math.random() * ROUTES.length)],
                status,
                party_size: Math.floor(Math.random() * 5) + 1,
                time: `${9 + Math.floor(Math.random() * 9)}:${Math.random() > 0.5 ? '00' : '30'}`,
                created: "2 hours ago",
            });
        }
    });
    return tickets;
};

const emptyForm = { contact: "", experience: "", route: "", party_size: "1", time: "10:00" };

export default function Tickets() {
    const [tickets, setTickets] = useState(generateMockTickets);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);

    const filteredTickets = tickets.filter(t => {
        if (filterStatus !== "all" && t.status !== filterStatus) return false;
        if (searchTerm && !t.contact.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !t.id.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
    });

    const ticketsByStatus = STATUSES.reduce((acc, status) => {
        acc[status] = filteredTickets.filter(t => t.status === status);
        return acc;
    }, {});

    const openDetail = (ticket) => {
        setSelectedTicket(ticket);
        setDetailOpen(true);
    };

    const handleCreate = () => {
        if (!form.contact || !form.experience || !form.route) {
            toast.error("Please fill in all required fields");
            return;
        }
        const newTicket = {
            id: `TK-${String(tickets.length + 1).padStart(4, '0')}`,
            contact: form.contact,
            experience: form.experience,
            route: form.route,
            party_size: parseInt(form.party_size) || 1,
            time: form.time,
            status: "Pending",
            created: "Just now",
        };
        setTickets(prev => [newTicket, ...prev]);
        setForm(emptyForm);
        setCreateOpen(false);
        toast.success(`Ticket ${newTicket.id} created`);
    };

    const updateStatus = (ticketId, newStatus) => {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
        setDetailOpen(false);
        toast.success(`Ticket ${ticketId} → ${newStatus}`);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 space-y-6"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Ticket className="w-6 h-6 text-cheese-600" />
                        Ticket Board
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {filteredTickets.length} tickets • Drag to change status
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search tickets..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 w-64 h-9"
                        />
                    </div>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-40 h-9">
                            <Filter className="w-3 h-3 mr-1" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => setCreateOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> New Ticket
                    </Button>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                {STATUSES.map(status => {
                    const config = STATUS_CONFIG[status];
                    const StatusIcon = config.icon;
                    const columnTickets = ticketsByStatus[status] || [];

                    return (
                        <div key={status} className="flex-shrink-0 w-72">
                            {/* Column Header */}
                            <div className="flex items-center gap-2 mb-3 px-1">
                                <div className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
                                <span className="text-sm font-semibold text-foreground">{status}</span>
                                <Badge variant="secondary" className="ml-auto text-xs px-1.5 py-0">
                                    {columnTickets.length}
                                </Badge>
                            </div>

                            {/* Cards */}
                            <ScrollArea className="kanban-column">
                                <div className="space-y-2 pr-1">
                                    {columnTickets.map((ticket) => (
                                        <motion.div
                                            key={ticket.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            whileHover={{ scale: 1.02, y: -2 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <Card
                                                className="border border-border shadow-sm hover:shadow-md transition-all cursor-pointer group"
                                                onClick={() => openDetail(ticket)}
                                            >
                                                <CardContent className="p-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-mono text-muted-foreground">{ticket.id}</span>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                                                    <MoreHorizontal className="w-3 h-3" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(ticket); }}><Eye className="w-3 h-3 mr-2" /> View Details</DropdownMenuItem>
                                                                {ticket.status === "Pending" && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, "Confirmed"); }}><CheckCircle className="w-3 h-3 mr-2" /> Confirm</DropdownMenuItem>}
                                                                {ticket.status !== "Cancelled" && <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, "Cancelled"); }}><XCircle className="w-3 h-3 mr-2" /> Cancel</DropdownMenuItem>}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>

                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="w-7 h-7 rounded-full bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center">
                                                            <User className="w-3.5 h-3.5 text-cheese-700 dark:text-cheese-400" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-foreground truncate">{ticket.contact}</p>
                                                        </div>
                                                    </div>

                                                    <p className="text-xs text-muted-foreground mb-2 truncate">
                                                        {ticket.experience}
                                                    </p>

                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="flex items-center gap-1 text-muted-foreground">
                                                            <Clock className="w-3 h-3" /> {ticket.time}
                                                        </span>
                                                        <span className="flex items-center gap-1 text-muted-foreground">
                                                            <UsersIcon className="w-3 h-3" /> {ticket.party_size}
                                                        </span>
                                                    </div>

                                                    <div className="mt-2 pt-2 border-t border-border">
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <MapPin className="w-2.5 h-2.5" /> {ticket.route}
                                                        </span>
                                                    </div>
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
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-cheese-600" />
                            Create New Ticket
                        </DialogTitle>
                        <DialogDescription>Create a new pending ticket for a guest</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Contact Name *</Label>
                            <Input placeholder="Guest name" value={form.contact} onChange={(e) => setForm(f => ({ ...f, contact: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Experience *</Label>
                                <Select value={form.experience} onValueChange={(v) => setForm(f => ({ ...f, experience: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        {EXPERIENCES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Route *</Label>
                                <Select value={form.route} onValueChange={(v) => setForm(f => ({ ...f, route: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        {ROUTES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Party Size</Label>
                                <Input type="number" min="1" max="20" value={form.party_size} onChange={(e) => setForm(f => ({ ...f, party_size: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Time</Label>
                                <Input type="time" value={form.time} onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate}>
                            <Plus className="w-4 h-4 mr-1" /> Create Ticket
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Ticket Detail Dialog */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Ticket className="w-5 h-5 text-cheese-600" />
                            {selectedTicket?.id}
                        </DialogTitle>
                        <DialogDescription>Ticket Details</DialogDescription>
                    </DialogHeader>
                    {selectedTicket && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">Contact</p>
                                    <p className="font-medium text-sm">{selectedTicket.contact}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Status</p>
                                    <Badge className={STATUS_CONFIG[selectedTicket.status]?.badge}>
                                        {selectedTicket.status}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Experience</p>
                                    <p className="font-medium text-sm">{selectedTicket.experience}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Route</p>
                                    <p className="font-medium text-sm">{selectedTicket.route}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Time</p>
                                    <p className="font-medium text-sm">{selectedTicket.time}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Party Size</p>
                                    <p className="font-medium text-sm">{selectedTicket.party_size} people</p>
                                </div>
                            </div>
                            <DialogFooter className="gap-2">
                                {selectedTicket.status === "Pending" && (
                                    <>
                                        <Button className="cheese-gradient text-black border-0" onClick={() => updateStatus(selectedTicket.id, "Confirmed")}>
                                            <CheckCircle className="w-4 h-4 mr-1" /> Confirm
                                        </Button>
                                        <Button variant="destructive" onClick={() => updateStatus(selectedTicket.id, "Cancelled")}>
                                            <XCircle className="w-4 h-4 mr-1" /> Reject
                                        </Button>
                                    </>
                                )}
                                {selectedTicket.status === "Confirmed" && (
                                    <Button className="bg-blue-500 text-white hover:bg-blue-600" onClick={() => updateStatus(selectedTicket.id, "Checked-In")}>
                                        <Eye className="w-4 h-4 mr-1" /> Check In
                                    </Button>
                                )}
                                {selectedTicket.status === "Checked-In" && (
                                    <>
                                        <Button className="bg-purple-500 text-white hover:bg-purple-600" onClick={() => updateStatus(selectedTicket.id, "Completed")}>
                                            <CheckCircle className="w-4 h-4 mr-1" /> Complete
                                        </Button>
                                        <Button variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950" onClick={() => updateStatus(selectedTicket.id, "No-Show")}>
                                            <Ban className="w-4 h-4 mr-1" /> No-Show
                                        </Button>
                                    </>
                                )}
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
