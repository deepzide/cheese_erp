import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Search, Filter, Clock, AlertCircle, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { useFrappeList } from "@/lib/useApiData";

const EVENT_COLORS = {
    CREATE: "bg-emerald-500/15 text-emerald-700", UPDATE: "bg-blue-500/15 text-blue-700",
    DELETE: "bg-red-500/15 text-red-700", STATUS_CHANGE: "bg-yellow-500/15 text-yellow-700",
    LOGIN: "bg-purple-500/15 text-purple-700", ERROR: "bg-red-500/15 text-red-600",
};

export default function SystemEvents() {
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState("all");
    const [expandedEvent, setExpandedEvent] = useState(null);

    const typeFilter = filterType !== "all" ? { event_type: filterType } : {};
    const { data: events = [], isLoading, error, refetch } = useFrappeList("Cheese System Event", {
        filters: typeFilter,
        fields: ["name", "entity_type", "entity_id", "event_type", "payload_json", "triggered_by", "created_at", "creation"],
        pageSize: 200,
        orderBy: "creation desc",
    });

    const filtered = (Array.isArray(events) ? events : []).filter(e => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (e.entity_type || '').toLowerCase().includes(term) || (e.entity_id || '').toLowerCase().includes(term) || (e.triggered_by || '').toLowerCase().includes(term);
        }
        return true;
    });

    const eventTypes = [...new Set(events.map(e => e.event_type).filter(Boolean))];

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" /><h2 className="text-lg font-semibold mb-2">Failed to load events</h2>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Activity className="w-6 h-6 text-cheese-600" /> System Events</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} events`} — Audit Log</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-44 h-9"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            {eventTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            {/* Timeline */}
            <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-1">
                    {isLoading ? Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex items-start gap-4 pl-10"><Skeleton className="h-10 w-full" /></div>
                    )) : filtered.map((event) => {
                        const isExpanded = expandedEvent === event.name;
                        return (
                            <motion.div key={event.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <div className="flex items-start gap-3 relative cursor-pointer hover:bg-muted/30 rounded-lg p-2 transition-colors" onClick={() => setExpandedEvent(isExpanded ? null : event.name)}>
                                    <div className="w-2.5 h-2.5 rounded-full bg-cheese-500 mt-1.5 shrink-0 z-10 ring-2 ring-background" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge className={EVENT_COLORS[event.event_type] || EVENT_COLORS.UPDATE}>{event.event_type || '—'}</Badge>
                                            <span className="text-sm font-medium text-foreground">{event.entity_type}: {event.entity_id || '—'}</span>
                                            <span className="text-xs text-muted-foreground ml-auto"><Clock className="w-3 h-3 inline mr-1" />{event.created_at || event.creation || '—'}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">By: {event.triggered_by || 'System'}</p>
                                        {isExpanded && event.payload_json && (
                                            <motion.pre initial={{ height: 0 }} animate={{ height: 'auto' }} className="mt-2 p-3 bg-muted rounded-lg text-xs font-mono overflow-x-auto max-h-48">
                                                {typeof event.payload_json === 'string' ? event.payload_json : JSON.stringify(event.payload_json, null, 2)}
                                            </motion.pre>
                                        )}
                                    </div>
                                    {event.payload_json && (isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />)}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><Activity className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No events found</p></div>
            )}
        </motion.div>
    );
}
