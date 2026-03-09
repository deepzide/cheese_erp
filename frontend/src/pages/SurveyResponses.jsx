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
import { useFrappeList } from "@/lib/useApiData";

export default function SurveyResponses() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('experience') || "");

    const { data: responses = [], isLoading, error, refetch } = useFrappeList("Cheese Survey Response", {
        fields: ["name", "ticket", "rating", "comment", "sent_at", "answered_at", "creation"],
        pageSize: 100,
        orderBy: "creation desc",
    });

    const filtered = (Array.isArray(responses) ? responses : []).filter(r => {
        if (searchTerm) return (r.ticket || r.name || r.comment || '').toLowerCase().includes(searchTerm.toLowerCase());
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
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search ticket..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
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
                                        <p className="text-xs text-muted-foreground mb-1"><Ticket className="w-3 h-3 inline mr-1" />{resp.ticket || '—'} • {resp.answered_at || resp.creation || '—'}</p>
                                        {resp.comment && <p className="text-sm text-foreground">{resp.comment}</p>}
                                        {!resp.comment && !resp.answered_at && <p className="text-sm text-muted-foreground italic">Survey sent, awaiting response</p>}
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/tickets?search=${resp.ticket}`)}><Ticket className="w-3 h-3 mr-2" /> View Ticket</DropdownMenuItem>
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
        </motion.div>
    );
}
