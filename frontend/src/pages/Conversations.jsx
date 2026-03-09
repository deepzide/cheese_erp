import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageSquare, Search, Filter, Clock, AlertCircle, RefreshCw, User, Ticket, ExternalLink, MoreHorizontal, ShoppingCart } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useFrappeList } from "@/lib/useApiData";

const STATUS_CONFIG = {
    OPEN: { label: "Open", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    CLOSED: { label: "Closed", badge: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
};

const CHANNEL_BADGE = {
    WHATSAPP: "bg-green-500/15 text-green-700", WEB: "bg-blue-500/15 text-blue-700",
    AGENT: "bg-purple-500/15 text-purple-700", PHONE: "bg-orange-500/15 text-orange-700",
};

export default function Conversations() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('contact') || searchParams.get('lead') || "");
    const [filterChannel, setFilterChannel] = useState("all");
    const [selectedConvo, setSelectedConvo] = useState(null);

    const channelFilter = filterChannel !== "all" ? { channel: filterChannel } : {};
    const { data: convos = [], isLoading, error, refetch } = useFrappeList("Conversation", {
        filters: channelFilter,
        fields: ["name", "contact", "channel", "status", "summary", "highlights_json", "transcript_url", "lead", "ticket", "route_booking", "creation", "modified"],
        pageSize: 100,
        orderBy: "modified desc",
    });

    const filtered = (Array.isArray(convos) ? convos : []).filter(c => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (c.contact || '').toLowerCase().includes(term) || (c.summary || '').toLowerCase().includes(term) || (c.name || '').toLowerCase().includes(term);
        }
        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" /><h2 className="text-lg font-semibold mb-2">Failed to load conversations</h2>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><MessageSquare className="w-6 h-6 text-cheese-600" /> Conversations</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} conversations`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Select value={filterChannel} onValueChange={setFilterChannel}>
                        <SelectTrigger className="w-40 h-9"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Channels</SelectItem>
                            {Object.keys(CHANNEL_BADGE).map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="space-y-3">
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-4 flex items-center gap-4"><Skeleton className="w-10 h-10 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-full" /></div></CardContent></Card>
                )) : filtered.map((convo) => (
                    <motion.div key={convo.name} whileHover={{ x: 4 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={() => setSelectedConvo(convo)}>
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
                                    <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-sm text-foreground">{convo.contact || 'Unknown'}</h3>
                                        <Badge className={CHANNEL_BADGE[convo.channel] || CHANNEL_BADGE.WEB}>{convo.channel || '—'}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">{convo.summary || 'No summary'}</p>
                                </div>
                                <Badge className={STATUS_CONFIG[convo.status]?.badge || STATUS_CONFIG.OPEN.badge}>{STATUS_CONFIG[convo.status]?.label || convo.status}</Badge>
                                <span className="text-xs text-muted-foreground hidden sm:block">{convo.modified || convo.creation || '—'}</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {convo.contact && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/contacts?search=${convo.contact}`); }}><User className="w-3 h-3 mr-2" /> Contact</DropdownMenuItem>}
                                        {convo.ticket && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/tickets?search=${convo.ticket}`); }}><Ticket className="w-3 h-3 mr-2" /> Ticket</DropdownMenuItem>}
                                        {convo.route_booking && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/bookings?search=${convo.route_booking}`); }}><ShoppingCart className="w-3 h-3 mr-2" /> Booking</DropdownMenuItem>}
                                        {convo.lead && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/cheese/leads?search=${convo.lead}`); }}>Lead</DropdownMenuItem>}
                                        {convo.transcript_url && (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(convo.transcript_url, '_blank'); }}><ExternalLink className="w-3 h-3 mr-2" /> Transcript</DropdownMenuItem>
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><MessageSquare className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No conversations found</p></div>
            )}

            {/* Detail Dialog */}
            <Dialog open={!!selectedConvo} onOpenChange={(open) => !open && setSelectedConvo(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-cheese-600" /> {selectedConvo?.name}</DialogTitle>
                        <DialogDescription>Conversation with {selectedConvo?.contact || 'Unknown'}</DialogDescription>
                    </DialogHeader>
                    {selectedConvo && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><p className="text-xs text-muted-foreground">Channel</p><Badge className={CHANNEL_BADGE[selectedConvo.channel]}>{selectedConvo.channel}</Badge></div>
                                <div><p className="text-xs text-muted-foreground">Status</p><Badge className={STATUS_CONFIG[selectedConvo.status]?.badge}>{STATUS_CONFIG[selectedConvo.status]?.label}</Badge></div>
                                <div><p className="text-xs text-muted-foreground">Contact</p><p className="text-sm font-medium">{selectedConvo.contact || '—'}</p></div>
                                <div><p className="text-xs text-muted-foreground">Modified</p><p className="text-sm">{selectedConvo.modified || '—'}</p></div>
                            </div>
                            {selectedConvo.summary && <div><p className="text-xs text-muted-foreground mb-1">Summary</p><p className="text-sm">{selectedConvo.summary}</p></div>}
                            <div className="flex flex-wrap gap-2">
                                {selectedConvo.ticket && <Badge variant="outline" className="cursor-pointer" onClick={() => navigate(`/cheese/tickets?search=${selectedConvo.ticket}`)}><Ticket className="w-3 h-3 mr-1" /> {selectedConvo.ticket}</Badge>}
                                {selectedConvo.route_booking && <Badge variant="outline" className="cursor-pointer" onClick={() => navigate(`/cheese/bookings?search=${selectedConvo.route_booking}`)}><ShoppingCart className="w-3 h-3 mr-1" /> {selectedConvo.route_booking}</Badge>}
                                {selectedConvo.lead && <Badge variant="outline" className="cursor-pointer" onClick={() => navigate(`/cheese/leads?search=${selectedConvo.lead}`)}>Lead: {selectedConvo.lead}</Badge>}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
