import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Search, Plus, ArrowRight, Trash2, AlertCircle, RefreshCw, Loader2, Eye, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useFrappeList, useFrappeCreate, useFrappeUpdate, useFrappeDelete } from "@/lib/useApiData";

const LEAD_STATUSES = {
    New: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    Contacted: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    Qualified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    Lost: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const SOURCES = ["Website", "Referral", "Phone", "Email", "Walk-in", "Social", "Advertisement", "WhatsApp"];

export default function Leads() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ lead_name: "", source: "", interest: "", status: "New" });

    const { data: leads = [], isLoading, error, refetch } = useFrappeList("Cheese Lead", {
        fields: ["name", "contact", "conversation", "status", "interest_type", "lost_reason", "last_interaction_at"],
        pageSize: 100,
    });

    const createMutation = useFrappeCreate("Cheese Lead");
    const updateMutation = useFrappeUpdate("Cheese Lead");
    const deleteMutation = useFrappeDelete("Cheese Lead");

    const leadsList = Array.isArray(leads) ? leads : [];
    const filtered = leadsList.filter(l => {
        if (searchTerm) return (l.contact || l.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        return true;
    });

    const handleCreate = () => {
        if (!form.contact || !form.interest_type) { toast.error("Contact and interest type are required"); return; }
        createMutation.mutate({ contact: form.contact, interest_type: form.interest_type, status: "New" }, {
            onSuccess: () => { setForm({ contact: "", interest_type: "", status: "New" }); setCreateOpen(false); toast.success("Lead created"); },
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    const updateStatus = (name, newStatus) => {
        updateMutation.mutate({ name, data: { status: newStatus } }, {
            onSuccess: () => toast.success(`Lead → ${newStatus}`),
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    const handleDelete = (name) => {
        deleteMutation.mutate(name, {
            onSuccess: () => toast.success("Lead deleted"),
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load leads</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><UserPlus className="w-6 h-6 text-cheese-600" /> Leads</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} leads`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => navigate("/cheese/leads/new")}><Plus className="w-4 h-4 mr-1" /> Add Lead</Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-5 space-y-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-32" /><Skeleton className="h-6 w-20" /></CardContent></Card>
                )) : filtered.map((lead) => (
                    <motion.div key={lead.name} whileHover={{ y: -3 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={(e) => {
                            if (!e.target.closest('[role="menuitem"]') && !e.target.closest('button')) {
                                navigate(`/cheese/leads/${lead.name}`);
                            }
                        }}>
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center font-bold text-blue-700 dark:text-blue-400">{(lead.contact || '?').charAt(0)}</div>
                                        <div><h3 className="font-semibold text-foreground">{lead.contact || lead.name}</h3><span className="text-xs text-muted-foreground">{lead.name}</span></div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><ArrowRight className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/leads/${lead.name}`)}><Eye className="w-3 h-3 mr-2" /> View Details</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            {Object.keys(LEAD_STATUSES).filter(s => s !== lead.status).map(s => (
                                                <DropdownMenuItem key={s} onClick={() => updateStatus(lead.name, s)}>Move to {s}</DropdownMenuItem>
                                            ))}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/quotations/new?lead=${lead.name}`)}><FileText className="w-3 h-3 mr-2" /> Create Quotation</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/conversations?lead=${lead.name}`)}>Conversations</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(lead.name)}><Trash2 className="w-3 h-3 mr-2" /> Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <Badge className={LEAD_STATUSES[lead.status] || LEAD_STATUSES.New}>{lead.status || 'New'}</Badge>
                                {lead.interest_type && <p className="text-sm text-muted-foreground mt-2">Interest: <span className="font-medium text-foreground">{lead.interest_type}</span></p>}
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                                    <span>{lead.lost_reason ? `Lost: ${lead.lost_reason}` : ''}</span><span>{lead.last_interaction_at || '—'}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><UserPlus className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No leads found</p></div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> Add Lead</DialogTitle><DialogDescription>Register a new lead</DialogDescription></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2"><Label>Contact *</Label><Input placeholder="Contact ID" value={form.contact} onChange={(e) => setForm(f => ({ ...f, contact: e.target.value }))} /></div>
                        <div className="space-y-2"><Label>Interest Type *</Label>
                            <Select value={form.interest_type} onValueChange={(v) => setForm(f => ({ ...f, interest_type: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select interest" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Route">Route</SelectItem>
                                    <SelectItem value="Experience">Experience</SelectItem>
                                    <SelectItem value="General">General</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Add Lead
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
