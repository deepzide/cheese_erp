import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Search, AlertCircle, RefreshCw, Ticket, MoreHorizontal, MessageSquare } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFrappeList } from "@/lib/useApiData";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";

export default function SurveyResponses() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const ticketParam = searchParams.get('ticket') || "";
    const [searchTerm, setSearchTerm] = useState(searchParams.get('experience') || "");
    const [routeId, setRouteId] = useState("");
    const [companyId, setCompanyId] = useState("");
    const [ratingFilter, setRatingFilter] = useState("all");
    const [selected, setSelected] = useState(null);

    const serverFilters = {};
    if (ticketParam) serverFilters.ticket = ticketParam;

    const { data: responses = [], isLoading, error, refetch } = useFrappeList("Cheese Survey Response", {
        filters: serverFilters,
        fields: ["name", "ticket", "contact", "route", "company", "rating", "comment", "sent_at", "answered_at", "creation"],
        pageSize: 100,
        orderBy: "creation desc",
    });

    const filtered = (Array.isArray(responses) ? responses : []).filter(r => {
        if (searchTerm && !(r.ticket || r.name || r.comment || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (routeId && r.route !== routeId) return false;
        if (companyId && r.company !== companyId) return false;
        if (ratingFilter !== "all" && String(r.rating || "") !== ratingFilter) return false;
        return true;
    });

    const avgRating = filtered.length > 0 ? (filtered.reduce((sum, r) => sum + (r.rating || 0), 0) / filtered.filter(r => r.rating).length).toFixed(1) : '—';

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" /><h2 className="text-lg font-semibold mb-2">Failed to load surveys</h2>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Star className="w-6 h-6 text-cheese-600" /> Survey Responses</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} responses • Avg: ${avgRating}/5`}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search ticket..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <div className="w-44"><FrappeSearchSelect doctype="Cheese Route" label="name" value={routeId} onChange={setRouteId} placeholder="Route..." /></div>
                    <div className="w-44"><FrappeSearchSelect doctype="Company" label="name" value={companyId} onChange={setCompanyId} placeholder="Establishment..." /></div>
                    <Input placeholder="Rating 1-5" value={ratingFilter === "all" ? "" : ratingFilter} onChange={(e) => setRatingFilter(e.target.value ? e.target.value : "all")} className="w-24 h-9" />
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            {/* Rating distribution */}
            {!isLoading && filtered.length > 0 && (
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-6">
                            <div className="text-center">
                                <p className="text-4xl font-bold text-cheese-600">{avgRating}</p>
                                <div className="flex items-center gap-0.5 mt-1">
                                    {[1, 2, 3, 4, 5].map(i => <Star key={i} className={`w-4 h-4 ${i <= Math.round(avgRating) ? 'text-cheese-500 fill-cheese-500' : 'text-muted-foreground/30'}`} />)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{filtered.filter(r => r.rating).length} ratings</p>
                            </div>
                            <div className="flex-1 space-y-1">
                                {[5, 4, 3, 2, 1].map(n => {
                                    const count = filtered.filter(r => r.rating === n).length;
                                    const pct = filtered.filter(r => r.rating).length > 0 ? (count / filtered.filter(r => r.rating).length) * 100 : 0;
                                    return (
                                        <div key={n} className="flex items-center gap-2">
                                            <span className="text-xs w-3 text-muted-foreground">{n}</span>
                                            <div className="flex-1 bg-muted rounded-full h-2"><div className="h-2 rounded-full bg-cheese-500" style={{ width: `${pct}%` }} /></div>
                                            <span className="text-xs w-6 text-right text-muted-foreground">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-3">
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-4 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-full" /></CardContent></Card>
                )) : filtered.map((resp) => (
                    <motion.div key={resp.name} whileHover={{ x: 4 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-4">
                                <div className="flex items-start gap-4">
                                    <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                                        {[1, 2, 3, 4, 5].map(i => <Star key={i} className={`w-3.5 h-3.5 ${i <= (resp.rating || 0) ? 'text-cheese-500 fill-cheese-500' : 'text-muted-foreground/20'}`} />)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-muted-foreground mb-1"><Ticket className="w-3 h-3 inline mr-1" />{resp.ticket || '—'} • {resp.contact ? `Customer: ${resp.contact}` : ''} • {resp.answered_at || resp.creation || '—'}</p>
                                        {resp.comment && <p className="text-sm text-foreground">{resp.comment}</p>}
                                        {!resp.comment && !resp.answered_at && <p className="text-sm text-muted-foreground italic">Survey sent, awaiting response</p>}
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setSelected(resp)}><MessageSquare className="w-3 h-3 mr-2" /> View Details</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/tickets/${resp.ticket}`)}><Ticket className="w-3 h-3 mr-2" /> View Ticket</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><Star className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No survey responses</p></div>
            )}
            <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Survey Details</DialogTitle></DialogHeader>
                    {selected && (
                        <div className="space-y-2 text-sm">
                            <p><span className="text-muted-foreground">Customer:</span> {selected.contact || "—"}</p>
                            <p><span className="text-muted-foreground">Ticket:</span> {selected.ticket || "—"}</p>
                            <p><span className="text-muted-foreground">Route:</span> {selected.route || "—"}</p>
                            <p><span className="text-muted-foreground">Establishment:</span> {selected.company || "—"}</p>
                            <p><span className="text-muted-foreground">Rating:</span> {selected.rating || "—"}</p>
                            <p><span className="text-muted-foreground">Comment:</span> {selected.comment || "No comment"}</p>
                            <div className="pt-2 flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => navigate(`/cheese/tickets/${selected.ticket}`)}>View Ticket</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
