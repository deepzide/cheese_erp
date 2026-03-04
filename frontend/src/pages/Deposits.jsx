import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Search, DollarSign, CheckCircle, Clock, AlertCircle, Plus, MoreHorizontal, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const DEP_STATUS = {
    Pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    Paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    Overdue: "bg-red-500/15 text-red-700 dark:text-red-400",
    Refunded: "bg-blue-500/15 text-blue-700 dark:text-blue-400"
};

const ROUTES = ["Golden Route", "Classic Tour", "Premium Experience", "Family Fun", "VIP Cave Tour"];
const METHODS = ["Card", "Bank Transfer", "Cash", "PayPal"];

const initialDeposits = [
    { id: "DEP-001", contact: "Alice Johnson", booking: "BK-001", amount: 50, status: "Pending", due: "In 24 hours", route: "Golden Route", method: "Card" },
    { id: "DEP-002", contact: "Bob Smith", booking: "BK-002", amount: 75, status: "Paid", due: "Completed", route: "Premium Experience", method: "Bank Transfer" },
    { id: "DEP-003", contact: "Carlos Rivera", booking: "BK-003", amount: 45, status: "Overdue", due: "2 hours ago", route: "Golden Route", method: "Card" },
    { id: "DEP-004", contact: "Diana Lee", booking: "BK-004", amount: 120, status: "Paid", due: "Completed", route: "VIP Cave Tour", method: "Cash" },
    { id: "DEP-005", contact: "Evgeny Petrov", booking: "BK-005", amount: 35, status: "Refunded", due: "Refunded", route: "Classic Tour", method: "PayPal" },
    { id: "DEP-006", contact: "Fatima Al-Rashid", booking: "BK-006", amount: 60, status: "Pending", due: "In 48 hours", route: "Premium Experience", method: "Card" },
];

const emptyForm = { contact: "", route: "", amount: "", method: "" };

export default function Deposits() {
    const [deposits, setDeposits] = useState(initialDeposits);
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);

    const filtered = deposits.filter(d => d.contact.toLowerCase().includes(searchTerm.toLowerCase()) || d.id.toLowerCase().includes(searchTerm.toLowerCase()));

    const StatusIcon = ({ status }) => {
        if (status === 'Paid') return <CheckCircle className="w-4 h-4 text-emerald-500" />;
        if (status === 'Overdue') return <AlertCircle className="w-4 h-4 text-red-500" />;
        return <Clock className="w-4 h-4 text-yellow-500" />;
    };

    const handleCreate = () => {
        if (!form.contact || !form.amount || !form.route) {
            toast.error("Contact, amount, and route are required");
            return;
        }
        const newDep = {
            id: `DEP-${String(deposits.length + 1).padStart(3, '0')}`,
            contact: form.contact,
            booking: "-",
            amount: parseInt(form.amount),
            status: "Pending",
            due: "In 48 hours",
            route: form.route,
            method: form.method || "Card",
        };
        setDeposits(prev => [newDep, ...prev]);
        setForm(emptyForm);
        setCreateOpen(false);
        toast.success(`Deposit ${newDep.id} created`);
    };

    const updateStatus = (id, newStatus) => {
        setDeposits(prev => prev.map(d => d.id === id ? { ...d, status: newStatus, due: newStatus === "Paid" ? "Completed" : d.due } : d));
        toast.success(`Deposit ${id} → ${newStatus}`);
    };

    const deleteDeposit = (id) => {
        setDeposits(prev => prev.filter(d => d.id !== id));
        toast.success(`Deposit ${id} removed`);
    };

    const pendingTotal = deposits.filter(d => d.status === 'Pending').reduce((a, b) => a + b.amount, 0);
    const collectedTotal = deposits.filter(d => d.status === 'Paid').reduce((a, b) => a + b.amount, 0);
    const overdueTotal = deposits.filter(d => d.status === 'Overdue').reduce((a, b) => a + b.amount, 0);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Wallet className="w-6 h-6 text-cheese-600" /> Deposits</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} deposits tracked</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> New</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { label: "Pending", value: `$${pendingTotal}`, color: "from-yellow-500 to-amber-500", count: deposits.filter(d => d.status === 'Pending').length },
                    { label: "Collected", value: `$${collectedTotal}`, color: "from-emerald-500 to-green-600", count: deposits.filter(d => d.status === 'Paid').length },
                    { label: "Overdue", value: `$${overdueTotal}`, color: "from-red-500 to-rose-600", count: deposits.filter(d => d.status === 'Overdue').length },
                ].map((stat) => (
                    <Card key={stat.label} className="border-0 shadow-lg overflow-hidden">
                        <div className={`bg-gradient-to-br ${stat.color} p-4 text-white`}>
                            <p className="text-sm opacity-80">{stat.label}</p>
                            <p className="text-2xl font-bold mt-1">{stat.value}</p>
                            <p className="text-xs opacity-70 mt-1">{stat.count} deposits</p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="space-y-3">
                {filtered.map((dep) => (
                    <motion.div key={dep.id} whileHover={{ x: 4 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-4 flex items-center gap-4">
                                <StatusIcon status={dep.status} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2"><h3 className="font-semibold text-sm text-foreground">{dep.contact}</h3><span className="text-xs font-mono text-muted-foreground">{dep.id}</span></div>
                                    <p className="text-xs text-muted-foreground">{dep.route} • {dep.booking}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg flex items-center text-foreground"><DollarSign className="w-4 h-4" />{dep.amount}</p>
                                    <Badge className={DEP_STATUS[dep.status]}>{dep.status}</Badge>
                                </div>
                                <span className="text-xs text-muted-foreground hidden sm:block min-w-[80px] text-right">{dep.due}</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {dep.status === 'Pending' && <DropdownMenuItem onClick={() => updateStatus(dep.id, "Paid")}><CheckCircle className="w-3 h-3 mr-2" /> Mark Paid</DropdownMenuItem>}
                                        {(dep.status === 'Paid' || dep.status === 'Pending') && <DropdownMenuItem onClick={() => updateStatus(dep.id, "Refunded")}>Refund</DropdownMenuItem>}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-red-600" onClick={() => deleteDeposit(dep.id)}><Trash2 className="w-3 h-3 mr-2" /> Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Create Deposit Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> New Deposit</DialogTitle>
                        <DialogDescription>Record a new deposit</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Contact *</Label>
                            <Input placeholder="Contact name" value={form.contact} onChange={(e) => setForm(f => ({ ...f, contact: e.target.value }))} />
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
                                <Label>Amount ($) *</Label>
                                <Input type="number" min="0" placeholder="50" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Method</Label>
                                <Select value={form.method} onValueChange={(v) => setForm(f => ({ ...f, method: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        {METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate}>
                            <Plus className="w-4 h-4 mr-1" /> Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
