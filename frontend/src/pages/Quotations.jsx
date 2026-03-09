import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search, Plus, DollarSign, Eye, MoreHorizontal, Trash2, Send, AlertCircle, RefreshCw, Loader2, Route } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useFrappeList, useFrappeCreate, useFrappeUpdate, useFrappeDelete } from "@/lib/useApiData";

const QT_STATUS = {
    Draft: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
    Sent: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    Accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    Rejected: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export default function Quotations() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ lead: "", route: "", total_price: "" });

    const { data: quotations = [], isLoading, error, refetch } = useFrappeList("Cheese Quotation", {
        fields: ["name", "lead", "route", "total_price", "deposit_amount", "status", "valid_until"],
        pageSize: 100,
    });

    // Fetch routes for create form
    const { data: routes = [] } = useFrappeList("Cheese Route", {
        fields: ["name", "route_info"],
        pageSize: 100,
    });

    // Fetch leads for create form
    const { data: leads = [] } = useFrappeList("Cheese Lead", {
        fields: ["name", "contact"],
        pageSize: 100,
    });

    const createMutation = useFrappeCreate("Cheese Quotation");
    const updateMutation = useFrappeUpdate("Cheese Quotation");
    const deleteMutation = useFrappeDelete("Cheese Quotation");

    const qtList = Array.isArray(quotations) ? quotations : [];
    const filtered = qtList.filter(q => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (q.lead || '').toLowerCase().includes(term) || (q.name || '').toLowerCase().includes(term);
        }
        return true;
    });

    const handleCreate = () => {
        if (!form.lead || !form.route || !form.total_price) { toast.error("Lead, route, and total are required"); return; }
        createMutation.mutate({ ...form, status: "Draft", total_price: parseFloat(form.total_price) }, {
            onSuccess: () => { setForm({ lead: "", route: "", total_price: "" }); setCreateOpen(false); toast.success("Quotation created"); },
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    const updateStatus = (name, newStatus) => {
        updateMutation.mutate({ name, data: { status: newStatus } }, {
            onSuccess: () => toast.success(`Quotation → ${newStatus}`),
        });
    };

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load quotations</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="w-6 h-6 text-cheese-600" /> Quotations</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} quotations`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => navigate("/cheese/quotations/new")}><Plus className="w-4 h-4 mr-1" /> New Quote</Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="space-y-3">
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-4 flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-lg" /><div className="flex-1"><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-6 w-20" />
                    </CardContent></Card>
                )) : filtered.map((qt) => (
                    <motion.div key={qt.name} whileHover={{ x: 4 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center"><FileText className="w-5 h-5 text-cheese-700 dark:text-cheese-400" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2"><h3 className="font-semibold text-sm text-foreground">{qt.lead || '—'}</h3><span className="text-xs font-mono text-muted-foreground">{qt.name}</span></div>
                                    <p className="text-xs text-muted-foreground">{qt.route || '—'}{qt.valid_until ? ` • Valid until: ${qt.valid_until}` : ''}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg text-foreground flex items-center"><DollarSign className="w-4 h-4" />{Number(qt.total_price || 0).toLocaleString()}</p>
                                    <Badge className={QT_STATUS[qt.status] || QT_STATUS.Draft}>{qt.status || 'Draft'}</Badge>
                                </div>
                                <span className="text-xs text-muted-foreground hidden sm:block">{qt.deposit_amount ? `Deposit: $${Number(qt.deposit_amount).toLocaleString()}` : ''}</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {qt.status === "Draft" && <DropdownMenuItem onClick={() => updateStatus(qt.name, "Sent")}><Send className="w-3 h-3 mr-2" /> Send</DropdownMenuItem>}
                                        {qt.status === "Sent" && <DropdownMenuItem onClick={() => updateStatus(qt.name, "Accepted")}>Mark Accepted</DropdownMenuItem>}
                                        {qt.status === "Sent" && <DropdownMenuItem onClick={() => updateStatus(qt.name, "Rejected")}>Mark Rejected</DropdownMenuItem>}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => navigate(`/cheese/leads?search=${qt.lead}`)}>View Lead</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => navigate(`/cheese/routes?search=${qt.route}`)}><Route className="w-3 h-3 mr-2" /> View Route</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-red-600" onClick={() => deleteMutation.mutate(qt.name, { onSuccess: () => toast.success("Deleted") })}><Trash2 className="w-3 h-3 mr-2" /> Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><FileText className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No quotations found</p></div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> New Quotation</DialogTitle><DialogDescription>Create a price quote</DialogDescription></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2"><Label>Lead *</Label><Input placeholder="Lead ID" value={form.lead} onChange={(e) => setForm(f => ({ ...f, lead: e.target.value }))} /></div>
                        <div className="space-y-2"><Label>Route *</Label><Input placeholder="Route ID" value={form.route} onChange={(e) => setForm(f => ({ ...f, route: e.target.value }))} /></div>
                        <div className="space-y-2"><Label>Total ($) *</Label><Input type="number" min="0" placeholder="1500" value={form.total_price} onChange={(e) => setForm(f => ({ ...f, total_price: e.target.value }))} /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Create Quote
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
