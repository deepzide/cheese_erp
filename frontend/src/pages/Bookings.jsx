import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Search, Plus, DollarSign, Eye, Users, Clock, MoreHorizontal, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const BK_STATUS = {
    Pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    Confirmed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    "In Progress": "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    Completed: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
    Cancelled: "bg-red-500/15 text-red-700 dark:text-red-400"
};

const ROUTES = ["Golden Route", "Classic Tour", "Premium Experience", "Family Fun", "VIP Cave Tour"];

const initialBookings = [
    { id: "BK-001", contact: "Alice Johnson", route: "Golden Route", total: 750, party_size: 3, status: "Confirmed", date: "Mar 5, 2026", experiences: 4 },
    { id: "BK-002", contact: "Bob Smith", route: "Premium Experience", total: 1350, party_size: 3, status: "Pending", date: "Mar 6, 2026", experiences: 3 },
    { id: "BK-003", contact: "Carlos Rivera", route: "Golden Route", total: 1250, party_size: 5, status: "In Progress", date: "Today", experiences: 4 },
    { id: "BK-004", contact: "Diana Lee", route: "VIP Cave Tour", total: 960, party_size: 8, status: "Completed", date: "Mar 2, 2026", experiences: 3 },
    { id: "BK-005", contact: "Evgeny Petrov", route: "Classic Tour", total: 360, party_size: 3, status: "Cancelled", date: "Mar 1, 2026", experiences: 2 },
    { id: "BK-006", contact: "Fatima Al-Rashid", route: "Premium Experience", total: 900, party_size: 2, status: "Confirmed", date: "Mar 7, 2026", experiences: 3 },
];

const emptyForm = { contact: "", route: "", party_size: "1", date: "" };

export default function Bookings() {
    const [bookings, setBookings] = useState(initialBookings);
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);

    const filtered = bookings.filter(b => b.contact.toLowerCase().includes(searchTerm.toLowerCase()) || b.id.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleCreate = () => {
        if (!form.contact || !form.route || !form.date) {
            toast.error("Contact, route, and date are required");
            return;
        }
        const newBooking = {
            id: `BK-${String(bookings.length + 1).padStart(3, '0')}`,
            contact: form.contact,
            route: form.route,
            total: 0,
            party_size: parseInt(form.party_size) || 1,
            status: "Pending",
            date: form.date,
            experiences: 0,
        };
        setBookings(prev => [newBooking, ...prev]);
        setForm(emptyForm);
        setCreateOpen(false);
        toast.success(`Booking ${newBooking.id} created`);
    };

    const updateStatus = (id, newStatus) => {
        setBookings(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
        toast.success(`Booking ${id} → ${newStatus}`);
    };

    const deleteBooking = (id) => {
        setBookings(prev => prev.filter(b => b.id !== id));
        toast.success(`Booking ${id} deleted`);
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><ShoppingCart className="w-6 h-6 text-cheese-600" /> Bookings</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} bookings</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> New Booking</Button>
                </div>
            </div>
            <div className="space-y-3">
                {filtered.map((bk) => (
                    <motion.div key={bk.id} whileHover={{ x: 4 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-cheese-700 dark:text-cheese-400" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2"><h3 className="font-semibold text-sm text-foreground">{bk.contact}</h3><span className="text-xs font-mono text-muted-foreground">{bk.id}</span></div>
                                    <p className="text-xs text-muted-foreground">{bk.route} • {bk.experiences} experiences</p>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground hidden md:flex">
                                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {bk.party_size}</span>
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {bk.date}</span>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg flex items-center text-foreground"><DollarSign className="w-4 h-4" />{bk.total.toLocaleString()}</p>
                                    <Badge className={BK_STATUS[bk.status]}>{bk.status}</Badge>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem><Eye className="w-3 h-3 mr-2" /> View</DropdownMenuItem>
                                        {Object.keys(BK_STATUS).filter(s => s !== bk.status).map(s => (
                                            <DropdownMenuItem key={s} onClick={() => updateStatus(bk.id, s)}>→ {s}</DropdownMenuItem>
                                        ))}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-red-600" onClick={() => deleteBooking(bk.id)}><Trash2 className="w-3 h-3 mr-2" /> Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Create Booking Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> New Booking</DialogTitle>
                        <DialogDescription>Create a new booking</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Contact Name *</Label>
                            <Input placeholder="Guest name" value={form.contact} onChange={(e) => setForm(f => ({ ...f, contact: e.target.value }))} />
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
                                <Input type="number" min="1" max="50" value={form.party_size} onChange={(e) => setForm(f => ({ ...f, party_size: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Date *</Label>
                                <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate}>
                            <Plus className="w-4 h-4 mr-1" /> Create Booking
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
