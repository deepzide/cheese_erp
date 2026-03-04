import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const STATUSES = ["Pending", "Confirmed", "Checked-In", "Completed", "Cancelled", "No-Show"];

const STATUS_CONFIG = {
    "Pending": { color: "bg-yellow-500", badge: "bg-yellow-500/15 text-yellow-700 border-yellow-200", icon: Clock },
    "Confirmed": { color: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 border-emerald-200", icon: CheckCircle },
    "Checked-In": { color: "bg-blue-500", badge: "bg-blue-500/15 text-blue-700 border-blue-200", icon: Eye },
    "Completed": { color: "bg-purple-500", badge: "bg-purple-500/15 text-purple-700 border-purple-200", icon: CheckCircle },
    "Cancelled": { color: "bg-red-500", badge: "bg-red-500/15 text-red-700 border-red-200", icon: XCircle },
    "No-Show": { color: "bg-orange-500", badge: "bg-orange-500/15 text-orange-700 border-orange-200", icon: Ban },
};

const generateMockTickets = () => {
    const names = ["Alice Johnson", "Bob Smith", "Carlos Rivera", "Diana Lee", "Evgeny Petrov", "Fatima Al-Rashid", "George Chen", "Hannah Kim", "Ivan Smirnov", "Julia Costa", "Karl Muller", "Leila Mahmoud"];
    const experiences = ["Wine Tasting Tour", "Cheese Factory Visit", "Gourmet Lunch", "Artisan Workshop", "Sunset Walk", "VIP Cave Tour"];
    const routes = ["Golden Route", "Classic Tour", "Premium Experience", "Family Fun"];
    const tickets = [];
    let id = 1;
    STATUSES.forEach(status => {
        const count = status === "Pending" ? 4 : status === "Confirmed" ? 6 : status === "Checked-In" ? 3 : status === "Completed" ? 5 : status === "Cancelled" ? 2 : 1;
        for (let i = 0; i < count; i++) {
            tickets.push({
                id: `TK-${String(id++).padStart(4, '0')}`,
                contact: names[Math.floor(Math.random() * names.length)],
                experience: experiences[Math.floor(Math.random() * experiences.length)],
                route: routes[Math.floor(Math.random() * routes.length)],
                status,
                party_size: Math.floor(Math.random() * 5) + 1,
                time: `${9 + Math.floor(Math.random() * 9)}:${Math.random() > 0.5 ? '00' : '30'}`,
                created: "2 hours ago",
            });
        }
    });
    return tickets;
};

export default function Tickets() {
    const [tickets] = useState(generateMockTickets);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);

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

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 space-y-6"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
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
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9">
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
                                <span className="text-sm font-semibold text-gray-700">{status}</span>
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
                                                className="border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                                                onClick={() => openDetail(ticket)}
                                            >
                                                <CardContent className="p-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-mono text-muted-foreground">{ticket.id}</span>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <MoreHorizontal className="w-3 h-3" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem><Eye className="w-3 h-3 mr-2" /> View Details</DropdownMenuItem>
                                                                <DropdownMenuItem><CheckCircle className="w-3 h-3 mr-2" /> Confirm</DropdownMenuItem>
                                                                <DropdownMenuItem className="text-red-600"><XCircle className="w-3 h-3 mr-2" /> Cancel</DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>

                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="w-7 h-7 rounded-full bg-cheese-100 flex items-center justify-center">
                                                            <User className="w-3.5 h-3.5 text-cheese-700" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-gray-900 truncate">{ticket.contact}</p>
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

                                                    <div className="mt-2 pt-2 border-t border-gray-50">
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <MapPin className="w-2.5 h-2.5" /> {ticket.route}
                                                        </span>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </motion.div>
                                    ))}

                                    {columnTickets.length === 0 && (
                                        <div className="p-8 text-center rounded-xl border-2 border-dashed border-gray-200">
                                            <StatusIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                            <p className="text-xs text-muted-foreground">No tickets</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    );
                })}
            </div>

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
                                        <Button className="cheese-gradient text-black border-0">
                                            <CheckCircle className="w-4 h-4 mr-1" /> Confirm
                                        </Button>
                                        <Button variant="destructive">
                                            <XCircle className="w-4 h-4 mr-1" /> Reject
                                        </Button>
                                    </>
                                )}
                                {selectedTicket.status === "Confirmed" && (
                                    <Button className="bg-blue-500 text-white hover:bg-blue-600">
                                        <Eye className="w-4 h-4 mr-1" /> Check In
                                    </Button>
                                )}
                                {selectedTicket.status === "Checked-In" && (
                                    <>
                                        <Button className="bg-purple-500 text-white hover:bg-purple-600">
                                            <CheckCircle className="w-4 h-4 mr-1" /> Complete
                                        </Button>
                                        <Button variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50">
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
