import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Search, Plus, Filter, User, Ticket, Clock, AlertCircle, RefreshCw, Loader2, MoreHorizontal, CheckCircle, Eye } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supportService } from "@/api/supportService";

const STATUS_CONFIG = {
    OPEN: { label: "Open", badge: "bg-red-500/15 text-red-700 dark:text-red-400" },
    IN_PROGRESS: { label: "In Progress", badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
    RESOLVED: { label: "Resolved", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    CLOSED: { label: "Closed", badge: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
};

const PRIORITY_BADGE = {
    Low: "bg-gray-500/10 text-gray-600", Medium: "bg-blue-500/10 text-blue-700",
    High: "bg-orange-500/10 text-orange-700", Urgent: "bg-red-500/10 text-red-700",
};

export default function Support() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({
        contact_id: searchParams.get('contact') || "",
        ticket_id: searchParams.get('ticket') || "",
        description: "",
    });

    const { data: casesRaw, isLoading, error, refetch } = useQuery({
        queryKey: ['support-cases', filterStatus],
        queryFn: async () => {
            const params = {};
            if (filterStatus !== "all") params.status = filterStatus;
            const result = await supportService.listSupportCases(params);
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || [];
        },
    });

    const cases = Array.isArray(casesRaw) ? casesRaw : [];

    const createMutation = useMutation({
        mutationFn: (data) => supportService.createComplaint(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['support-cases'] });
            setCreateOpen(false);
            setForm({ contact_id: "", ticket_id: "", description: "" });
            toast.success("Support case created");
        },
        onError: (err) => toast.error(err?.message || "Failed to create"),
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, status, notes }) => supportService.updateSupportCaseStatus(id, status, notes),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['support-cases'] }); toast.success("Status updated"); },
    });

    const filtered = cases.filter(c => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (c.name || '').toLowerCase().includes(term) || (c.contact || '').toLowerCase().includes(term);
        }
        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load support cases</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="w-6 h-6 text-cheese-600" /> Support Cases</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} cases`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-40 h-9"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => navigate("/cheese/support/new")}><Plus className="w-4 h-4 mr-1" /> New Case</Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="space-y-3">
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-4 flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-lg" /><div className="flex-1"><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-6 w-20" />
                    </CardContent></Card>
                )) : filtered.map((c) => {
                    const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.OPEN;
                    return (
                        <motion.div key={c.name} whileHover={{ x: 4 }}>
                            <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                                        <Shield className="w-5 h-5 text-red-600 dark:text-red-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-sm text-foreground">{c.name}</h3>
                                            {c.priority && <Badge className={PRIORITY_BADGE[c.priority] || PRIORITY_BADGE.Low}>{c.priority}</Badge>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            <User className="w-3 h-3 inline mr-1" />{c.contact || '—'}
                                            {c.ticket && <> • <Ticket className="w-3 h-3 inline mx-1" />{c.ticket}</>}
                                            {c.assigned_to && <> • Assigned: {c.assigned_to}</>}
                                        </p>
                                    </div>
                                    <Badge className={config.badge}>{config.label}</Badge>
                                    <span className="text-xs text-muted-foreground hidden sm:block">{c.modified || c.creation || '—'}</span>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {c.status === "OPEN" && <DropdownMenuItem onClick={() => statusMutation.mutate({ id: c.name, status: "IN_PROGRESS" })}>Start Progress</DropdownMenuItem>}
                                            {c.status === "IN_PROGRESS" && <DropdownMenuItem onClick={() => statusMutation.mutate({ id: c.name, status: "RESOLVED" })}><CheckCircle className="w-3 h-3 mr-2" /> Resolve</DropdownMenuItem>}
                                            {c.status === "RESOLVED" && <DropdownMenuItem onClick={() => statusMutation.mutate({ id: c.name, status: "CLOSED" })}>Close</DropdownMenuItem>}
                                            <DropdownMenuSeparator />
                                            {c.contact && <DropdownMenuItem onClick={() => navigate(`/cheese/contacts?search=${c.contact}`)}>View Contact</DropdownMenuItem>}
                                            {c.ticket && <DropdownMenuItem onClick={() => navigate(`/cheese/tickets?search=${c.ticket}`)}>View Ticket</DropdownMenuItem>}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><Shield className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No support cases found</p></div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> New Support Case</DialogTitle><DialogDescription>Create a complaint or support request</DialogDescription></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2"><Label>Contact ID *</Label><Input placeholder="e.g. CT-001" value={form.contact_id} onChange={(e) => setForm(f => ({ ...f, contact_id: e.target.value }))} /></div>
                        <div className="space-y-2"><Label>Related Ticket</Label><Input placeholder="e.g. TK-001 (optional)" value={form.ticket_id} onChange={(e) => setForm(f => ({ ...f, ticket_id: e.target.value }))} /></div>
                        <div className="space-y-2"><Label>Description *</Label><Textarea placeholder="Describe the issue..." rows={4} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
