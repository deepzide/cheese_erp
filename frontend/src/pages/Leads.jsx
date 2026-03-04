import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Search, Plus, ArrowRight, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const LEAD_STATUSES = {
    New: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    Contacted: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    Qualified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    Lost: "bg-red-500/15 text-red-700 dark:text-red-400"
};

const SOURCES = ["Website", "Referral", "Phone", "Email", "Walk-in", "Social", "Advertisement"];

const initialLeads = [
    { id: "LD-001", name: "George Chen", source: "Website", status: "New", interest: "Group Wine Tasting", created: "Today" },
    { id: "LD-002", name: "Hannah Kim", source: "Referral", status: "Contacted", interest: "Corporate Event", created: "Yesterday" },
    { id: "LD-003", name: "Ivan Smirnov", source: "Phone", status: "Qualified", interest: "VIP Private Tour", created: "3 days ago" },
    { id: "LD-004", name: "Julia Costa", source: "Email", status: "New", interest: "Family Package", created: "Today" },
    { id: "LD-005", name: "Karl Muller", source: "Walk-in", status: "Lost", interest: "Weekend Special", created: "1 week ago" },
    { id: "LD-006", name: "Leila Mahmoud", source: "Social", status: "Contacted", interest: "Cheese Making Class", created: "2 days ago" },
];

const emptyForm = { name: "", source: "", interest: "", status: "New" };

export default function Leads() {
    const [leads, setLeads] = useState(initialLeads);
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);

    const filtered = leads.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleCreate = () => {
        if (!form.name || !form.source) {
            toast.error("Name and source are required");
            return;
        }
        const newLead = {
            id: `LD-${String(leads.length + 1).padStart(3, '0')}`,
            name: form.name,
            source: form.source,
            interest: form.interest,
            status: form.status,
            created: "Just now",
        };
        setLeads(prev => [newLead, ...prev]);
        setForm(emptyForm);
        setCreateOpen(false);
        toast.success(`Lead "${newLead.name}" added`);
    };

    const deleteLead = (id) => {
        setLeads(prev => prev.filter(l => l.id !== id));
        toast.success(`Lead ${id} removed`);
    };

    const updateLeadStatus = (id, newStatus) => {
        setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
        toast.success(`Lead ${id} → ${newStatus}`);
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><UserPlus className="w-6 h-6 text-cheese-600" /> Leads</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} leads</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Lead</Button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((lead) => (
                    <motion.div key={lead.id} whileHover={{ y: -3 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center font-bold text-blue-700 dark:text-blue-400">{lead.name.charAt(0)}</div>
                                        <div><h3 className="font-semibold text-foreground">{lead.name}</h3><span className="text-xs text-muted-foreground">{lead.id}</span></div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><ArrowRight className="w-4 h-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {Object.keys(LEAD_STATUSES).filter(s => s !== lead.status).map(s => (
                                                <DropdownMenuItem key={s} onClick={() => updateLeadStatus(lead.id, s)}>Move to {s}</DropdownMenuItem>
                                            ))}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-red-600" onClick={() => deleteLead(lead.id)}><Trash2 className="w-3 h-3 mr-2" /> Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="flex items-center justify-between mb-2">
                                    <Badge className={LEAD_STATUSES[lead.status]}>{lead.status}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mb-1">Interest: <span className="font-medium text-foreground">{lead.interest}</span></p>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                                    <span>Source: {lead.source}</span><span>{lead.created}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Create Lead Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> Add Lead</DialogTitle>
                        <DialogDescription>Register a new lead</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Name *</Label>
                            <Input placeholder="Lead name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Source *</Label>
                            <Select value={form.source} onValueChange={(v) => setForm(f => ({ ...f, source: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                                <SelectContent>
                                    {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Interest</Label>
                            <Input placeholder="What are they interested in?" value={form.interest} onChange={(e) => setForm(f => ({ ...f, interest: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {Object.keys(LEAD_STATUSES).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate}>
                            <Plus className="w-4 h-4 mr-1" /> Add Lead
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
