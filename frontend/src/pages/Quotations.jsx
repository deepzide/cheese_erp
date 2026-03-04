import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Search, Plus, DollarSign, Eye, MoreHorizontal, Trash2, Send } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const QT_STATUS = {
    Draft: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
    Sent: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    Accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    Rejected: "bg-red-500/15 text-red-700 dark:text-red-400"
};

const ROUTES = ["Golden Route", "Classic Tour", "Premium Experience", "Family Fun", "VIP Cave Tour"];

const initialQuotations = [
    { id: "QT-001", contact: "George Chen", route: "Golden Route", total: 1500, party_size: 6, status: "Draft", date: "Today" },
    { id: "QT-002", contact: "Hannah Kim", route: "Premium Experience", total: 4500, party_size: 10, status: "Sent", date: "Yesterday" },
    { id: "QT-003", contact: "Ivan Smirnov", route: "VIP Cave Tour", total: 960, party_size: 8, status: "Accepted", date: "3 days ago" },
    { id: "QT-004", contact: "Julia Costa", route: "Family Fun", total: 640, party_size: 8, status: "Draft", date: "Today" },
    { id: "QT-005", contact: "Karl Muller", route: "Classic Tour", total: 360, party_size: 3, status: "Rejected", date: "1 week ago" },
];

const emptyForm = { contact: "", route: "", party_size: "1", total: "" };

export default function Quotations() {
    const [quotations, setQuotations] = useState(initialQuotations);
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);

    const filtered = quotations.filter(q => q.contact.toLowerCase().includes(searchTerm.toLowerCase()) || q.id.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleCreate = () => {
        if (!form.contact || !form.route || !form.total) {
            toast.error("Contact, route, and total are required");
            return;
        }
        const newQt = {
            id: `QT-${String(quotations.length + 1).padStart(3, '0')}`,
            contact: form.contact,
            route: form.route,
            total: parseInt(form.total),
            party_size: parseInt(form.party_size) || 1,
            status: "Draft",
            date: "Just now",
        };
        setQuotations(prev => [newQt, ...prev]);
        setForm(emptyForm);
        setCreateOpen(false);
        toast.success(`Quotation ${newQt.id} created as Draft`);
    };

    const updateStatus = (id, newStatus) => {
        setQuotations(prev => prev.map(q => q.id === id ? { ...q, status: newStatus } : q));
        toast.success(`Quotation ${id} → ${newStatus}`);
    };

    const deleteQuotation = (id) => {
        setQuotations(prev => prev.filter(q => q.id !== id));
        toast.success(`Quotation ${id} deleted`);
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="w-6 h-6 text-cheese-600" /> Quotations</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} quotations</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> New Quote</Button>
                </div>
            </div>
            <div className="space-y-3">
                {filtered.map((qt) => (
                    <motion.div key={qt.id} whileHover={{ x: 4 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center"><FileText className="w-5 h-5 text-cheese-700 dark:text-cheese-400" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2"><h3 className="font-semibold text-sm text-foreground">{qt.contact}</h3><span className="text-xs font-mono text-muted-foreground">{qt.id}</span></div>
                                    <p className="text-xs text-muted-foreground">{qt.route} • {qt.party_size} guests</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg text-foreground flex items-center"><DollarSign className="w-4 h-4" />{qt.total.toLocaleString()}</p>
                                    <Badge className={QT_STATUS[qt.status]}>{qt.status}</Badge>
                                </div>
                                <span className="text-xs text-muted-foreground hidden sm:block">{qt.date}</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem><Eye className="w-3 h-3 mr-2" /> View</DropdownMenuItem>
                                        {qt.status === "Draft" && <DropdownMenuItem onClick={() => updateStatus(qt.id, "Sent")}><Send className="w-3 h-3 mr-2" /> Send</DropdownMenuItem>}
                                        {qt.status === "Sent" && <DropdownMenuItem onClick={() => updateStatus(qt.id, "Accepted")}>Mark Accepted</DropdownMenuItem>}
                                        {qt.status === "Sent" && <DropdownMenuItem onClick={() => updateStatus(qt.id, "Rejected")}>Mark Rejected</DropdownMenuItem>}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-red-600" onClick={() => deleteQuotation(qt.id)}><Trash2 className="w-3 h-3 mr-2" /> Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Create Quotation Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> New Quotation</DialogTitle>
                        <DialogDescription>Create a price quote for a client</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Contact Name *</Label>
                            <Input placeholder="Client name" value={form.contact} onChange={(e) => setForm(f => ({ ...f, contact: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Route *</Label>
                            <Select value={form.route} onValueChange={(v) => setForm(f => ({ ...f, route: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select route" /></SelectTrigger>
                                <SelectContent>
                                    {ROUTES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Party Size</Label>
                                <Input type="number" min="1" value={form.party_size} onChange={(e) => setForm(f => ({ ...f, party_size: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Total ($) *</Label>
                                <Input type="number" min="0" placeholder="1500" value={form.total} onChange={(e) => setForm(f => ({ ...f, total: e.target.value }))} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate}>
                            <Plus className="w-4 h-4 mr-1" /> Create Quote
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
